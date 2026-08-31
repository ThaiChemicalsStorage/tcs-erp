import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Collection } from "mongodb";
import { defaultRoles } from "../../src/lib/roles";
import type { Role } from "../../src/lib/roles";

/**
 * Integration test for the RBAC catch-up that an already-provisioned database needs
 * (api/_lib/rbacSeed.ts), against a throwaway in-memory MongoDB. The scenario reproduced here is
 * the real production one: roles were seeded before the Service module existed, so their documents
 * are missing every Service permission and the service_engineer role entirely.
 */

const MIGRATION_ID = "service-permissions-2026-08-06";
const SERVICE_PERMISSION = /^(service|serviceTemplates):/;

let mongod: MongoMemoryServer;
let client: MongoClient;
let roles: Collection<Role>;
let markers: Collection<{ _id: string; appliedAt: string; appliedRoleKeys: string[] }>;
let syncDefaultRoles: () => Promise<void>;
let applyRbacMigrations: () => Promise<void>;

/**
 * ทะเบียนผู้ขาย + ของที่ค้างจาก 2026-08-28 (ดู rbacSeed.ts รายการ purchasing-registers-…)
 *
 * รอบนี้ต่างจาก Service ตรงที่ **ไม่ได้จำลองสถานการณ์ขึ้นมาเอง** — เช็คฐานข้อมูล dev จริงเมื่อ
 * 2026-08-31 แล้วพบว่าทุก role มี purchaseOrder:* และ costControl:* เป็นศูนย์จริง ๆ เมนู "จัดซื้อ"
 * กับ "BD" จึงมองไม่เห็นเลยตั้งแต่วันที่สร้างโมดูล
 */
const PURCHASING_MIGRATION_ID = "purchasing-registers-permissions-2026-08-31";
const PURCHASING_PERMISSION = /^(vendor|purchaseOrder|costControl):/;

/**
 * The roles collection as it looks on a database provisioned before the Service module shipped —
 * and, since 2026-08-31, also before the purchasing/vendor/cost-control permissions existed.
 */
async function seedLegacyRoles(): Promise<void> {
  await roles.deleteMany({});
  await markers.deleteMany({});
  await roles.insertMany(
    defaultRoles
      .filter((r) => r.key !== "service_engineer")
      .map((r) => ({
        ...r,
        permissions: r.permissions.filter((p) => !SERVICE_PERMISSION.test(p) && !PURCHASING_PERMISSION.test(p)),
      })),
  );
}

async function permissionsOf(key: string): Promise<string[]> {
  const role = await roles.findOne({ key });
  return role?.permissions ?? [];
}

/** What `defaultRoles` says this role should end up with — a migrated DB must match a fresh one. */
function expectedServicePermissions(key: string): string[] {
  const role = defaultRoles.find((r) => r.key === key);
  return (role?.permissions ?? []).filter((p) => SERVICE_PERMISSION.test(p));
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  roles = client.db("tcs_erp").collection<Role>("roles");
  markers = client.db("tcs_erp").collection("rbac_migrations");
  // Import AFTER MONGODB_URI points at the memory server.
  const rbacSeed = await import("../../api/_lib/rbacSeed.js");
  syncDefaultRoles = rbacSeed.syncDefaultRoles;
  applyRbacMigrations = rbacSeed.applyRbacMigrations;
});

beforeEach(seedLegacyRoles);

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("syncDefaultRoles (missing default roles on a provisioned database)", () => {
  it("inserts service_engineer and touches nothing else", async () => {
    const before = await roles.countDocuments({});
    const adminBefore = await permissionsOf("administrator");

    await syncDefaultRoles();

    expect(await roles.countDocuments({})).toBe(before + 1);
    const engineer = await roles.findOne({ key: "service_engineer" });
    expect(engineer?.permissions).toEqual(defaultRoles.find((r) => r.key === "service_engineer")?.permissions);
    expect(await permissionsOf("administrator"), "existing roles are never rewritten here").toEqual(adminBefore);
  });

  it("is idempotent — a second run inserts nothing", async () => {
    await syncDefaultRoles();
    const count = await roles.countDocuments({});
    await syncDefaultRoles();
    expect(await roles.countDocuments({})).toBe(count);
    expect(await roles.countDocuments({ key: "service_engineer" })).toBe(1);
  });

  it("declares the unique key index that ensureIndexes() never gets to create in production", async () => {
    await syncDefaultRoles();
    const indexes = await roles.indexes();
    expect(indexes.some((ix) => ix.key?.key === 1 && ix.unique)).toBe(true);
  });
});

describe("applyRbacMigrations (the once-only service permission backfill)", () => {
  it("grants each role exactly what defaultRoles says it should have", async () => {
    await applyRbacMigrations();
    for (const key of ["administrator", "approver_1", "approver_2", "viewer"]) {
      const granted = (await permissionsOf(key)).filter((p) => SERVICE_PERMISSION.test(p)).sort();
      expect(granted, `${key} must match a freshly seeded database`).toEqual(expectedServicePermissions(key).sort());
    }
  });

  it("does not widen a role beyond its defaults — sales_user stays out of Service entirely", async () => {
    await applyRbacMigrations();
    expect((await permissionsOf("sales_user")).filter((p) => SERVICE_PERMISSION.test(p))).toEqual([]);
  });

  it("records the migration so a second run is a complete no-op", async () => {
    await applyRbacMigrations();
    const marker = await markers.findOne({ _id: MIGRATION_ID });
    expect(marker?.appliedRoleKeys).toEqual(["administrator", "approver_1", "approver_2", "viewer"]);

    const snapshot = await permissionsOf("viewer");
    await applyRbacMigrations();
    expect(await permissionsOf("viewer")).toEqual(snapshot);
  });

  it("a permission an admin revokes afterward stays revoked", async () => {
    await applyRbacMigrations();
    await roles.updateOne({ key: "viewer" }, { $pull: { permissions: "service:viewAll" } });

    await applyRbacMigrations();

    expect(await permissionsOf("viewer"), "the whole point of the marker collection").not.toContain("service:viewAll");
  });

  it("skips a role the admin has deleted instead of recreating or throwing", async () => {
    await roles.deleteOne({ key: "viewer" });
    await applyRbacMigrations();
    expect(await roles.findOne({ key: "viewer" })).toBeNull();
    const marker = await markers.findOne({ _id: MIGRATION_ID });
    expect(marker?.appliedRoleKeys).not.toContain("viewer");
  });

  it("leaves the Super Admin role alone — it holds everything implicitly", async () => {
    const before = await permissionsOf("super_admin");
    await applyRbacMigrations();
    expect(await permissionsOf("super_admin")).toEqual(before);
  });
});

describe("applyRbacMigrations (accounting_user gains ar:cancel, 2026-08-18)", () => {
  const AR_CANCEL_MIGRATION_ID = "ar-cancel-for-accounting-user-2026-08-18";

  // Simulates a database provisioned on/after 2026-08-17 (accounting_user already exists via
  // syncDefaultRoles()) but before this fix — the real gap this migration closes.
  beforeEach(async () => {
    await roles.updateOne({ key: "accounting_user" }, { $pull: { permissions: "ar:cancel" } });
  });

  it("grants accounting_user ar:cancel", async () => {
    expect(await permissionsOf("accounting_user")).not.toContain("ar:cancel");
    await applyRbacMigrations();
    expect(await permissionsOf("accounting_user")).toContain("ar:cancel");
  });

  it("does not touch a role that never had ar:* at all", async () => {
    const before = await permissionsOf("sales_user");
    await applyRbacMigrations();
    expect(await permissionsOf("sales_user")).toEqual(before);
  });

  it("records the migration so a second run is idempotent", async () => {
    await applyRbacMigrations();
    const marker = await markers.findOne({ _id: AR_CANCEL_MIGRATION_ID });
    expect(marker?.appliedRoleKeys).toEqual(["accounting_user"]);

    const snapshot = await permissionsOf("accounting_user");
    await applyRbacMigrations();
    expect(await permissionsOf("accounting_user")).toEqual(snapshot);
  });

  it("a permission an admin revokes afterward stays revoked", async () => {
    await applyRbacMigrations();
    await roles.updateOne({ key: "accounting_user" }, { $pull: { permissions: "ar:cancel" } });

    await applyRbacMigrations();

    expect(await permissionsOf("accounting_user")).not.toContain("ar:cancel");
  });

  it("skips the role if an admin has since deleted it", async () => {
    await roles.deleteOne({ key: "accounting_user" });
    await applyRbacMigrations();
    expect(await roles.findOne({ key: "accounting_user" })).toBeNull();
    const marker = await markers.findOne({ _id: AR_CANCEL_MIGRATION_ID });
    expect(marker?.appliedRoleKeys).not.toContain("accounting_user");
  });
});

describe("applyRbacMigrations (Product Stock permissions, 2026-08-18)", () => {
  const STOCK_MIGRATION_ID = "stock-permissions-2026-08-18";
  const STOCK_PERMISSION = /^stock:/;

  beforeEach(async () => {
    await roles.updateMany({}, { $pull: { permissions: { $in: ["stock:view", "stock:adjust"] } } });
  });

  it("grants administrator/accounting_user both stock permissions, viewer only stock:view", async () => {
    await applyRbacMigrations();
    expect((await permissionsOf("administrator")).filter((p) => STOCK_PERMISSION.test(p)).sort()).toEqual(["stock:adjust", "stock:view"]);
    expect((await permissionsOf("accounting_user")).filter((p) => STOCK_PERMISSION.test(p)).sort()).toEqual(["stock:adjust", "stock:view"]);
    expect((await permissionsOf("viewer")).filter((p) => STOCK_PERMISSION.test(p))).toEqual(["stock:view"]);
  });

  it("does not touch a role that never had stock:* at all", async () => {
    const before = await permissionsOf("sales_user");
    await applyRbacMigrations();
    expect(await permissionsOf("sales_user")).toEqual(before);
  });

  it("records the migration so a second run is idempotent", async () => {
    await applyRbacMigrations();
    const marker = await markers.findOne({ _id: STOCK_MIGRATION_ID });
    expect(marker?.appliedRoleKeys.sort()).toEqual(["accounting_user", "administrator", "viewer"]);

    const snapshot = await permissionsOf("administrator");
    await applyRbacMigrations();
    expect(await permissionsOf("administrator")).toEqual(snapshot);
  });

  it("a permission an admin revokes afterward stays revoked", async () => {
    await applyRbacMigrations();
    await roles.updateOne({ key: "accounting_user" }, { $pull: { permissions: "stock:adjust" } });

    await applyRbacMigrations();

    expect(await permissionsOf("accounting_user")).not.toContain("stock:adjust");
    expect(await permissionsOf("accounting_user")).toContain("stock:view");
  });
});

/**
 * ทะเบียนผู้ขาย + สิทธิ์ที่ค้างมาตั้งแต่ 2026-08-28 (`purchasing-registers-permissions-2026-08-31`)
 *
 * รายการนี้ต่างจากรายการอื่นตรงที่ **ปิดบั๊กที่เกิดขึ้นจริงบนเครื่องแล้ว** ไม่ใช่แค่รองรับโมดูลใหม่:
 * เช็ค DB dev เมื่อ 2026-08-31 พบว่าทุก role มี `purchaseOrder:*` = 0 และ `costControl:*` = 0
 * ทำให้กลุ่มเมนู "จัดซื้อ" กับ "BD" ซ่อนตัวเองไปทั้งกลุ่มตั้งแต่วันที่สร้างโมดูล
 */
describe("applyRbacMigrations (vendor register + the purchasing/cost-control backfill)", () => {
  it("gives Administrator every vendor permission a fresh install would have", async () => {
    await applyRbacMigrations();
    const granted = (await permissionsOf("administrator")).filter((p) => p.startsWith("vendor:")).sort();
    expect(granted).toEqual(["vendor:archive", "vendor:create", "vendor:edit", "vendor:view"]);
  });

  it("restores the purchaseOrder and costControl permissions that were missing on the real database", async () => {
    // ก่อนรัน: ไม่มีสักตัว — ตรงกับที่เจอบนเครื่องจริง
    expect((await permissionsOf("administrator")).filter((p) => p.startsWith("purchaseOrder:"))).toEqual([]);
    expect((await permissionsOf("administrator")).filter((p) => p.startsWith("costControl:"))).toEqual([]);

    await applyRbacMigrations();

    const after = await permissionsOf("administrator");
    expect(after.filter((p) => p.startsWith("purchaseOrder:")).sort()).toEqual(
      (defaultRoles.find((r) => r.key === "administrator")?.permissions ?? []).filter((p) => p.startsWith("purchaseOrder:")).sort(),
    );
    expect(after.filter((p) => p.startsWith("costControl:")).sort()).toEqual(
      (defaultRoles.find((r) => r.key === "administrator")?.permissions ?? []).filter((p) => p.startsWith("costControl:")).sort(),
    );
  });

  it("does not widen any other role — only Administrator is granted", async () => {
    await applyRbacMigrations();
    for (const key of ["sales_user", "viewer", "approver_1", "accounting_user"]) {
      expect((await permissionsOf(key)).filter((p) => PURCHASING_PERMISSION.test(p)), key).toEqual([]);
    }
  });

  it("records the migration so a second run is a complete no-op", async () => {
    await applyRbacMigrations();
    const marker = await markers.findOne({ _id: PURCHASING_MIGRATION_ID });
    expect(marker?.appliedRoleKeys).toEqual(["administrator"]);

    const snapshot = await permissionsOf("administrator");
    await applyRbacMigrations();
    expect(await permissionsOf("administrator")).toEqual(snapshot);
  });

  it("a permission an admin revokes afterward stays revoked", async () => {
    await applyRbacMigrations();
    await roles.updateOne({ key: "administrator" }, { $pull: { permissions: "vendor:archive" } });

    await applyRbacMigrations();

    expect(await permissionsOf("administrator")).not.toContain("vendor:archive");
    expect(await permissionsOf("administrator")).toContain("vendor:view");
  });
});

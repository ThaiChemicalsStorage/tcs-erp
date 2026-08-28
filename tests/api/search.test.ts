import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { Role } from "../../src/lib/roles";
import type { AuthContext } from "../../api/_lib/auth";

/**
 * Global Search — first test coverage, added 2026-08-28 alongside the "ค้นหาได้ทุกเอกสาร" expansion
 * from 7 categories to 16. The feature had shipped in 2026-07 with no tests at all, which mattered
 * more once it started reading from eleven more collections.
 *
 * Runs the real searchers against a throwaway in-memory MongoDB, asserting on the documents that
 * actually come back rather than on Mongo operator shapes. What is worth guarding here is not "does
 * regex work" but the three things that would be silent, user-invisible failures:
 *
 * 1. A missing permission returns `[]`, never data.
 * 2. Ownership scoping matches the module's own list page, so search cannot surface a record the
 *    list route hides.
 * 3. The `$and: [ownership, { $or: text }]` guard holds — spreading those two `$or`s into one
 *    object silently drops the ownership half, which is a real leak and an easy regression.
 */

let mongod: MongoMemoryServer;
let client: MongoClient;

type SearchDocuments = typeof import("../../api/_lib/searchDocuments.js");
type SearchShared = typeof import("../../api/_lib/searchShared.js");
let docs: SearchDocuments;
let shared: SearchShared;

const ALICE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const BOB = "bbbbbbbbbbbbbbbbbbbbbbbb";

function roleWith(...permissions: string[]): Role {
  return {
    key: "test_role", name: "Test", description: "",
    permissions: permissions as Role["permissions"], isSuperAdmin: false, isSystem: false,
  };
}

function ctxFor(userId: string, role: Role): AuthContext {
  return { user: { id: userId, department: "", teamId: "" } as AuthContext["user"], role };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  const db = client.db("tcs_erp");

  await db.collection("material_requisitions").insertMany([
    // ฝ่ายโครงการ ของ alice
    { _id: "MR-2569-0001", createdBy: ALICE, ownerDepartment: "project", customerName: "เค ไทย ไฮดรอลิค", jobCode: "PQ202607-174", productName: "", responsibleEmployee: "", jobOrderCode: "", lines: [], status: "Final", isDeleted: false, updatedAt: "2026-08-01T00:00:00.000Z" },
    // ฝ่ายผลิต ของ bob
    { _id: "MR-2569-0002", createdBy: BOB, ownerDepartment: "production", customerName: "เค ไทย ไฮดรอลิค", jobCode: "SC-2026-08-009", productName: "", responsibleEmployee: "", jobOrderCode: "", lines: [], status: "Draft", isDeleted: false, updatedAt: "2026-08-02T00:00:00.000Z" },
    // เอกสารเก่าไม่มี ownerDepartment — ต้องถือเป็นของฝ่ายโครงการ
    { _id: "MR-2569-0003", createdBy: ALICE, customerName: "เค ไทย ไฮดรอลิค", jobCode: "PQ202607-175", productName: "", responsibleEmployee: "", jobOrderCode: "", lines: [], status: "Final", isDeleted: false, updatedAt: "2026-08-03T00:00:00.000Z" },
    // ลบแล้ว ต้องไม่โผล่
    { _id: "MR-2569-0004", createdBy: ALICE, ownerDepartment: "project", customerName: "เค ไทย ไฮดรอลิค", jobCode: "", productName: "", responsibleEmployee: "", jobOrderCode: "", lines: [], status: "Draft", isDeleted: true, updatedAt: "2026-08-04T00:00:00.000Z" },
  ] as never);

  await db.collection("job_orders").insertMany([
    { _id: "JO-2569-0001", createdBy: ALICE, customerName: "อีจ", jobCode: "PQ202607-175", fromSite: "", toSite: "", outOfScope: "", lines: [], status: "Final", isDeleted: false, updatedAt: "2026-08-01T00:00:00.000Z" },
    { _id: "JO-2569-0002", createdBy: BOB, customerName: "อีจ", jobCode: "PQ202607-176", fromSite: "", toSite: "", outOfScope: "", lines: [], status: "Draft", isDeleted: false, updatedAt: "2026-08-02T00:00:00.000Z" },
  ] as never);

  await db.collection("ar_documents").insertMany([
    { docNo: "IV6908001", docType: "IV", reference: "PQ202607-174", customerSnapshot: { companyName: "เค ไทย ไฮดรอลิค", taxId: "", contactName: "" }, lines: [], status: "issued", docDate: "2026-08-10" },
    // ยกเลิกแล้วแต่ยังต้องค้นเจอ — เอกสารบัญชีไม่เคยถูกลบ ใช้สถานะ cancelled แทน
    { docNo: "IV6908002", docType: "IV", reference: "PQ202607-175", customerSnapshot: { companyName: "อีจ", taxId: "", contactName: "" }, lines: [], status: "cancelled", docDate: "2026-08-11" },
  ] as never);

  docs = await import("../../api/_lib/searchDocuments.js");
  shared = await import("../../api/_lib/searchShared.js");
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("detectDocNumberFamily", () => {
  it("recognises each document family by its own prefix", () => {
    expect(shared.detectDocNumberFamily("MR-2569")).toBe("materialRequisition");
    expect(shared.detectDocNumberFamily("JO-2569-0001")).toBe("jobOrder");
    expect(shared.detectDocNumberFamily("PR-2569")).toBe("purchaseRequest");
    expect(shared.detectDocNumberFamily("SC-2026-08")).toBe("productionOrder");
    expect(shared.detectDocNumberFamily("SR-2569")).toBe("serviceReport");
    expect(shared.detectDocNumberFamily("Q#260814")).toBe("quotation");
    expect(shared.detectDocNumberFamily("IV6908001")).toBe("arDocument");
    expect(shared.detectDocNumberFamily("re6908")).toBe("arDocument");
  });

  it("does not hijack ordinary words that happen to start with a letters-only prefix", () => {
    // "REV", "ARM", "BIN" are words; only a digit right after the prefix makes it a document number.
    expect(shared.detectDocNumberFamily("REV")).toBeNull();
    expect(shared.detectDocNumberFamily("ARM")).toBeNull();
    expect(shared.detectDocNumberFamily("BIN")).toBeNull();
    // A bare prefix with nothing after it is not a number yet either.
    expect(shared.detectDocNumberFamily("PR")).toBeNull();
    expect(shared.detectDocNumberFamily("MR-")).toBeNull();
    expect(shared.detectDocNumberFamily("เค ไทย")).toBeNull();
  });
});

describe("searchMaterialRequisitions", () => {
  const viewAll = roleWith("materialRequisition:view", "materialRequisition:viewAll");
  const ownOnly = roleWith("materialRequisition:view");

  it("returns both departments' documents, each tagged so it opens the right page", async () => {
    const rows = await docs.searchMaterialRequisitions("ไฮดรอลิค", ctxFor(ALICE, viewAll), 20);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId["MR-2569-0001"].ownerDepartment).toBe("project");
    expect(byId["MR-2569-0002"].ownerDepartment).toBe("production");
    // เอกสารเก่าที่ไม่มีฟิลด์นี้ ต้อง normalize เป็นฝ่ายโครงการ ไม่ใช่ undefined
    expect(byId["MR-2569-0003"].ownerDepartment).toBe("project");
  });

  it("excludes soft-deleted documents", async () => {
    const rows = await docs.searchMaterialRequisitions("ไฮดรอลิค", ctxFor(ALICE, viewAll), 20);
    expect(rows.map((r) => r.id)).not.toContain("MR-2569-0004");
  });

  it("scopes to the caller's own documents without viewAll — the ownership half of the $and holds", async () => {
    const rows = await docs.searchMaterialRequisitions("ไฮดรอลิค", ctxFor(ALICE, ownOnly), 20);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("MR-2569-0001");
    expect(ids).toContain("MR-2569-0003");
    // bob's document matches the text just as well; only ownership keeps it out.
    expect(ids).not.toContain("MR-2569-0002");
  });

  it("matches on the document number itself, not only on the body fields", async () => {
    const rows = await docs.searchMaterialRequisitions("MR-2569-0002", ctxFor(ALICE, viewAll), 20);
    expect(rows.map((r) => r.id)).toEqual(["MR-2569-0002"]);
  });

  it("honours the result limit", async () => {
    const rows = await docs.searchMaterialRequisitions("ไฮดรอลิค", ctxFor(ALICE, viewAll), 2);
    expect(rows).toHaveLength(2);
  });
});

describe("searchJobOrders", () => {
  it("scopes to own records without viewAll", async () => {
    const all = await docs.searchJobOrders("อีจ", ctxFor(ALICE, roleWith("jobOrder:view", "jobOrder:viewAll")), 20);
    expect(all.map((r) => r.id).sort()).toEqual(["JO-2569-0001", "JO-2569-0002"]);

    const own = await docs.searchJobOrders("อีจ", ctxFor(ALICE, roleWith("jobOrder:view")), 20);
    expect(own.map((r) => r.id)).toEqual(["JO-2569-0001"]);
  });

  it("carries the job code through as the lineage line", async () => {
    const rows = await docs.searchJobOrders("JO-2569-0001", ctxFor(ALICE, roleWith("jobOrder:view")), 20);
    expect(rows[0].lineage).toBe("PQ202607-175");
    expect(rows[0].docNumber).toBe("JO-2569-0001");
  });
});

describe("searchArDocuments", () => {
  it("finds cancelled documents too — an accountant chasing a number still needs them", async () => {
    const rows = await docs.searchArDocuments("IV6908", 20);
    expect(rows.map((r) => r.docNumber).sort()).toEqual(["IV6908001", "IV6908002"]);
    expect(rows.find((r) => r.docNumber === "IV6908002")?.status).toBe("cancelled");
  });

  it("tags each row with its docType so the result opens the right accounting page", async () => {
    const rows = await docs.searchArDocuments("IV6908001", 20);
    expect(rows[0].docType).toBe("IV");
  });
});

describe("searchByDocNumber (the fast path)", () => {
  it("resolves a prefix to the one document it names", async () => {
    const hit = await docs.searchByDocNumber("materialRequisition", "MR-2569-0002", ctxFor(ALICE, roleWith("materialRequisition:view", "materialRequisition:viewAll")));
    expect(hit?.type).toBe("materialRequisition");
    expect(hit?.result.docNumber).toBe("MR-2569-0002");
  });

  it("reapplies ownership — a caller who may not see the document gets null, not a hit", async () => {
    const hit = await docs.searchByDocNumber("materialRequisition", "MR-2569-0002", ctxFor(ALICE, roleWith("materialRequisition:view")));
    expect(hit).toBeNull();
  });

  it("anchors at the start, so a mid-string match is not a document-number hit", async () => {
    const hit = await docs.searchByDocNumber("jobOrder", "2569-0001", ctxFor(ALICE, roleWith("jobOrder:view", "jobOrder:viewAll")));
    expect(hit).toBeNull();
  });

  it("returns null for a number that does not exist", async () => {
    const hit = await docs.searchByDocNumber("jobOrder", "JO-2569-9999", ctxFor(ALICE, roleWith("jobOrder:view", "jobOrder:viewAll")));
    expect(hit).toBeNull();
  });
});

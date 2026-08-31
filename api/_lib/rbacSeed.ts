import { defaultRoles, isPermissionLockedToSuperAdmin } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import { nowIso } from "../../src/lib/products.js";
import { rolesCollection, rbacMigrationsCollection } from "./collections.js";

/** Idempotent: only seeds when the roles collection is empty (fresh DB or first-run setup). */
export async function seedDefaultRolesIfEmpty(): Promise<void> {
  const roles = await rolesCollection();
  const count = await roles.estimatedDocumentCount();
  if (count === 0) {
    await roles.insertMany(defaultRoles.map((r) => ({ ...r })));
  }
}

/**
 * Inserts any role in `defaultRoles` whose key is missing from an already-provisioned database —
 * `seedDefaultRolesIfEmpty()` above only ever fires on an empty collection, so a role added to
 * `defaultRoles` after first run (e.g. `service_engineer`, 2026-08-07) would otherwise never exist
 * in production. Purely additive: an existing role's permissions are never touched here, so an
 * admin's Role Management edits survive. Permission backfills are a separate, once-only concern —
 * see applyRbacMigrations() below.
 */
export async function syncDefaultRoles(): Promise<void> {
  const roles = await rolesCollection();
  // ensureIndexes() (collections.ts) declares this same spec, but only ever runs from the one-time
  // Setup Wizard — unreachable on an already-provisioned deployment, so the unique index may not
  // actually exist there. createIndex is idempotent when the spec matches. Same defensive pattern,
  // and same reason, as seedJobTypesIfEmpty() in systemSeed.ts: it also turns a concurrent
  // double-insert race into an ignorable duplicate-key error instead of a silent duplicate role.
  await roles.createIndex({ key: 1 }, { unique: true });

  const existing = await roles.find({}, { projection: { key: 1 } }).toArray();
  const existingKeys = new Set(existing.map((r) => r.key));
  const missing = defaultRoles.filter((r) => !existingKeys.has(r.key));
  if (missing.length === 0) return;

  try {
    await roles.insertMany(missing.map((r) => ({ ...r })), { ordered: false });
  } catch {
    // A concurrent request inserted the same keys between our read and this write — the unique
    // index rejected our duplicates, which is exactly what it's for; nothing left to do.
  }
}

interface RbacMigration {
  id: string;
  /** roleKey -> permissions to add. Must mirror `defaultRoles` so a fresh DB and a migrated one end up identical. */
  grants: Record<string, Permission[]>;
}

/**
 * Append-only. Each entry runs at most once per database, ever — a permission an admin later
 * revokes in Role Management stays revoked. Never edit or remove a shipped entry; add a new one.
 */
const RBAC_MIGRATIONS: RbacMigration[] = [
  {
    // ทะเบียนผู้ขาย (2026-08-31) **บวกของที่ค้างมาตั้งแต่ 2026-08-28**
    //
    // เช็คฐานข้อมูลจริงเมื่อ 2026-08-31: ทุก role มี `purchaseOrder:*` = 0 และ `costControl:*` = 0
    // แปลว่ากลุ่มเมนู "จัดซื้อ" กับ "BD" มองไม่เห็นเลยตั้งแต่วันที่สร้างโมดูล (กลุ่มซ่อนตัวเองเมื่อ
    // ไม่มีสิทธิ์ดูสักรายการ) — Super Admin ไม่เจออาการเพราะได้ทุกสิทธิ์อัตโนมัติ จึงไม่มีใครสังเกต
    //
    // ตั้งแต่ 2026-08-25 เจ้าของเลือกว่าจะไปติ๊กเองไม่ต้องเขียน migration แต่**เปลี่ยนการตัดสินใจ
    // เมื่อ 2026-08-31** หลังเห็นว่าสองโมดูลติดต่อกันเงียบหายไปทั้งคู่ รายการนี้จึงเก็บทั้งสามชุดไว้
    // ด้วยกัน — ไม่รวม `project:*` 28 ตัวที่ยังค้างอยู่ เพราะเจ้าของยังไม่ได้เปลี่ยนใจเรื่องนั้น
    id: "purchasing-registers-permissions-2026-08-31",
    grants: {
      administrator: [
        "vendor:view", "vendor:create", "vendor:edit", "vendor:archive",
        "purchaseOrder:view", "purchaseOrder:viewAll", "purchaseOrder:create", "purchaseOrder:edit",
        "purchaseOrder:finalize", "purchaseOrder:print", "purchaseOrder:delete",
        "costControl:view", "costControl:viewAll", "costControl:create", "costControl:edit",
        "costControl:finalize", "costControl:print", "costControl:delete",
      ],
    },
  },
  {
    // ใบสั่งผลิต (2026-08-20) — เพิ่ม 7 สิทธิ์เข้า defaultRoles แต่ฐานข้อมูลที่ provision ไปแล้ว
    // มี role document อยู่ครบ syncDefaultRoles() จึงไม่แตะให้ ต้องมี migration นี้เท่านั้น
    // ไม่งั้น Administrator บนเครื่องจริงจะเข้าเมนู "ผลิต" ไม่ได้เลย
    id: "production-order-permissions-2026-08-20",
    grants: {
      administrator: ["productionOrder:view", "productionOrder:viewAll", "productionOrder:create", "productionOrder:edit", "productionOrder:finalize", "productionOrder:print", "productionOrder:delete"],
    },
  },
  {
    // The Service module (2026-08-06) added 11 permissions to `defaultRoles`, but a provisioned
    // database's role documents were frozen at first-run — every module since scopeOfWork had
    // needed a manual Role Management pass to catch up. This is that pass, in code.
    id: "service-permissions-2026-08-06",
    grants: {
      administrator: [
        "service:view", "service:viewAll", "service:create", "service:edit",
        "service:delete", "service:complete", "service:print",
        "serviceTemplates:view", "serviceTemplates:create", "serviceTemplates:edit", "serviceTemplates:archive",
      ],
      approver_1: ["service:view", "service:viewAll", "service:print", "serviceTemplates:view"],
      approver_2: ["service:view", "service:viewAll", "service:print", "serviceTemplates:view"],
      viewer: ["service:view", "service:viewAll", "serviceTemplates:view"],
    },
  },
  {
    // Accounts Receivable (2026-08-17, Phase 1) added 4 permissions and a new "Accounting User"
    // default role — same "already-provisioned database, existing roles frozen at first-run" gap
    // as every module before it. accounting_user is a brand-new role key, handled by
    // syncDefaultRoles() automatically; this migration only needs to backfill the *existing* roles.
    id: "ar-permissions-2026-08-17",
    grants: {
      administrator: ["ar:view", "ar:create", "ar:issue", "ar:cancel"],
      approver_1: ["ar:view", "ar:cancel"],
      approver_2: ["ar:view", "ar:cancel"],
      viewer: ["ar:view"],
    },
  },
  {
    // accounting_user itself (the role real accounting staff actually get) was missing ar:cancel
    // from day one — every OTHER role touched by the migration above got it, but the role meant to
    // issue AR/IV/BI/RE day to day couldn't cancel its own mistakes without an Administrator/
    // Approver. accounting_user is not a brand-new role key here (syncDefaultRoles() already
    // inserted it on 2026-08-17), so this migration is what actually reaches an already-provisioned
    // database — the same gap every "add a permission to an existing role" pass has needed to close.
    id: "ar-cancel-for-accounting-user-2026-08-18",
    grants: {
      accounting_user: ["ar:cancel"],
    },
  },
  {
    // Product Stock (added 2026-08-18) added 2 new permissions to `defaultRoles` — same
    // already-provisioned-database gap as every module before it. administrator/accounting_user
    // get both (accounting cuts stock against IV documents); viewer gets stock:view only, matching
    // its existing view-everything-nothing-else pattern.
    id: "stock-permissions-2026-08-18",
    grants: {
      administrator: ["stock:view", "stock:adjust"],
      accounting_user: ["stock:view", "stock:adjust"],
      viewer: ["stock:view"],
    },
  },
];

/**
 * Applies each not-yet-recorded migration, then records it.
 *
 * Apply-then-mark is deliberate: `$addToSet` is idempotent, so two instances racing — or a crash
 * before the marker lands — costs only a redundant no-op write. The alternative (claim the marker
 * first) would leave a half-applied migration permanently marked as done, with no way to notice.
 */
export async function applyRbacMigrations(): Promise<void> {
  const markers = await rbacMigrationsCollection();
  const applied = new Set((await markers.find({}, { projection: { _id: 1 } }).toArray()).map((m) => m._id));
  const pending = RBAC_MIGRATIONS.filter((m) => !applied.has(m.id));
  if (pending.length === 0) return;

  const roles = await rolesCollection();
  for (const migration of pending) {
    const appliedRoleKeys: string[] = [];
    for (const [key, permissions] of Object.entries(migration.grants)) {
      const grantable = permissions.filter((p) => !isPermissionLockedToSuperAdmin(p));
      if (grantable.length === 0) continue;
      // Super Admin holds every permission implicitly (roleHasPermission short-circuits) and the
      // roles route refuses to edit it at all — leave it alone. A role the admin has since deleted
      // simply matches nothing.
      const result = await roles.updateOne(
        { key, isSuperAdmin: { $ne: true } },
        { $addToSet: { permissions: { $each: grantable } } },
      );
      if (result.matchedCount > 0) appliedRoleKeys.push(key);
    }
    await markers.updateOne(
      { _id: migration.id },
      { $setOnInsert: { appliedAt: nowIso(), appliedRoleKeys } },
      { upsert: true },
    );
  }
}

let bootstrapped = false;

/**
 * One-per-process RBAC catch-up for an already-provisioned database: add missing default roles,
 * then run any unapplied permission migration. Guarded in memory because the call site is
 * `GET /api/roles`, which every authenticated client hits on boot — one check per warm serverless
 * instance / per long-lived Express process is enough, and a deploy that appends to `defaultRoles`
 * or `RBAC_MIGRATIONS` restarts the process anyway.
 */
export async function bootstrapRbac(): Promise<void> {
  if (bootstrapped) return;
  await syncDefaultRoles();
  await applyRbacMigrations();
  bootstrapped = true;
}

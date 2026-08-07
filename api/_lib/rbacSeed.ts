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

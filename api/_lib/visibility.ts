import { usersCollection } from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import type { AuthContext } from "./auth.js";

export type VisibilityScope = "own" | "team" | "department" | "all";

/**
 * Which tier of the 4-tier cascade (2026-08-14, Sales' 2-team split) a caller resolves to for a
 * given module: viewAll (everyone) > viewDepartment (own `User.department`) > viewTeam (own
 * `User.teamId`) > own records only. Exported separately from buildOwnershipClause() so callers
 * that only need to know/display the tier (e.g. the Dashboard's "showing team-only data" banner)
 * don't have to run the member-resolution query that building the actual Mongo filter requires.
 */
export function resolveVisibilityScope(ctx: AuthContext, modulePrefix: "quotations" | "scopeOfWork" | "deliveryOrder"): VisibilityScope {
  if (roleHasPermission(ctx.role, `${modulePrefix}:viewAll`)) return "all";
  if (roleHasPermission(ctx.role, `${modulePrefix}:viewDepartment`) && ctx.user.department) return "department";
  if (roleHasPermission(ctx.role, `${modulePrefix}:viewTeam`) && ctx.user.teamId) return "team";
  return "own";
}

/**
 * Mongo filter implementing resolveVisibilityScope()'s cascade for list queries. Department/team
 * tiers match on `User.department`/`User.teamId` directly (department matched as free text — same
 * join the Dashboard's department filter already relies on, not via the Teams collection) rather
 * than resolving "all teams under this department" first. Legacy/seed records with an empty owner
 * field are ownerless and stay visible to everyone at every tier, matching the pre-existing
 * `viewAll`-only behavior this replaces.
 */
export async function buildOwnershipClause(
  ctx: AuthContext,
  modulePrefix: "quotations" | "scopeOfWork" | "deliveryOrder",
  ownerField: string,
): Promise<Record<string, unknown>> {
  const scope = resolveVisibilityScope(ctx, modulePrefix);
  if (scope === "all") return {};

  if (scope === "department" || scope === "team") {
    const users = await usersCollection();
    const peerFilter = scope === "department" ? { department: ctx.user.department } : { teamId: ctx.user.teamId };
    const peers = await users.find(peerFilter, { projection: { _id: 1 } }).toArray();
    const ids = peers.map((u) => u._id.toString());
    return { $or: [{ [ownerField]: { $in: ids } }, { [ownerField]: "" }] };
  }

  return { $or: [{ [ownerField]: ctx.user.id }, { [ownerField]: "" }] };
}

/**
 * Binary own-vs-viewAll filter (added 2026-08-18, Project module Stage 3) — for modules with no
 * team/department visibility tiers. Stage 2 deliberately gave `project`/`materialRequisition`/
 * `jobOrder`/`purchaseRequest` only `:view`/`:viewAll` (no `:viewTeam`/`:viewDepartment`), since the
 * departments this module serves (Project/Store/Factory/Purchasing) don't have Sales' team-lead
 * structure — so `buildOwnershipClause()` above can't be reused as-is (its `modulePrefix` union is
 * fixed to the 3 modules that actually have all 4 tiers, and `${modulePrefix}:viewTeam`/
 * `:viewDepartment` must be real `Permission` keys for it to type-check). Same pre-2026-08-14
 * own-vs-viewAll shape every module used before the tiered cascade existed.
 */
export function buildSimpleOwnershipClause(userId: string, hasViewAll: boolean, ownerField: string): Record<string, unknown> {
  if (hasViewAll) return {};
  return { $or: [{ [ownerField]: userId }, { [ownerField]: "" }] };
}

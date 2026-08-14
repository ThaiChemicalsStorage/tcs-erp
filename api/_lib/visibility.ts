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

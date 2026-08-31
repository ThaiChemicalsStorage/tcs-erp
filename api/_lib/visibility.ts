import { usersCollection } from "./collections.js";
import { roleHasPermission } from "../../src/lib/roles.js";
import type { AuthContext } from "./auth.js";
import { scopeOfWorksCollection } from "./collections.js";
import { ALL_RECIPIENT_KEYS } from "../../src/lib/documentRequirements.js";

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

/**
 * id ของ Scope of Work ทุกใบที่ผู้ใช้คนนี้ถูกเลือกไว้เป็น "ผู้รับเอกสาร" — ว่างได้ (2026-08-31)
 *
 * เกิดจากคำสั่งของเจ้าของว่า *"Scope of work เวลาที่จะส่งไปให้คนอื่น มันจะมาพร้อมกับ Cost control ด้วย"*
 * Cost Control เดิมมองเห็นได้แค่สองทาง — เป็นคนสร้างเอง หรือมี `costControl:viewAll` — คนที่ถูกส่ง
 * Scope ถึงจึงไม่มีทางเจอใบต้นทุนที่ผูกกับ Scope ใบนั้น · เอาผลของฟังก์ชันนี้ไปรวมกับ clause เดิม
 * ในรูป `{ scopeOfWorkId: { $in: ids } }`
 *
 * `$or` สร้างจาก `ALL_RECIPIENT_KEYS` เสมอ ไม่ใช่จากรายชื่อแผนกอย่างเดียว ไม่งั้นคนที่ถูกเลือกผ่าน
 * "ผู้รับเพิ่มเติม" จะได้กระดิ่งแต่หาเอกสารไม่เจอ — กติกาเดียวกับที่คอมเมนต์ของ `ALL_RECIPIENT_KEYS`
 * (`src/lib/documentRequirements.ts`) ระบุไว้
 *
 * **ต้องใช้ทุกที่ที่กรองการมองเห็นของ Cost Control** — วันนี้คือรายการของโมดูล และ Global Search
 * ทั้งสองทาง (ค้นทั่วไป + ทางลัดค้นด้วยเลขเอกสาร) ที่ไหนพลาดไป ที่นั่นจะกลายเป็น
 * "เห็นในรายการแต่ค้นไม่เจอ"
 */
export async function recipientScopeOfWorkIds(ctx: AuthContext): Promise<string[]> {
  const scopes = await scopeOfWorksCollection();
  const docs = await scopes.find(
    { isDeleted: false, $or: ALL_RECIPIENT_KEYS.map((key) => ({ [`documentRecipients.${key}`]: ctx.user.id })) },
    { projection: { _id: 1 } },
  ).toArray();
  return docs.map((d) => d._id.toString());
}

/**
 * clause การมองเห็นของ Cost Control — เจ้าของใบ / `costControl:viewAll` / **เป็นผู้รับเอกสารของ
 * Scope ที่ใบนั้นผูกอยู่** (ทางที่สาม เพิ่ม 2026-08-31)
 *
 * รวมเข้าไปใน `$or` เดิม **ไม่ spread ทับ** — การ spread สองอันจะทำให้อันหลังลบอันแรกทิ้งเงียบ ๆ
 * (บั๊กเดียวกับที่แก้ใน MR/PR เมื่อ 2026-08-20i) · clause เดิมเป็น `{}` แปลว่ามี `viewAll`
 * เห็นทุกใบอยู่แล้ว ไม่ต้องรวมอะไร
 */
export async function buildCostControlVisibilityClause(ctx: AuthContext, hasViewAll: boolean): Promise<Record<string, unknown>> {
  const ownership = buildSimpleOwnershipClause(ctx.user.id, hasViewAll, "createdBy");
  if (!("$or" in ownership)) return ownership;
  const scopeIds = await recipientScopeOfWorkIds(ctx);
  if (scopeIds.length === 0) return ownership;
  return { $or: [...(ownership.$or as Record<string, unknown>[]), { scopeOfWorkId: { $in: scopeIds } }] };
}

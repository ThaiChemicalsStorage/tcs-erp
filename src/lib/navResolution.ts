import type { User } from "./users";
import { type Role, hasPermission, isNavHiddenForUser } from "./roles";
import type { Permission } from "./permissions";

/**
 * ตัดสินว่า "จะแสดงหน้าไหน" จากหน้าที่ผู้ใช้ขอมา + สิทธิ์ที่มี — แยกออกมาจาก App.tsx เมื่อ 2026-08-25
 *
 * Decides which page actually renders, given the one the URL asked for and what this user may see.
 * Split out of `App.tsx` so the rule can be tested directly: it caused a user-visible bug twice, and
 * both times the mistake was invisible in a screenshot taken a second later.
 *
 * **The rule that matters: while `rolesReady` is false, nothing is decided.** Every permission check
 * takes `roles`, and during boot there is a real window where the session has resolved (so the app
 * shell renders) but `fetchRoles()` has not. In that window `hasPermission()` answers "no" to
 * everything — not because the user lacks access, but because the answer isn't known yet. Deriving
 * a fallback from those answers produces "settings" (the last-resort home when no nav item is
 * visible), so a refresh on any other page visibly flashed Settings and then snapped back.
 *
 * A 2026-08-17 fix stopped that flash reaching the *URL* but not the *screen*; the screen half was
 * reported again on 2026-08-25 ("กดรีเฟรชแล้วมันเด้งไปตั้งค่าแล้วกลับมา"). Hence this module and its
 * tests — `resolveNav` returns `decided: false` while roles are unknown, and callers are expected to
 * render a loading state rather than any page at all.
 */

export interface NavCandidate<K extends string> {
  key: K;
  permission?: Permission;
}

export interface NavResolution<K extends string, T extends NavCandidate<K>> {
  /** รายการเมนูที่ผู้ใช้คนนี้เห็นจริง (ว่างเสมอถ้ายังไม่รู้สิทธิ์) — คงชนิดเดิมของ item ไว้ (icon/label ฯลฯ) */
  visibleNavItems: T[];
  /** หน้าแรกที่ role นี้เห็น ใช้เป็นทั้งหน้าเริ่มต้นและหน้าปลายทางเวลา fallback */
  homeNav: K;
  /** หน้าที่จะเรนเดอร์จริง */
  effectiveNav: K;
  /** false = ยังไม่รู้สิทธิ์ ผู้เรียกควรแสดงสถานะกำลังโหลด ไม่ใช่เรนเดอร์หน้าใด ๆ */
  decided: boolean;
}

/**
 * @param rolesReady ต้องเป็น false ตราบใดที่ `fetchRoles()` ยังไม่ตอบ (ทั้งสำเร็จและล้มเหลว)
 */
export function resolveNav<K extends string, T extends NavCandidate<K>>({
  activeNav,
  navItems,
  currentUser,
  roles,
  rolesReady,
  settingsKey,
}: {
  activeNav: K;
  navItems: readonly T[];
  currentUser: User | null;
  roles: Role[];
  rolesReady: boolean;
  /** คีย์ของหน้าตั้งค่า — เข้าได้เสมอ และเป็น fallback สุดท้ายเมื่อไม่มีเมนูอื่นให้เห็นเลย */
  settingsKey: K;
}): NavResolution<K, T> {
  // ยังไม่รู้สิทธิ์: คงหน้าที่ผู้ใช้ขอไว้ อย่าเดา และอย่าบอกว่าตัดสินแล้ว
  // Roles unknown: hold the requested page, decide nothing, and say so.
  if (!rolesReady) {
    return { visibleNavItems: [], homeNav: settingsKey, effectiveNav: activeNav, decided: false };
  }

  // Two independent filters: permission (can this user reach the page at all) and per-role nav
  // hiding (should this role be *offered* it — presentation only, see isNavHiddenForRole).
  const visibleNavItems = navItems.filter((item) =>
    (!item.permission || hasPermission(currentUser, roles, item.permission))
    && !isNavHiddenForUser(currentUser, roles, item.key));

  // Whichever nav item this role actually sees first — the landing page and the fallback both use it
  // instead of a hardcoded "dashboard", so a role without Dashboard in its sidebar can never end up
  // sitting on a page it has no way to navigate back to.
  const homeNav: K = visibleNavItems[0]?.key ?? settingsKey;

  const activeNavItem = navItems.find((n) => n.key === activeNav);
  const activeNavAllowed = activeNav === settingsKey
    || ((!activeNavItem?.permission || hasPermission(currentUser, roles, activeNavItem.permission))
      && !isNavHiddenForUser(currentUser, roles, activeNav));

  return {
    visibleNavItems: [...visibleNavItems],
    homeNav,
    effectiveNav: activeNavAllowed ? activeNav : homeNav,
    decided: true,
  };
}

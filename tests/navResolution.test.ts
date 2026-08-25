import { describe, it, expect } from "vitest";
import { resolveNav, type NavCandidate } from "../src/lib/navResolution";
import { defaultRoles, type Role } from "../src/lib/roles";
import type { User } from "../src/lib/users";

/**
 * กันอาการ "กดรีเฟรชแล้วเด้งไปหน้าตั้งค่าแล้วค่อยกลับมา" ไม่ให้กลับมาอีก (เพิ่ม 2026-08-25)
 *
 * Guards the refresh-flashes-Settings bug, which has now been reported twice.
 *
 * The first fix (2026-08-17c) gated the effect that mirrors the page into the URL, which stopped the
 * *hash* from being rewritten — and the fix was signed off on that basis. But `effectiveNav` is
 * recomputed on every render and still fell back to Settings during the same window, so the *screen*
 * kept flashing. It was reported again on 2026-08-25 with exactly the same words.
 *
 * The lesson these tests encode: the window is short (one network round trip), so it is invisible in
 * any check that looks at the finished page — including a browser screenshot taken a second later,
 * which is how it passed verification the first time. Asserting on the decision function is the only
 * check that actually sees it.
 */

type Nav = "dashboard" | "quotations" | "products" | "settings";

const NAV_ITEMS: NavCandidate<Nav>[] = [
  { key: "dashboard", permission: "dashboard:view" },
  { key: "quotations", permission: "quotations:view" },
  { key: "products", permission: "products:view" },
  { key: "settings" },
];

const SETTINGS: Nav = "settings";

function userWithRole(roleKey: string): User {
  return { id: "u1", fullName: "Test User", roleKey, isActive: true } as unknown as User;
}

/** A role that can see Quotations and Products but not the Dashboard. */
const salesRole: Role = {
  ...defaultRoles[0],
  key: "sales_test",
  name: "Sales (test)",
  isSuperAdmin: false,
  permissions: ["quotations:view", "products:view"],
} as Role;

describe("nav resolution while roles are still loading", () => {
  const user = userWithRole("sales_test");

  it("holds the requested page instead of guessing — this is the actual bug", () => {
    const r = resolveNav<Nav, NavCandidate<Nav>>({
      activeNav: "products",
      navItems: NAV_ITEMS,
      currentUser: user,
      roles: [], // fetchRoles() has not resolved yet — every permission check answers "no"
      rolesReady: false,
      settingsKey: SETTINGS,
    });
    // Before the fix this returned "settings": with no roles, nothing is visible, so homeNav fell
    // back to Settings and the requested page was treated as forbidden.
    expect(r.effectiveNav).toBe("products");
    expect(r.effectiveNav).not.toBe("settings");
  });

  it("reports that it has NOT decided, so the caller renders a loading state, not a page", () => {
    const r = resolveNav<Nav, NavCandidate<Nav>>({
      activeNav: "quotations", navItems: NAV_ITEMS, currentUser: user,
      roles: [], rolesReady: false, settingsKey: SETTINGS,
    });
    expect(r.decided).toBe(false);
    // Rendering a page from these would show a permission-less version of it for a moment.
    expect(r.visibleNavItems).toEqual([]);
  });

  it("holds every page equally, not just the one that happened to be reported", () => {
    for (const nav of ["dashboard", "quotations", "products", "settings"] as Nav[]) {
      const r = resolveNav<Nav, NavCandidate<Nav>>({
        activeNav: nav, navItems: NAV_ITEMS, currentUser: user,
        roles: [], rolesReady: false, settingsKey: SETTINGS,
      });
      expect(r.effectiveNav).toBe(nav);
    }
  });
});

describe("nav resolution once roles are known", () => {
  const user = userWithRole("sales_test");
  const roles = [salesRole];

  it("keeps a page the user may see", () => {
    const r = resolveNav<Nav, NavCandidate<Nav>>({
      activeNav: "products", navItems: NAV_ITEMS, currentUser: user,
      roles, rolesReady: true, settingsKey: SETTINGS,
    });
    expect(r.effectiveNav).toBe("products");
    expect(r.decided).toBe(true);
  });

  it("redirects a page the user genuinely may not see, to their own first visible page", () => {
    const r = resolveNav<Nav, NavCandidate<Nav>>({
      activeNav: "dashboard", // no dashboard:view in this role
      navItems: NAV_ITEMS, currentUser: user, roles, rolesReady: true, settingsKey: SETTINGS,
    });
    // Not "settings" — the first page this role actually sees, so they land somewhere usable.
    expect(r.effectiveNav).toBe("quotations");
    expect(r.homeNav).toBe("quotations");
  });

  it("Settings is always reachable, even for a role holding no permissions at all", () => {
    const noneRole = { ...salesRole, key: "none_test", permissions: [] } as Role;
    const r = resolveNav<Nav, NavCandidate<Nav>>({
      activeNav: "settings", navItems: NAV_ITEMS, currentUser: userWithRole("none_test"),
      roles: [noneRole], rolesReady: true, settingsKey: SETTINGS,
    });
    expect(r.effectiveNav).toBe("settings");
    expect(r.homeNav).toBe("settings");
  });

  it("a failed roles fetch still counts as decided — it must not hang on the loading state", () => {
    // rolesReady is "not loading", i.e. ready OR error. An error must resolve, not spin forever.
    const r = resolveNav<Nav, NavCandidate<Nav>>({
      activeNav: "products", navItems: NAV_ITEMS, currentUser: user,
      roles: [], rolesReady: true, settingsKey: SETTINGS,
    });
    expect(r.decided).toBe(true);
    expect(r.effectiveNav).toBe("settings"); // nothing visible, so the last-resort home
  });
});

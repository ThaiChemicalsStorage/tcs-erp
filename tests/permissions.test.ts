import { describe, it, expect } from "vitest";
import {
  defaultRoles, findRole, roleHasPermission, hasPermission, userIsSuperAdmin,
  isPermissionLockedToSuperAdmin, sanitizeRolePermissions,
  isNavHiddenForRole, isNavHiddenForUser, type Role,
} from "../src/lib/roles";
import {
  ALL_PERMISSIONS, PERMISSION_DEPENDENCIES, permissionsRequiring, withPermissionDependencies,
  type Permission,
} from "../src/lib/permissions";
import type { User } from "../src/lib/users";

function userWithRole(roleKey: string): User {
  return {
    id: "u1", employeeId: "E001", fullName: "Test User", username: "test", email: "t@t.co",
    phone: "", department: "", position: "", roleKey, status: "active",
    profilePictureDataUrl: "", signatureDataUrl: "", createdAt: "", updatedAt: "",
  };
}

describe("default role grants (the RBAC baseline every server check builds on)", () => {
  const role = (key: string) => {
    const r = findRole(defaultRoles, key);
    expect(r, `default role "${key}" must exist`).toBeDefined();
    return r as Role;
  };

  it("super_admin implicitly holds every permission, including ones added later", () => {
    const admin = role("super_admin");
    for (const p of ALL_PERMISSIONS) expect(roleHasPermission(admin, p)).toBe(true);
  });

  it("sales_user can create/edit quotations but never approve, reject, or see others' quotes", () => {
    const sales = role("sales_user");
    expect(roleHasPermission(sales, "quotations:create")).toBe(true);
    expect(roleHasPermission(sales, "quotations:edit")).toBe(true);
    expect(roleHasPermission(sales, "quotations:approve")).toBe(false);
    expect(roleHasPermission(sales, "quotations:reject")).toBe(false);
    expect(roleHasPermission(sales, "quotations:viewAll")).toBe(false);
    expect(roleHasPermission(sales, "scopeOfWork:viewAll")).toBe(false);
    expect(roleHasPermission(sales, "scopeOfWork:finalize")).toBe(false);
    // Chasing targets the salesperson — sales don't chase themselves (2026-07-29 owner decision).
    expect(roleHasPermission(sales, "scopeOfWork:chasePo")).toBe(false);
    expect(roleHasPermission(sales, "users:manage")).toBe(false);
  });

  it("both approver levels can approve/reject and see everyone's documents", () => {
    for (const key of ["approver_1", "approver_2"]) {
      const approver = role(key);
      expect(roleHasPermission(approver, "quotations:approve")).toBe(true);
      expect(roleHasPermission(approver, "quotations:reject")).toBe(true);
      expect(roleHasPermission(approver, "quotations:viewAll")).toBe(true);
      expect(roleHasPermission(approver, "scopeOfWork:finalize")).toBe(true);
      expect(roleHasPermission(approver, "scopeOfWork:chasePo")).toBe(true);
      expect(roleHasPermission(approver, "quotations:create")).toBe(false);
    }
  });

  it("administrator can chase PO numbers", () => {
    expect(roleHasPermission(role("administrator"), "scopeOfWork:chasePo")).toBe(true);
  });

  it("service_engineer can run a service job end to end but only sees their own reports", () => {
    const engineer = role("service_engineer");
    for (const p of ["service:view", "service:create", "service:edit", "service:complete", "service:print"] as const) {
      expect(roleHasPermission(engineer, p), `service engineer needs ${p}`).toBe(true);
    }
    expect(roleHasPermission(engineer, "customers:view"), "the report editor's customer selector").toBe(true);
    expect(roleHasPermission(engineer, "service:viewAll"), "own reports only, like sales_user's own quotes").toBe(false);
    expect(roleHasPermission(engineer, "service:delete")).toBe(false);
    expect(roleHasPermission(engineer, "serviceTemplates:edit"), "reads templates, never edits the masters").toBe(false);
    expect(roleHasPermission(engineer, "quotations:create")).toBe(false);
    expect(roleHasPermission(engineer, "users:manage")).toBe(false);
  });

  it("every role that can create a service report can also read service templates", () => {
    // ServiceReportEditor's boot Promise.all calls fetchServiceTemplates() — a role with
    // service:create but no serviceTemplates:view gets an editor that fails to load at all.
    for (const r of defaultRoles) {
      if (roleHasPermission(r, "service:create")) {
        expect(roleHasPermission(r, "serviceTemplates:view"), `${r.key} would get a broken editor`).toBe(true);
      }
    }
  });

  it("viewer is strictly read-only", () => {
    const viewer = role("viewer");
    expect(roleHasPermission(viewer, "quotations:view")).toBe(true);
    expect(roleHasPermission(viewer, "scopeOfWork:chasePo"), "chasing sends a notification — not read-only").toBe(false);
    for (const p of ALL_PERMISSIONS) {
      if (/(create|edit|delete|approve|reject|finalize|manage|import|chase)/.test(p)) {
        expect(roleHasPermission(viewer, p), `viewer must not hold ${p}`).toBe(false);
      }
    }
  });
});

describe("per-role nav hiding (presentation only — never a permission change)", () => {
  const role = (key: string) => {
    const r = findRole(defaultRoles, key);
    expect(r, `default role "${key}" must exist`).toBeDefined();
    return r as Role;
  };

  it("hides only the standalone Customers page from the Service Engineer's navigation", () => {
    const engineer = role("service_engineer");
    expect(isNavHiddenForRole(engineer, "customers")).toBe(true);
    // Restored 2026-08-07 after the original "engineers see only บริการ" instruction was withdrawn.
    expect(isNavHiddenForRole(engineer, "dashboard"), "Dashboard is visible again").toBe(false);
    expect(isNavHiddenForRole(engineer, "service"), "its own module must stay visible").toBe(false);
    expect(isNavHiddenForRole(engineer, "serviceTemplates")).toBe(false);
  });

  it("keeps the underlying permissions granted — hiding a nav item must not revoke anything", () => {
    const engineer = role("service_engineer");
    // customers:view is load-bearing: ServiceReportEditor's CustomerSelector fetches the customer
    // list, so revoking it would break report creation for exactly the role this hiding targets.
    expect(roleHasPermission(engineer, "customers:view")).toBe(true);
    expect(roleHasPermission(engineer, "dashboard:view")).toBe(true);
  });

  it("applies to no other default role", () => {
    for (const r of defaultRoles) {
      if (r.key === "service_engineer") continue;
      expect(isNavHiddenForRole(r, "customers"), `${r.key} must be unaffected`).toBe(false);
    }
  });

  it("hides nothing from any role that the rule doesn't name", () => {
    // Guards against a future entry being added too broadly — Dashboard was hidden here once and
    // withdrawn, so "no role hides Dashboard" is worth asserting rather than assuming.
    for (const r of defaultRoles) {
      expect(isNavHiddenForRole(r, "dashboard"), `${r.key} must not hide Dashboard`).toBe(false);
    }
  });

  it("a custom role does not inherit the rule, and a missing role is never 'hidden'", () => {
    const custom: Role = {
      key: "role_abc", name: "Custom Field Tech", description: "",
      permissions: ["service:view", "service:create", "customers:view"], isSuperAdmin: false, isSystem: false,
    };
    expect(isNavHiddenForRole(custom, "customers"), "scoped to service_engineer by key, deliberately").toBe(false);
    expect(isNavHiddenForRole(undefined, "customers")).toBe(false);
  });

  it("resolves through a user's roleKey the way the sidebar does", () => {
    expect(isNavHiddenForUser(userWithRole("service_engineer"), defaultRoles, "customers")).toBe(true);
    expect(isNavHiddenForUser(userWithRole("sales_user"), defaultRoles, "customers")).toBe(false);
    expect(isNavHiddenForUser(null, defaultRoles, "customers")).toBe(false);
  });

  it("leaves at least one visible nav item, so there is always somewhere to land", () => {
    // App.tsx derives its landing page from the first visible nav item; a role whose every item was
    // hidden would fall back to Settings, but Service Engineer must land on its own module.
    const engineer = role("service_engineer");
    const reachable = ["service", "serviceTemplates"].filter(
      (nav) => !isNavHiddenForRole(engineer, nav),
    );
    expect(reachable.length).toBeGreaterThan(0);
  });
});

describe("permission dependencies (permissions whose screen hard-fails without another)", () => {
  it("auto-includes serviceTemplates:view behind every service permission that opens the editor", () => {
    for (const p of ["service:view", "service:create", "service:edit"] as const) {
      expect(withPermissionDependencies([p]), `${p} opens ServiceReportEditor`).toContain("serviceTemplates:view");
    }
  });

  it("leaves an already-complete list untouched, order included", () => {
    const input: Permission[] = ["service:view", "serviceTemplates:view", "dashboard:view"];
    expect(withPermissionDependencies(input)).toEqual(input);
  });

  it("deduplicates and appends additions after the original entries", () => {
    expect(withPermissionDependencies(["service:create", "service:edit", "service:create"]))
      .toEqual(["service:create", "service:edit", "serviceTemplates:view"]);
  });

  it("does not invent dependencies for unrelated permissions", () => {
    expect(withPermissionDependencies(["products:view"])).toEqual(["products:view"]);
    expect(withPermissionDependencies([])).toEqual([]);
  });

  it("every declared dependency is a real permission, and none is Super-Admin-locked", () => {
    // A locked dependency would be filtered straight back out by sanitizeRolePermissions(),
    // leaving the dependent permission broken with no way for an admin to fix it.
    for (const [key, deps] of Object.entries(PERMISSION_DEPENDENCIES)) {
      expect(ALL_PERMISSIONS, `${key} is not a real permission`).toContain(key);
      for (const dep of deps ?? []) {
        expect(ALL_PERMISSIONS, `${key} depends on unknown ${dep}`).toContain(dep);
        expect(isPermissionLockedToSuperAdmin(dep), `${key} depends on locked ${dep}`).toBe(false);
      }
    }
  });

  it("permissionsRequiring names what would break, so the UI can pin the checkbox", () => {
    const held: Permission[] = ["service:create", "serviceTemplates:view", "products:view"];
    expect(permissionsRequiring("serviceTemplates:view", held)).toEqual(["service:create"]);
    expect(permissionsRequiring("products:view", held)).toEqual([]);
  });

  it("sanitizeRolePermissions adds dependencies but never a Super-Admin-only permission", () => {
    const cleaned = sanitizeRolePermissions(["service:create", "roles:manage", "company:manage"] as Permission[]);
    expect(cleaned).toContain("serviceTemplates:view");
    expect(cleaned).not.toContain("roles:manage");
    expect(cleaned).not.toContain("company:manage");
  });

  it("every default role already satisfies its own dependencies", () => {
    for (const r of defaultRoles) {
      if (r.isSuperAdmin) continue;
      expect(sanitizeRolePermissions(r.permissions).sort(), `${r.key} is missing a dependency`)
        .toEqual([...r.permissions].sort());
    }
  });
});

describe("permission lookup edge cases (the failure modes a server 403 depends on)", () => {
  it("no user / unknown role / missing role all deny instead of throwing", () => {
    expect(hasPermission(null, defaultRoles, "quotations:view")).toBe(false);
    expect(hasPermission(userWithRole("nonexistent_role"), defaultRoles, "quotations:view")).toBe(false);
    expect(roleHasPermission(undefined, "quotations:view")).toBe(false);
  });

  it("userIsSuperAdmin is driven by the role flag, not the role name", () => {
    expect(userIsSuperAdmin(userWithRole("super_admin"), defaultRoles)).toBe(true);
    expect(userIsSuperAdmin(userWithRole("administrator"), defaultRoles)).toBe(false);
    const fakeAdmin: Role = {
      key: "custom", name: "Super Admin", description: "", permissions: [], isSuperAdmin: false, isSystem: false,
    };
    expect(userIsSuperAdmin(userWithRole("custom"), [fakeAdmin]), "a role merely NAMED Super Admin must not be one").toBe(false);
  });

  it("a custom role only holds exactly what it was granted", () => {
    const custom: Role = {
      key: "custom", name: "Custom", description: "", permissions: ["products:view"], isSuperAdmin: false, isSystem: false,
    };
    expect(roleHasPermission(custom, "products:view")).toBe(true);
    expect(roleHasPermission(custom, "products:edit")).toBe(false);
  });
});

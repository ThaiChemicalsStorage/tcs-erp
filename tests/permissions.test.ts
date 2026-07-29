import { describe, it, expect } from "vitest";
import { defaultRoles, findRole, roleHasPermission, hasPermission, userIsSuperAdmin, type Role } from "../src/lib/roles";
import { ALL_PERMISSIONS } from "../src/lib/permissions";
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

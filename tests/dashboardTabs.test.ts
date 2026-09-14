import { describe, it, expect } from "vitest";
import { defaultRoles, roleHasPermission } from "../src/lib/roles";
import {
  DASHBOARD_TAB_RULES, canSeeDepartmentBlock, dashboardTabHash, normalizeDashboardTab, resolveInitialTab, tabFromHash,
  tabOfDepartment, visibleDashboardTabs, type DashboardTabKey,
} from "../src/lib/dashboardTabs";
import type { Permission } from "../src/lib/permissions";
import { navKeyFromHash } from "../src/lib/navResolution";

/**
 * แท็บแผนกของแดชบอร์ด (2026-09-14) — ใครเห็นแท็บไหน และแท็บที่เปิดตอนเข้าหน้า
 *
 * The rules in `src/lib/dashboardTabs.ts` gate both the tab bar and the server's per-department
 * blocks, so a mistake here either hides a department from the people who run it or shows one to
 * someone whose server response is all `null`. Pinned against the real default roles rather than
 * hand-built ones, because "which of our actual roles sees what" is the question the owner asks.
 */

const tabsFor = (roleKey: string): DashboardTabKey[] => {
  const role = defaultRoles.find((r) => r.key === roleKey);
  if (!role) throw new Error(`no default role ${roleKey}`);
  return visibleDashboardTabs((p) => roleHasPermission(role, p));
};

const only = (...granted: Permission[]) => (p: Permission) => granted.includes(p);

describe("แท็บที่แต่ละบทบาทเห็น", () => {
  it("Super Admin เห็นครบทุกแท็บ ตามลำดับที่แสดง — 7 แท็บ (ผลิต · โครงการ · BD รวมเป็นแท็บเดียว)", () => {
    expect(tabsFor("super_admin")).toEqual(DASHBOARD_TAB_RULES.map((r) => r.key));
    expect(tabsFor("super_admin")).toEqual(["overview", "sales", "service", "purchasing", "inventory", "operations", "accounting"]);
  });

  it("ภาพรวมขึ้นเสมอ และเป็นแท็บแรก", () => {
    for (const role of defaultRoles) expect(tabsFor(role.key)[0]).toBe("overview");
  });

  it("ฝ่ายขายเห็นแค่ภาพรวมกับขาย — products:view ไม่ได้เปิดแท็บคลังสินค้า", () => {
    expect(tabsFor("sales_user")).toEqual(["overview", "sales"]);
  });

  it("ช่างบริการไม่เห็นแท็บขาย (เคยเห็นแดชบอร์ดขายที่เป็นศูนย์ล้วน) แต่เห็นแท็บบริการ", () => {
    expect(tabsFor("service_engineer")).toEqual(["overview", "service"]);
  });

  it("ฝ่ายบัญชีเห็นคลังสินค้า (มี stock:view) กับบัญชี แต่ไม่เห็นขาย", () => {
    expect(tabsFor("accounting_user")).toEqual(["overview", "inventory", "accounting"]);
  });

  it("ผู้อนุมัติและผู้ดูเห็นตามสิทธิ์ดูที่ถืออยู่", () => {
    expect(tabsFor("approver_1")).toEqual(["overview", "sales", "service", "accounting"]);
    expect(tabsFor("viewer")).toEqual(["overview", "sales", "service", "inventory", "accounting"]);
  });
});

describe("แท็บรวม ผลิต · โครงการ · BD", () => {
  it("เปิดเมื่อเห็นแผนกใดแผนกหนึ่ง แต่บล็อกข้างในยังแยกสิทธิ์รายแผนก", () => {
    const productionOnly = only("productionOrder:view");
    expect(visibleDashboardTabs(productionOnly)).toEqual(["overview", "operations"]);
    expect(canSeeDepartmentBlock("production", productionOnly)).toBe(true);
    expect(canSeeDepartmentBlock("project", productionOnly)).toBe(false);
    expect(canSeeDepartmentBlock("bd", productionOnly)).toBe(false);

    expect(visibleDashboardTabs(only("costControl:view"))).toEqual(["overview", "operations"]);
    expect(visibleDashboardTabs(only("project:view"))).toEqual(["overview", "operations"]);
  });

  it("การ์ดแผนกในภาพรวมพาไปแท็บที่ถูก", () => {
    expect(tabOfDepartment("production")).toBe("operations");
    expect(tabOfDepartment("bd")).toBe("operations");
    expect(tabOfDepartment("purchasing")).toBe("purchasing");
  });

  it("ชื่อแท็บเก่าก่อนรวม (ลิงก์และค่าที่จำไว้) พาเข้าแท็บรวม", () => {
    expect(normalizeDashboardTab("production")).toBe("operations");
    expect(normalizeDashboardTab("project")).toBe("operations");
    expect(normalizeDashboardTab("bd")).toBe("operations");
    expect(normalizeDashboardTab("toString")).toBeNull();
    expect(tabFromHash("#dashboard/production")).toBe("operations");
  });
});

describe("แท็บที่เปิดตอนเข้าหน้า", () => {
  const visible: DashboardTabKey[] = ["overview", "sales", "inventory"];

  it("URL มาก่อนแท็บที่จำไว้", () => {
    expect(resolveInitialTab({ hashTab: "inventory", storedTab: "sales", visible })).toBe("inventory");
  });

  it("ไม่มีแท็บใน URL ใช้แท็บล่าสุดที่จำไว้ — รวมชื่อแท็บเก่าที่ถูกรวมแล้ว", () => {
    expect(resolveInitialTab({ hashTab: null, storedTab: "sales", visible })).toBe("sales");
    expect(resolveInitialTab({ hashTab: null, storedTab: "bd", visible: [...visible, "operations"] })).toBe("operations");
  });

  it("แท็บที่ไม่มีสิทธิ์ถูกข้าม ทั้งจาก URL และที่จำไว้ — ตกไปภาพรวม", () => {
    expect(resolveInitialTab({ hashTab: "operations", storedTab: "accounting", visible })).toBe("overview");
  });

  it("ค่าที่จำไว้ที่ไม่ใช่แท็บจริง (ข้อมูลเก่า/พิมพ์เอง) ไม่ทำให้พัง", () => {
    expect(resolveInitialTab({ hashTab: null, storedTab: "not-a-tab", visible })).toBe("overview");
  });
});

describe("แท็บใน URL", () => {
  it("อ่านแท็บจาก #dashboard/<แท็บ>", () => {
    expect(tabFromHash("#dashboard/inventory")).toBe("inventory");
    expect(tabFromHash("#/dashboard/operations")).toBe("operations");
  });

  it("ไม่มีแท็บ ไม่ใช่หน้าแดชบอร์ด หรือชื่อแท็บผิด = null", () => {
    expect(tabFromHash("#dashboard")).toBeNull();
    expect(tabFromHash("#quotations/inventory")).toBeNull();
    expect(tabFromHash("#dashboard/nope")).toBeNull();
    expect(tabFromHash("")).toBeNull();
  });

  it("ภาพรวมใช้ #dashboard เฉย ๆ ลิงก์เดิมทุกอันยังตรง", () => {
    expect(dashboardTabHash("overview")).toBe("#dashboard");
    expect(dashboardTabHash("purchasing")).toBe("#dashboard/purchasing");
  });

  it("ตัวอ่านหน้าของ App อ่านแค่ส่วนแรก — #dashboard/inventory ยังเป็นหน้าแดชบอร์ด", () => {
    const keys = { dashboard: 1, quotations: 1, settings: 1 } as const;
    expect(navKeyFromHash("#dashboard/inventory", keys)).toBe("dashboard");
    expect(navKeyFromHash("#dashboard", keys)).toBe("dashboard");
    expect(navKeyFromHash("#/quotations", keys)).toBe("quotations");
    expect(navKeyFromHash("#nope", keys)).toBeNull();
    // ชื่อที่ติดมากับ Object.prototype ต้องไม่ถูกนับเป็นหน้า
    expect(navKeyFromHash("#toString", keys)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import { defaultRoles, roleHasPermission } from "../src/lib/roles";
import {
  DASHBOARD_TAB_ORDER, canSeeDepartmentBlock, dashboardTabHash, normalizeDashboardTab, resolveInitialTab, tabFromHash,
  tabOfDepartment, visibleDashboardTabs, type DashboardTabKey,
} from "../src/lib/dashboardTabs";
import { dashboardTicksFromDocumentPermissions } from "../src/lib/dashboardTabGrants";
import type { Permission } from "../src/lib/permissions";
import { navKeyFromHash } from "../src/lib/navResolution";

/**
 * แท็บแผนกของแดชบอร์ด (2026-09-14) — ใครเห็นแท็บไหน และแท็บที่เปิดตอนเข้าหน้า
 *
 * The rules in `src/lib/dashboardTabs.ts` gate both the tab bar and the server's per-department
 * blocks, so a mistake here either hides a department from the people who run it or shows one to
 * someone whose server response is all `null`. Pinned against the real default roles rather than
 * hand-built ones, because "which of our actual roles sees what" is the question the owner asks.
 *
 * Since the tick permissions (same day): a tab needs its tick **and** a document permission of that
 * department — the owner chose that a tick never shows numbers beyond what the role can already see.
 */

const tabsFor = (roleKey: string): DashboardTabKey[] => {
  const role = defaultRoles.find((r) => r.key === roleKey);
  if (!role) throw new Error(`no default role ${roleKey}`);
  return visibleDashboardTabs((p) => roleHasPermission(role, p));
};

const only = (...granted: Permission[]) => (p: Permission) => granted.includes(p);

describe("แท็บที่แต่ละบทบาทเห็น (บทบาทตั้งต้นได้ติ๊กตรงกับแท็บที่เคยเห็น)", () => {
  it("Super Admin เห็นครบทุกแท็บ ตามลำดับที่แสดง — 7 แท็บ (ผลิต · โครงการ · BD รวมเป็นแท็บเดียว)", () => {
    expect(tabsFor("super_admin")).toEqual(DASHBOARD_TAB_ORDER);
    expect(tabsFor("super_admin")).toEqual(["overview", "sales", "service", "purchasing", "inventory", "operations", "accounting"]);
  });

  it("ภาพรวมขึ้นเสมอสำหรับบทบาทตั้งต้น และเป็นแท็บแรก", () => {
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

  it("บทบาทตั้งต้นทุกบทบาทถือติ๊กเท่ากับที่สิทธิ์เอกสารของมันเปิดให้ — ไม่ขาด ไม่เกิน", () => {
    for (const role of defaultRoles.filter((r) => !r.isSuperAdmin)) {
      const ticks = role.permissions.filter((p) => p.startsWith("dashboard:tab")).sort();
      expect(ticks, role.key).toEqual(dashboardTicksFromDocumentPermissions(role.permissions).sort());
    }
  });
});

describe("ช่องติ๊กแท็บ — ต้องมีทั้งติ๊กและสิทธิ์เอกสาร", () => {
  it("ติ๊กอย่างเดียว ไม่มีสิทธิ์เอกสาร = แท็บไม่ขึ้น", () => {
    expect(visibleDashboardTabs(only("dashboard:tabSales"))).toEqual([]);
    expect(visibleDashboardTabs(only("dashboard:tabProduction", "dashboard:tabBd"))).toEqual([]);
  });

  it("มีสิทธิ์เอกสาร แต่ไม่ติ๊ก = แท็บไม่ขึ้น", () => {
    expect(visibleDashboardTabs(only("quotations:view", "stock:view", "costControl:view"))).toEqual([]);
  });

  it("ติ๊กคู่กับสิทธิ์เอกสาร = แท็บขึ้น", () => {
    expect(visibleDashboardTabs(only("dashboard:tabSales", "quotations:view"))).toEqual(["sales"]);
    expect(visibleDashboardTabs(only("dashboard:tabAccounting", "ap:view"))).toEqual(["accounting"]);
  });

  it("ภาพรวมเป็นช่องติ๊กของตัวเอง ไม่ต้องมีสิทธิ์เอกสาร", () => {
    expect(visibleDashboardTabs(only("dashboard:tabOverview"))).toEqual(["overview"]);
    expect(visibleDashboardTabs(only("dashboard:tabInventory", "stock:view"))).toEqual(["inventory"]);
  });
});

describe("แท็บรวม ผลิต · โครงการ · BD", () => {
  it("เปิดเมื่อเห็นแผนกใดแผนกหนึ่ง แต่บล็อกข้างในยังแยกติ๊กและสิทธิ์รายแผนก", () => {
    const productionOnly = only("dashboard:tabProduction", "productionOrder:view", "costControl:view");
    expect(visibleDashboardTabs(productionOnly)).toEqual(["operations"]);
    expect(canSeeDepartmentBlock("production", productionOnly)).toBe(true);
    expect(canSeeDepartmentBlock("project", productionOnly)).toBe(false);
    // มีสิทธิ์ดู Cost Control แต่ไม่ได้ติ๊ก BD
    expect(canSeeDepartmentBlock("bd", productionOnly)).toBe(false);

    expect(visibleDashboardTabs(only("dashboard:tabBd", "costControl:view"))).toEqual(["operations"]);
    expect(visibleDashboardTabs(only("dashboard:tabProject", "project:view"))).toEqual(["operations"]);
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

describe("ติ๊กที่บทบาทเดิมควรได้ (ใช้ครั้งเดียวตอน migration และกับบทบาทตั้งต้น)", () => {
  it("ไม่มี dashboard:view = ไม่ได้ติ๊กอะไรเลย", () => {
    expect(dashboardTicksFromDocumentPermissions(["stock:view", "quotations:view"])).toEqual([]);
  });

  it("บทบาทที่ลูกค้าสร้างเอง ได้ภาพรวม + แท็บที่สิทธิ์เอกสารของมันเคยเปิดให้ ไม่เกินนั้น", () => {
    expect(dashboardTicksFromDocumentPermissions(["dashboard:view", "stock:view", "receivingReport:view"]).sort())
      .toEqual(["dashboard:tabInventory", "dashboard:tabOverview"]);
    expect(dashboardTicksFromDocumentPermissions(["dashboard:view", "productionOrder:view", "purchaseRequest:view"]).sort())
      .toEqual(["dashboard:tabOverview", "dashboard:tabProduction", "dashboard:tabPurchasing"]);
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

  it("แท็บที่ไม่มีสิทธิ์ถูกข้าม ทั้งจาก URL และที่จำไว้ — ตกไปแท็บแรกที่เห็น", () => {
    expect(resolveInitialTab({ hashTab: "operations", storedTab: "accounting", visible })).toBe("overview");
  });

  it("ไม่ได้ติ๊กภาพรวม = เปิดแท็บแรกที่ติ๊กไว้ · ไม่เห็นแท็บไหนเลย = null", () => {
    expect(resolveInitialTab({ hashTab: null, storedTab: null, visible: ["purchasing", "inventory"] })).toBe("purchasing");
    expect(resolveInitialTab({ hashTab: "overview", storedTab: "overview", visible: [] })).toBeNull();
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

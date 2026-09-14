import { describe, it, expect } from "vitest";
import { defaultRoles, roleHasPermission } from "../src/lib/roles";
import {
  DASHBOARD_TAB_RULES, dashboardTabHash, resolveInitialTab, tabFromHash, visibleDashboardTabs,
  type DashboardTabKey,
} from "../src/lib/dashboardTabs";
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

describe("แท็บที่แต่ละบทบาทเห็น", () => {
  it("Super Admin เห็นครบทุกแท็บ ตามลำดับที่แสดง", () => {
    expect(tabsFor("super_admin")).toEqual(DASHBOARD_TAB_RULES.map((r) => r.key));
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

describe("แท็บที่เปิดตอนเข้าหน้า", () => {
  const visible: DashboardTabKey[] = ["overview", "sales", "inventory"];

  it("URL มาก่อนแท็บที่จำไว้", () => {
    expect(resolveInitialTab({ hashTab: "inventory", storedTab: "sales", visible })).toBe("inventory");
  });

  it("ไม่มีแท็บใน URL ใช้แท็บล่าสุดที่จำไว้", () => {
    expect(resolveInitialTab({ hashTab: null, storedTab: "sales", visible })).toBe("sales");
  });

  it("แท็บที่ไม่มีสิทธิ์ถูกข้าม ทั้งจาก URL และที่จำไว้ — ตกไปภาพรวม", () => {
    expect(resolveInitialTab({ hashTab: "bd", storedTab: "accounting", visible })).toBe("overview");
  });

  it("ค่าที่จำไว้ที่ไม่ใช่แท็บจริง (ข้อมูลเก่า/พิมพ์เอง) ไม่ทำให้พัง", () => {
    expect(resolveInitialTab({ hashTab: null, storedTab: "not-a-tab", visible })).toBe("overview");
  });
});

describe("แท็บใน URL", () => {
  it("อ่านแท็บจาก #dashboard/<แท็บ>", () => {
    expect(tabFromHash("#dashboard/inventory")).toBe("inventory");
    expect(tabFromHash("#/dashboard/bd")).toBe("bd");
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

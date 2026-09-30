import { describe, expect, it } from "vitest";
import { filterVendors } from "../src/pages/vendors/vendorDisplay";
import { codeKindCounts, filterCodeEntries } from "../src/pages/codeRegister/codeRegisterDisplay";
import type { Vendor } from "../src/lib/vendors";
import type { CodeEntry } from "../src/lib/codeRegister";

/** ตัวกรองของหน้าทะเบียนผู้ขาย/ทะเบียนรหัส (ดีไซน์ใหม่ 2026-09-30) — กติกาเดิมของหน้า แยกออกมาเป็นฟังก์ชันล้วน */

function vendor(p: Partial<Vendor>): Vendor {
  return {
    id: "v", name: "", code: "", contactName: "", phone: "", taxId: "", address: "", note: "",
    isActive: true, isDeleted: false, createdAt: "", updatedAt: "", createdBy: "", updatedBy: "", ...p,
  };
}

function code(p: Partial<CodeEntry>): CodeEntry {
  return { id: "c", kind: "department", code: "", name: "", isActive: true, isDeleted: false, ...p } as CodeEntry;
}

describe("filterVendors", () => {
  const list = [
    vendor({ id: "1", name: "บริษัท สยามเคมีภัณฑ์ จำกัด", code: "V-0101", taxId: "0105548012345" }),
    vendor({ id: "2", name: "ร้าน ช.เจริญการไฟฟ้า", isActive: false }),
    vendor({ id: "3", name: "หจก. รุ่งเรืองวัสดุ", isDeleted: true }),
  ];

  it("hides archived vendors unless asked", () => {
    expect(filterVendors(list, { tab: "all", search: "", showArchived: false }).map((v) => v.id)).toEqual(["1", "2"]);
    expect(filterVendors(list, { tab: "all", search: "", showArchived: true }).map((v) => v.id)).toEqual(["1", "2", "3"]);
  });

  it("filters by the active / inactive tab", () => {
    expect(filterVendors(list, { tab: "active", search: "", showArchived: false }).map((v) => v.id)).toEqual(["1"]);
    expect(filterVendors(list, { tab: "inactive", search: "", showArchived: false }).map((v) => v.id)).toEqual(["2"]);
  });

  it("searches name, code and tax id case-insensitively", () => {
    expect(filterVendors(list, { tab: "all", search: "v-0101", showArchived: false }).map((v) => v.id)).toEqual(["1"]);
    expect(filterVendors(list, { tab: "all", search: "0105548", showArchived: false }).map((v) => v.id)).toEqual(["1"]);
  });
});

describe("filterCodeEntries / codeKindCounts", () => {
  const codes = [
    code({ id: "d1", kind: "department", code: "G101", name: "ฝ่ายบริหาร" }),
    code({ id: "a1", kind: "account", code: "5104-01", name: "ค่าวัสดุ", category: "ต้นทุนขาย", parentCode: "5104-00" }),
    code({ id: "a2", kind: "account", code: "5104-02", name: "ค่าแรง", isDeleted: true }),
  ];

  it("keeps only the selected kind and hides archived by default", () => {
    expect(filterCodeEntries(codes, { kind: "account", search: "", showArchived: false }).map((c) => c.id)).toEqual(["a1"]);
    expect(filterCodeEntries(codes, { kind: "account", search: "", showArchived: true }).map((c) => c.id)).toEqual(["a1", "a2"]);
  });

  it("searches category and parent code too", () => {
    expect(filterCodeEntries(codes, { kind: "account", search: "5104-00", showArchived: false }).map((c) => c.id)).toEqual(["a1"]);
    expect(filterCodeEntries(codes, { kind: "account", search: "ต้นทุน", showArchived: false }).map((c) => c.id)).toEqual(["a1"]);
  });

  it("counts non-archived codes per kind for the tabs", () => {
    expect(codeKindCounts(codes)).toEqual({ department: 1, account: 1, workType: 0 });
  });
});

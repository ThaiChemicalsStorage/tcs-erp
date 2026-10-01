import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, PERMISSION_GROUPS, type Permission } from "../src/lib/permissions";
import {
  buildPermissionMatrix, EXTRA_SHORT_LABEL_KEY, MATRIX_COLUMNS, RESOURCE_LABEL_KEY, actionOf, resourceOf,
} from "../src/pages/admin/permissionMatrix";

/**
 * ตารางสิทธิ์ของหน้าบทบาท (REDESIGN 2026-09-30) ต้องแสดงสิทธิ์ชุดเดียวกับรายการติ๊กเดิมทุกข้อ —
 * ไม่มีสิทธิ์หาย ไม่มีสิทธิ์ซ้ำ ไม่มีสิทธิ์ใหม่งอกขึ้นมา
 */

function flatten(): Permission[] {
  const out: Permission[] = [];
  for (const section of buildPermissionMatrix()) {
    if (section.kind === "list") out.push(...section.permissions);
    else for (const row of section.rows) out.push(...Object.values(row.cells) as Permission[], ...row.extras);
  }
  return out;
}

describe("permission matrix", () => {
  it("shows every grouped permission exactly once", () => {
    const shown = flatten();
    const expected = PERMISSION_GROUPS.flatMap((g) => g.permissions);
    expect(new Set(shown).size).toBe(shown.length);
    expect([...shown].sort()).toEqual([...expected].sort());
  });

  it("covers every permission in the system (ALL_PERMISSIONS), so no permission is untickable", () => {
    expect([...flatten()].sort()).toEqual([...ALL_PERMISSIONS].sort());
  });

  it("keeps one section per permission group, in the same order", () => {
    expect(buildPermissionMatrix().map((s) => s.labelKey)).toEqual(PERMISSION_GROUPS.map((g) => g.labelKey));
  });

  it("puts each cell permission in the row of its own resource", () => {
    for (const section of buildPermissionMatrix()) {
      if (section.kind !== "matrix") continue;
      for (const row of section.rows) {
        for (const p of [...Object.values(row.cells) as Permission[], ...row.extras]) expect(resourceOf(p)).toBe(row.resource);
      }
    }
  });

  it("maps the standard document actions onto their columns", () => {
    const quotes = buildPermissionMatrix().flatMap((s) => (s.kind === "matrix" ? s.rows : [])).find((r) => r.resource === "quotations");
    expect(quotes?.cells).toEqual({
      view: "quotations:view", viewAll: "quotations:viewAll", viewTeam: "quotations:viewTeam", viewDepartment: "quotations:viewDepartment",
      create: "quotations:create", edit: "quotations:edit", approve: "quotations:approve", print: "quotations:export", delete: "quotations:delete",
    });
    expect(quotes?.extras).toEqual(["quotations:reject"]);
  });

  it("has a row label for every matrix row and only known columns", () => {
    for (const section of buildPermissionMatrix()) {
      if (section.kind !== "matrix") continue;
      for (const row of section.rows) {
        expect(RESOURCE_LABEL_KEY[row.resource], row.resource).toBeDefined();
        for (const c of Object.keys(row.cells)) expect(MATRIX_COLUMNS).toContain(c);
      }
    }
  });

  it("gives every current 'other' permission a short label", () => {
    for (const section of buildPermissionMatrix()) {
      if (section.kind !== "matrix") continue;
      for (const row of section.rows) for (const p of row.extras) expect(EXTRA_SHORT_LABEL_KEY[actionOf(p)], p).toBeDefined();
    }
  });

  it("never overwrites a cell when two keys of one resource map to the same column", () => {
    // finalize/approve/review ลงคอลัมน์อนุมัติเหมือนกัน — ถ้าวันหน้าเอกสารเดียวมีสองตัว ตัวที่สองต้องไปอยู่ "อื่น ๆ" ไม่ใช่ทับ
    const clash = buildPermissionMatrix([
      { label: "z", labelKey: "nav.quotations", permissions: ["quotations:approve", "quotations:finalize" as Permission] },
    ]);
    const row = clash[0].kind === "matrix" ? clash[0].rows[0] : null;
    expect(row?.cells.approve).toBe("quotations:approve");
    expect(row?.extras).toEqual(["quotations:finalize"]);
  });
});

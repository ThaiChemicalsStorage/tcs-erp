import { describe, it, expect } from "vitest";
import {
  assessUnsavedRisk,
  isPayloadDirty,
  safeStringify,
  type UnsavedRiskInput,
} from "../src/lib/unsavedChanges";
import type { AutoSaveState } from "../src/hooks/useAutoSave";

/**
 * กฎการเตือน "ยังไม่ได้บันทึก" (เพิ่ม 2026-08-25)
 *
 * Guards the rule behind the unsaved-changes prompt. Written the same way as
 * `navResolution.test.ts`, and for the same reason: the interesting cases here are all *transient*
 * — whether to interrupt someone depends on a 2.5-second auto-save debounce being in flight, a
 * window far too short to catch by looking at the app after it settles. Asserting on the decision
 * function is the only check that actually sees them.
 */

const AUTO_SAVE_STATES: AutoSaveState[] = ["idle", "pending", "saving", "saved", "error"];

/** ฉบับร่างที่บันทึกอัตโนมัติทำงานอยู่ตามปกติ */
function healthyDraft(overrides: Partial<UnsavedRiskInput> = {}): UnsavedRiskInput {
  return {
    isDirty: true,
    hasServerRecord: true,
    autoSaveEnabled: true,
    autoSaveState: "pending",
    ...overrides,
  };
}

describe("assessUnsavedRisk — nothing clean is ever interrupted", () => {
  it("returns \"none\" for every combination once there is no unsaved change", () => {
    for (const hasServerRecord of [true, false]) {
      for (const autoSaveEnabled of [true, false]) {
        for (const autoSaveState of AUTO_SAVE_STATES) {
          const risk = assessUnsavedRisk({ isDirty: false, hasServerRecord, autoSaveEnabled, autoSaveState });
          expect(risk, `${hasServerRecord}/${autoSaveEnabled}/${autoSaveState}`).toBe("none");
        }
      }
    }
  });
});

describe("assessUnsavedRisk — a healthy auto-saving Draft must stay silent", () => {
  // เจ้าของสั่งไว้ชัดเจนว่าห้ามเด้งเตือนตอนที่ auto-save ดูแลอยู่แล้ว — ถ้ามีใครมา "ปรับปรุง" ให้เตือนตอน
  // pending เมื่อไหร่ เทสต์ชุดนี้จะแดงทันที
  //
  // This is the owner's explicit instruction, and the whole reason the prompt is worth having: it
  // fires only where auto-save genuinely cannot help. `useAutoSave` also flushes on unmount, so the
  // work lands whether or not we ask — a prompt here would be noise on the most common path.
  for (const autoSaveState of ["idle", "pending", "saving", "saved"] as AutoSaveState[]) {
    it(`stays "none" while auto-save is enabled and its state is "${autoSaveState}"`, () => {
      expect(assessUnsavedRisk(healthyDraft({ autoSaveState }))).toBe("none");
    });
  }

  it("speaks up when the last auto-save actually failed", () => {
    expect(assessUnsavedRisk(healthyDraft({ autoSaveState: "error" }))).toBe("autoSaveFailed");
  });
});

describe("assessUnsavedRisk — the cases auto-save cannot cover", () => {
  it("flags a document that has no server record yet", () => {
    expect(assessUnsavedRisk(healthyDraft({ hasServerRecord: false, autoSaveEnabled: false, autoSaveState: "idle" })))
      .toBe("new");
  });

  it("still flags a new document even if autoSaveState looks settled", () => {
    // สถานะค้างจากการเปิดหน้าเอกสารก่อนหน้าต้องกลบเคสนี้ไม่ได้ — ใบใหม่ยังไม่มี id ให้ PATCH เลยด้วยซ้ำ
    expect(assessUnsavedRisk(healthyDraft({ hasServerRecord: false, autoSaveState: "saved" }))).toBe("new");
  });

  it("flags an editable document that is past Draft, where the server refuses auto-save", () => {
    expect(assessUnsavedRisk(healthyDraft({ autoSaveEnabled: false, autoSaveState: "idle" }))).toBe("notAutoSaved");
  });

  it("prefers the more actionable message when a new document also has a failed auto-save", () => {
    expect(assessUnsavedRisk(healthyDraft({ hasServerRecord: false, autoSaveState: "error" }))).toBe("new");
  });
});

describe("isPayloadDirty — fails open, never traps the user", () => {
  it("reports clean when no baseline has been seeded yet", () => {
    expect(isPayloadDirty(null, '{"a":1}')).toBe(false);
  });

  it("reports clean when the current payload could not be serialized", () => {
    expect(isPayloadDirty('{"a":1}', null)).toBe(false);
  });

  it("reports dirty only on a real difference", () => {
    expect(isPayloadDirty('{"a":1}', '{"a":1}')).toBe(false);
    expect(isPayloadDirty('{"a":1}', '{"a":2}')).toBe(true);
  });
});

describe("safeStringify", () => {
  it("returns null instead of throwing on values JSON cannot handle", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(safeStringify(cyclic)).toBeNull();
    expect(safeStringify({ big: 1n })).toBeNull();
  });

  it("returns null for undefined, which JSON.stringify does not turn into a string", () => {
    expect(safeStringify(undefined)).toBeNull();
  });

  it("compares equal payloads clean and a changed nested line dirty", () => {
    // การเทียบใช้ JSON.stringify จึงขึ้นกับลำดับคีย์ — ที่มันเสถียรได้เพราะทุกหน้าใช้ toUpdateFields()
    // ตัวเดียวกันสร้าง payload ทั้งสองฝั่ง อย่าเปลี่ยนไปใช้ deep-equal โดยไม่อ่านตรงนี้ก่อน
    //
    // The comparison is key-order sensitive; it is stable only because both sides are built by the
    // same `toUpdateFields()` factory. Documented here so nobody "improves" it into a deep-equal.
    const build = (qty: number) => ({ note: "x", lines: [{ id: "a", qty }, { id: "b", qty: 2 }] });
    expect(isPayloadDirty(safeStringify(build(1)), safeStringify(build(1)))).toBe(false);
    expect(isPayloadDirty(safeStringify(build(1)), safeStringify(build(9)))).toBe(true);
  });
});

/**
 * ทะเบียนการ์ด — ส่วนที่ทดสอบในเบราว์เซอร์เองไม่ได้ในรอบนี้ (ต้องล็อกอินด้วยบัญชีเจ้าของ) จึงดึงกฎออกมา
 * ทดสอบตรง ๆ แทน ความผิดพลาดสองแบบที่นี่เจ็บที่สุด: การ์ดค้างจะบล็อกการเปลี่ยนหน้าไปตลอด และการ์ดที่ถูกลบผิดตัว
 * จะปล่อยให้งานหายเงียบ ๆ
 *
 * The registry rules, extracted so they can be asserted without a browser. Two failures here hurt
 * most: a guard left behind blocks every future navigation with a prompt about a document nobody is
 * looking at, and a guard cleared by the wrong owner silently stops protecting the open editor.
 */
import { createGuardRegistry, runGuardedSave, type UnsavedChangesGuard } from "../src/lib/unsavedChanges";

function fakeGuard(label: string, risk: UnsavedChangesGuard["getRisk"] = () => "new"): UnsavedChangesGuard {
  return { getRisk: risk, documentLabel: label, save: async () => true, discard: () => {} };
}

describe("createGuardRegistry", () => {
  it("says there is nothing to ask about when no editor is open", () => {
    expect(createGuardRegistry().assess()).toBe("none");
    expect(createGuardRegistry().current()).toBeNull();
  });

  it("delegates the decision to the registered editor", () => {
    const r = createGuardRegistry();
    r.register(Symbol(), fakeGuard("PR-0001", () => "notAutoSaved"));
    expect(r.assess()).toBe("notAutoSaved");
    expect(r.current()?.documentLabel).toBe("PR-0001");
  });

  it("lets an editor unregister itself on unmount, so a stale guard cannot block navigation", () => {
    const r = createGuardRegistry();
    const token = Symbol();
    r.register(token, fakeGuard("PR-0001"));
    r.register(token, null);
    expect(r.assess()).toBe("none");
  });

  it("does NOT let a late unmount clear the guard of the page that replaced it", () => {
    // React can unmount the outgoing editor after the incoming one has already mounted and
    // registered. If that teardown cleared whatever happens to be registered, the new page would
    // silently lose its protection.
    const r = createGuardRegistry();
    const oldToken = Symbol();
    const newToken = Symbol();
    r.register(oldToken, fakeGuard("old"));
    r.register(newToken, fakeGuard("new"));
    r.register(oldToken, null); // ตัวเก่า unmount ทีหลัง
    expect(r.current()?.documentLabel).toBe("new");
    expect(r.assess()).toBe("new");
  });

  it("clears unconditionally once the user has decided and navigation is going ahead", () => {
    // ล้างก่อน proceed() เสมอ ไม่งั้นตอนหน้าเดิม unmount การ์ดเดิมอาจเด้งถามซ้ำอีกรอบ
    const r = createGuardRegistry();
    r.register(Symbol(), fakeGuard("PR-0001"));
    r.clear();
    expect(r.assess()).toBe("none");
  });
});

describe("runGuardedSave — a failed save must never navigate away", () => {
  it("reports success only when the editor's own save reports success", async () => {
    expect(await runGuardedSave(async () => true)).toBe(true);
  });

  it("reports failure when validation or the server rejected the save", async () => {
    expect(await runGuardedSave(async () => false)).toBe(false);
  });

  it("treats a thrown error as not-saved rather than letting it escape", async () => {
    // ถ้าปล่อยให้ throw หลุดออกไป กล่องจะค้างอยู่ในสถานะ "กำลังบันทึก" ตลอด และถ้านับว่าสำเร็จ
    // ก็จะพาออกจากหน้าไปพร้อมทำลายงานที่ฟีเจอร์นี้มีไว้ปกป้องพอดี
    expect(await runGuardedSave(async () => { throw new Error("network"); })).toBe(false);
  });
});

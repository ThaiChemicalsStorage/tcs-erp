import { describe, it, expect } from "vitest";
import { purchaseRequestProgress } from "../src/pages/purchaseRequest/purchaseRequestSteps";
import type { PurchaseRequest, PurchaseRequestLine } from "../src/lib/purchaseRequest";

/**
 * แถบ 6 ขั้นของใบขอซื้อ (ดีไซน์ใหม่ 2026-09-30) คำนวณจากฟิลด์ที่มีอยู่เท่านั้น — ถ้าคำนวณผิด ผู้ใช้จะเห็นว่า
 * ใบ "ถึงจัดซื้อแล้ว" ทั้งที่ยังรอสโตร์ หรือใบเก่าก่อน 2026-09-09 ค้างที่ขั้นสโตร์ตลอดไป
 */
type Doc = Pick<PurchaseRequest, "status" | "storeStage" | "purchasingStage" | "lines">;
const line = (id: string, storeDecision?: "stock" | "purchase"): PurchaseRequestLine =>
  ({ id, storeDecision } as unknown as PurchaseRequestLine);
const doc = (patch: Partial<Doc>): Doc => ({ status: "Final", lines: [line("a"), line("b")], ...patch });

describe("purchaseRequestProgress", () => {
  it("Draft and PendingApproval sit on the first two steps", () => {
    expect(purchaseRequestProgress(doc({ status: "Draft" }), {}).current).toBe(0);
    expect(purchaseRequestProgress(doc({ status: "PendingApproval" }), {}).current).toBe(1);
  });

  it("approved and waiting for the store is on the store step", () => {
    const p = purchaseRequestProgress(doc({ storeStage: "pending" }), {});
    expect(p.steps[p.current]).toBe("store");
  });

  it("purchasing review is on the purchasing step", () => {
    const p = purchaseRequestProgress(doc({ storeStage: "forwarded", purchasingStage: "review" }), {});
    expect(p.steps[p.current]).toBe("purchasing");
  });

  it("legacy documents without stage fields go straight to issuing POs", () => {
    const p = purchaseRequestProgress(doc({}), {});
    expect(p.steps).toHaveLength(6);
    expect(p.steps[p.current]).toBe("po");
  });

  it("counts only lines that must be bought, and completes when all are ordered", () => {
    const d = doc({ storeStage: "forwarded", purchasingStage: "approved", lines: [line("a", "stock"), line("b", "purchase"), line("c", "purchase")] });
    const partial = purchaseRequestProgress(d, { b: ["PO-1"] });
    expect(partial).toMatchObject({ toBuy: 2, ordered: 1, fromStock: 1, purchaseOrders: ["PO-1"] });
    expect(partial.steps[partial.current]).toBe("po");
    const done = purchaseRequestProgress(d, { b: ["PO-1"], c: ["PO-2", "PO-1"] });
    expect(done.current).toBe(done.steps.length);
    expect(done.purchaseOrders).toEqual(["PO-1", "PO-2"]);
  });

  it("closed by the store drops the purchasing steps and is complete", () => {
    const p = purchaseRequestProgress(doc({ storeStage: "closed" }), {});
    expect(p.steps).toEqual(["draft", "pending", "approved", "store"]);
    expect(p.current).toBe(4);
  });
});

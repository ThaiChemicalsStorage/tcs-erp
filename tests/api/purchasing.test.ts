import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Integration tests for the โมดูลจัดซื้อ (Purchasing) documents added 2026-08-28 — ใบสั่งซื้อ (PO),
 * ใบตรวจรับสินค้า (GR) and ใบรับวางบิล (BR) — plus the ใบขอซื้อ change that opened the document to
 * every department (`ownerDepartment: "general"`).
 *
 * These run against the real Express app on a throwaway in-memory MongoDB, so what is asserted is
 * the HTTP contract the browser actually sees, not the shape of a Mongo filter. The five things
 * pinned here are the ones that hurt to change later:
 *
 *   1. **เลขที่เอกสาร** — `PO-{YYYYMM}-{NNNN}` (since 2026-09-03), sequential and never reused. The
 *      format ends up printed on paper, so it is fixed by test on purpose.
 *   2. **ต้นทางต้องอนุมัติแล้ว** — a Draft ใบขอซื้อ cannot become a PO; a Draft PO cannot be
 *      received or billed. That gate is the whole point of the flow chart the owner supplied.
 *   3. **รายการสืบทอดเป็น snapshot** — the PO copies the PR's lines; editing the PO afterwards must
 *      not reach back into the PR.
 *   4. **สถานะที่ไม่ใช่ร่างแก้ไม่ได้** — both Final and PendingApproval reject a PATCH.
 *   5. **Rewrite** — `-R1` is a new Draft document and the approved original is left untouched.
 */

let mongod: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let adminCookie: string;

/** ปีเดือน (ค.ศ., เวลาไทย) ที่เลขที่เอกสารต้องใช้ — `{PREFIX}-{YYYYMM}-{NNNN}` เหมือนทุกใบภายในตั้งแต่ 2026-09-03 */
const YYYYMM = (() => { const d = new Date(Date.now() + 7 * 3600 * 1000); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`; })();

async function api(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie: adminCookie, ...(init.headers ?? {}) },
  });
}

async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

type PurchaseRequestDoc = {
  id: string; status: string; ownerDepartment?: string;
  storeStage?: "pending" | "forwarded" | "closed";
  storeReviewedByName?: string;
  storeRemark?: string;
  storeIssues?: { id: string; seq: number; lines: { lineId: string; qty: number }[] }[];
  purchasingEdits?: { at: string; byName: string; note: string }[];
  purchasingStage?: "review" | "approved";
  purchasingApprovedByUserId?: string;
  purchasingDeptBy?: string;
  purchasingDeptAt?: string;
  lines: { id: string; productId: string; productCode: string; description: string; unit: string; qtyRequested: number | null; subDetails: string[]; storeDecision?: string }[];
};
type PurchaseOrderDoc = {
  id: string; documentNumber: string; status: string; vendorName: string; purchaseRequestId: string;
  lines: { id: string; description: string; unit: string; qty: number | null; unitPrice: number | null }[];
};
/** ใบขอซื้อเปล่าของฝ่ายที่ไม่มีเอกสารต้นทาง — ทางสร้างที่เพิ่มมาพร้อมโมดูลจัดซื้อ */
async function createStandalonePurchaseRequest(): Promise<PurchaseRequestDoc> {
  const res = await api("/api/purchase-requests", { method: "POST", body: JSON.stringify({}) });
  expect(res.status).toBe(201);
  return (await json<{ purchaseRequest: PurchaseRequestDoc }>(res)).purchaseRequest;
}

/**
 * ใบขอซื้อที่อนุมัติแล้ว **และสโตร์ส่งต่อจัดซื้อแล้ว** พร้อมรายการ 2 บรรทัด — ต้นทางของ PO ในเทสต์ส่วนใหญ่
 *
 * ขั้น "สโตร์เช็คของ" เพิ่มเมื่อ 2026-09-09: ใบที่อนุมัติแล้วแต่ยังไม่ผ่านสโตร์ออกใบสั่งซื้อไม่ได้
 * เทสต์ที่สนใจเฉพาะ PO จึงต้องเดินผ่านขั้นนี้ก่อน (ดูชุดเทสต์ของขั้นสโตร์ด้านล่างสำหรับตัวขั้นเอง)
 */
async function approvedPurchaseRequest(): Promise<PurchaseRequestDoc> {
  const pr = await createStandalonePurchaseRequest();
  const patched = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      lines: [
        { id: "l1", productId: null, productCode: "P-001", description: "ปั๊มเคมี", subDetails: [], unit: "ตัว", qtyRequested: 2, neededByDate: "2026-09-15", departmentCode: "G143", costCode: "5150-13", remark: "" },
        { id: "l2", productId: null, productCode: "", description: "ท่อ PVC", subDetails: [], unit: "เส้น", qtyRequested: 10, remark: "" },
      ],
    }),
  });
  expect(patched.status).toBe(200);
  const submitted = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/submit-approval`, { method: "POST" });
  expect(submitted.status).toBe(200);
  const approved = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/approve`, { method: "POST" });
  expect(approved.status).toBe(200);
  return storeForwardsToPurchasing(pr.id);
}

/** สโตร์เช็คแล้วบอกว่าไม่มีของทั้งสองบรรทัด → ใบถูกส่งต่อฝ่ายจัดซื้อ */
async function storeForwardsToPurchasing(id: string): Promise<PurchaseRequestDoc> {
  const res = await api(`/api/purchase-requests/${encodeURIComponent(id)}/store-review`, {
    method: "POST",
    body: JSON.stringify({ lines: [{ lineId: "l1", decision: "purchase" }, { lineId: "l2", decision: "purchase" }], remark: "ไม่มีของทั้งสองรายการ" }),
  });
  expect(res.status).toBe(200);
  return (await json<{ purchaseRequest: PurchaseRequestDoc }>(res)).purchaseRequest;
}

/** ใบขอซื้อที่อนุมัติแล้วแต่ยังไม่ผ่านสโตร์ — ใช้ทดสอบขั้นสโตร์เอง */
async function approvedAwaitingStore(): Promise<PurchaseRequestDoc> {
  const pr = await createStandalonePurchaseRequest();
  const patched = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      lines: [
        { id: "l1", productId: null, productCode: "P-001", description: "ปั๊มเคมี", subDetails: [], unit: "ตัว", qtyRequested: 2, remark: "" },
        { id: "l2", productId: null, productCode: "", description: "ท่อ PVC", subDetails: [], unit: "เส้น", qtyRequested: 10, remark: "" },
      ],
    }),
  });
  expect(patched.status).toBe(200);
  expect((await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/submit-approval`, { method: "POST" })).status).toBe(200);
  const approved = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/approve`, { method: "POST" });
  expect(approved.status).toBe(200);
  return (await json<{ purchaseRequest: PurchaseRequestDoc }>(approved)).purchaseRequest;
}

async function createPurchaseOrder(body: Record<string, unknown> = {}): Promise<PurchaseOrderDoc> {
  const res = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify(body) });
  expect(res.status).toBe(201);
  return (await json<{ purchaseOrder: PurchaseOrderDoc }>(res)).purchaseOrder;
}

/** ส่งขออนุมัติแล้วอนุมัติ — PO ใช้เครื่องอนุมัติกลางตัวเดียวกับใบขอซื้อ */
async function approvePurchaseOrder(id: string): Promise<PurchaseOrderDoc> {
  const submitted = await api(`/api/purchase-orders/${encodeURIComponent(id)}/submit-approval`, { method: "POST" });
  expect(submitted.status).toBe(200);
  const approved = await api(`/api/purchase-orders/${encodeURIComponent(id)}/approve`, { method: "POST" });
  expect(approved.status).toBe(200);
  return (await json<{ purchaseOrder: PurchaseOrderDoc }>(approved)).purchaseOrder;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  const { createApp } = await import("../../server/app.js");
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  await fetch(`${baseUrl}/api/auth/setup`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ employeeId: "E001", fullName: "Admin Buyer", username: "admin", email: "admin@test.local", password: "correct-horse-1" }),
  });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: "admin", password: "correct-horse-1" }),
  });
  adminCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
});

afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
  await mongod?.stop();
});

describe("ใบขอซื้อ — เปิดให้ทุกฝ่ายขอได้ (ownerDepartment: general)", () => {
  it("สร้างใบเปล่าโดยไม่มีเอกสารต้นทางได้ และได้แผนกเจ้าของเป็น general", async () => {
    const pr = await createStandalonePurchaseRequest();
    expect(pr.id).toMatch(/^PR-\d{6}-\d{4}$/);
    expect(pr.status).toBe("Draft");
    expect(pr.ownerDepartment).toBe("general");
  });

  it("ใบของฝ่ายอื่นไม่ปนเข้าหน้าฝ่ายโครงการ แต่ขึ้นในกล่องงานเข้าของจัดซื้อ", async () => {
    const pr = await createStandalonePurchaseRequest();
    const idsOf = async (scope: string) => {
      const res = await api(`/api/purchase-requests?ownerDepartment=${scope}`);
      expect(res.status).toBe(200);
      return (await json<{ purchaseRequests: { id: string }[] }>(res)).purchaseRequests.map((d) => d.id);
    };
    expect(await idsOf("general")).toContain(pr.id);
    expect(await idsOf("all")).toContain(pr.id);
    expect(await idsOf("project")).not.toContain(pr.id);
    expect(await idsOf("production")).not.toContain(pr.id);
  });
});

describe("ใบสั่งซื้อ (PO)", () => {
  it("ออกเลขที่ตามรูปแบบ PO-{YYYYMM}-{NNNN} และเดินหน้าไม่ซ้ำ", async () => {
    const first = await createPurchaseOrder();
    const second = await createPurchaseOrder();
    expect(first.id).toMatch(new RegExp(`^PO-${YYYYMM}-\\d{4}$`));
    expect(second.id).toMatch(new RegExp(`^PO-${YYYYMM}-\\d{4}$`));
    const seq = (id: string) => Number(id.split("-")[2]);
    expect(seq(second.id)).toBe(seq(first.id) + 1);
    expect(first.documentNumber).toBe(first.id);
    expect(first.status).toBe("Draft");
  });

  it("สืบทอดรายการจากใบขอซื้อที่อนุมัติแล้วแบบ snapshot — แก้ PO ไม่ย้อนไปแตะใบขอซื้อ", async () => {
    const pr = await approvedPurchaseRequest();
    const po = await createPurchaseOrder({ purchaseRequestId: pr.id });

    expect(po.purchaseRequestId).toBe(pr.id);
    // ผู้ขายไม่สืบทอดมาจากใบขอซื้ออีกแล้ว (2026-08-31) — ใบขอซื้อไม่มีช่องนั้นแล้วตามที่เจ้าของสั่ง
    // ฝ่ายจัดซื้อเลือกเองจากทะเบียนผู้ขายบนใบสั่งซื้อ
    expect(po.vendorName).toBe("");
    expect(po.lines).toHaveLength(2);
    expect(po.lines[0].description).toBe("ปั๊มเคมี");
    expect(po.lines[0].qty).toBe(2);
    // ราคาเริ่มว่างเสมอตั้งแต่ 2026-09-21 — ใบขอซื้อไม่มีราคาประเมินให้ลอกมาแล้ว จัดซื้อกรอกเอง
    expect(po.lines[0].unitPrice).toBeNull();
    // บรรทัดของ PO เป็นคนละ id กับของใบขอซื้อ — ไม่ใช่การอ้างอิงเดิม
    expect(po.lines.map((l) => l.id)).not.toContain("l1");

    const edited = await api(`/api/purchase-orders/${encodeURIComponent(po.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ lines: [{ ...po.lines[0], qty: 99 }] }),
    });
    expect(edited.status).toBe(200);

    const prAfter = await json<{ purchaseRequest: PurchaseRequestDoc }>(await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`));
    expect(prAfter.purchaseRequest.lines).toHaveLength(2);
    expect(prAfter.purchaseRequest.lines[0].qtyRequested).toBe(2);
  });

  it("ใบขอซื้อที่ยังเป็นร่างออกใบสั่งซื้อไม่ได้", async () => {
    const draft = await createStandalonePurchaseRequest();
    const res = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ purchaseRequestId: draft.id }) });
    expect(res.status).toBe(400);
  });

  it("แก้ไม่ได้ทั้งตอนรออนุมัติและตอนอนุมัติแล้ว", async () => {
    const po = await createPurchaseOrder();
    await api(`/api/purchase-orders/${encodeURIComponent(po.id)}/submit-approval`, { method: "POST" });
    const whilePending = await api(`/api/purchase-orders/${encodeURIComponent(po.id)}`, {
      method: "PATCH", body: JSON.stringify({ vendorName: "แก้ระหว่างรออนุมัติ" }),
    });
    expect(whilePending.status).toBe(400);

    await api(`/api/purchase-orders/${encodeURIComponent(po.id)}/approve`, { method: "POST" });
    const whenFinal = await api(`/api/purchase-orders/${encodeURIComponent(po.id)}`, {
      method: "PATCH", body: JSON.stringify({ vendorName: "แก้หลังอนุมัติ" }),
    });
    expect(whenFinal.status).toBe(400);
  });

  it("Rewrite ได้ฉบับ -R1 เป็นร่างใหม่ และฉบับเดิมยังอนุมัติอยู่เหมือนเดิม", async () => {
    const po = await createPurchaseOrder();
    await approvePurchaseOrder(po.id);

    const res = await api(`/api/purchase-orders/${encodeURIComponent(po.id)}/rewrite`, { method: "POST" });
    expect(res.status).toBe(201);
    const rewritten = (await json<{ purchaseOrder: PurchaseOrderDoc }>(res)).purchaseOrder;
    expect(rewritten.id).toBe(`${po.id}-R1`);
    expect(rewritten.status).toBe("Draft");

    const original = await json<{ purchaseOrder: PurchaseOrderDoc }>(await api(`/api/purchase-orders/${encodeURIComponent(po.id)}`));
    expect(original.purchaseOrder.status).toBe("Final");
  });

  it("ใบร่างยัง Rewrite ไม่ได้ — ต้องอนุมัติก่อน", async () => {
    const po = await createPurchaseOrder();
    const res = await api(`/api/purchase-orders/${encodeURIComponent(po.id)}/rewrite`, { method: "POST" });
    expect(res.status).toBe(400);
  });
});

describe("สิทธิ์ — บทบาทที่ไม่มีสิทธิ์จัดซื้อเข้าไม่ได้เลย", () => {
  it("ไม่มี purchaseOrder:view แล้ว list/get/create ต้องถูกปฏิเสธทั้งหมด", async () => {
    // บทบาทที่มีแต่สิทธิ์ดูใบเสนอราคา — ไม่มีสิทธิ์อะไรของโมดูลจัดซื้อสักตัว
    const roleRes = await api("/api/roles", {
      method: "POST",
      body: JSON.stringify({ name: "Sales Only", description: "", permissions: ["quotation:view"] }),
    });
    expect(roleRes.status).toBe(201);
    const roleKey = (await json<{ role: { key: string } }>(roleRes)).role.key;

    const userRes = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({
        employeeId: "E099", fullName: "Sales Only", username: "salesonly", email: "sales@test.local",
        password: "correct-horse-9", roleKey, department: "Sales",
      }),
    });
    expect(userRes.status).toBe(201);

    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ identifier: "salesonly", password: "correct-horse-9" }),
    });
    const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
    const asSales = (path: string, init: RequestInit = {}) =>
      fetch(`${baseUrl}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });

    for (const path of ["/api/purchase-orders"]) {
      expect((await asSales(path)).status).toBe(403);
      expect((await asSales(path, { method: "POST", body: "{}" })).status).toBe(403);
    }
  });
});

/**
 * ทะเบียนผู้ขาย (2026-08-31) — เจ้าของขอไว้ 2026-08-28 พร้อมรหัสผู้ขาย
 *
 * สิ่งที่ตรึงไว้คือ **ความซ้ำของรหัส** ซึ่งเป็นข้อเดียวที่แก้ทีหลังแล้วเจ็บ: ต้องกันแบบไม่สนตัวพิมพ์
 * ("v-001" กับ "V-001" คืออันเดียวกัน) ต้องไม่ชนกับตัวเองตอนแก้ และรหัสว่างต้องมีได้หลายราย
 */
type VendorDoc = { id: string; name: string; code: string; contactName: string; isActive: boolean; isDeleted: boolean };

async function createVendor(body: Record<string, unknown>): Promise<Response> {
  return api("/api/vendors", { method: "POST", body: JSON.stringify(body) });
}

/**
 * ช่องที่ถอดออกจากใบขอซื้อ 2026-08-31 ตามที่เจ้าของสั่ง: *"ใบขอซื้อไม่ต้องมีผู้จำหน่าย เครดิต ขนส่งโดย"*
 *
 * ตรึงไว้เพราะการถอดไม่ใช่แค่ลบช่องบนหน้าจอ — เดิม `purchaseOrderHandler` ก๊อปสามช่องนี้จากใบขอซื้อ
 * ไปใบสั่งซื้อ ถ้าใครเผลอเอากลับมา เส้นทางนั้นจะกลับมาเงียบ ๆ โดยไม่มีอะไรฟ้อง
 */
describe("ใบขอซื้อ — ช่องที่ถอดออกแล้ว", () => {
  it("เซิร์ฟเวอร์ไม่บันทึกผู้จำหน่าย/เครดิต/ขนส่งโดย แม้จะส่งมา", async () => {
    const pr = await createStandalonePurchaseRequest();
    const patched = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ vendorName: "ห้ามเก็บ", vendorPhone: "02-000-0000", creditDays: 45, shippingMethod: "ห้ามเก็บ", deliveryLocation: "โรงงาน" }),
    });
    expect(patched.status).toBe(200);
    const doc = (await json<{ purchaseRequest: Record<string, unknown> }>(patched)).purchaseRequest;
    expect(doc.vendorName, "ฟิลด์ที่ถอดออกแล้วต้องไม่โผล่กลับมาในคำตอบ").toBeUndefined();
    expect(doc.vendorPhone).toBeUndefined();
    expect(doc.creditDays).toBeUndefined();
    expect(doc.shippingMethod).toBeUndefined();
    expect(doc.deliveryLocation, "ส่วนที่ยังอยู่บนฟอร์มต้องยังบันทึกได้").toBe("โรงงาน");
  });

  it("ใบสั่งซื้อที่สร้างจากใบขอซื้อเริ่มด้วยผู้ขายว่าง รอฝ่ายจัดซื้อเลือกจากทะเบียน", async () => {
    const pr = await approvedPurchaseRequest();
    const po = await createPurchaseOrder({ purchaseRequestId: pr.id });
    expect(po.vendorName).toBe("");
    // แต่สิ่งที่ควรสืบทอดยังสืบทอดอยู่
    expect(po.purchaseRequestId).toBe(pr.id);
    expect(po.lines.length).toBeGreaterThan(0);
  });
});

/**
 * *"ใบสั่งซื้อให้มีรายละเอียดด้วยที่ดึงมาจากใบขอซื้อ"* (เจ้าของ 2026-08-28)
 *
 * เดิมตัวก๊อป PR→PO ทิ้ง `neededByDate`/`departmentCode`/`costCode` ต่อบรรทัดไปเงียบ ๆ เพราะ
 * ใบสั่งซื้อไม่มีที่เก็บ — ตอนนี้มีแล้ว และตรึงไว้ว่าต้องมาถึงจริง
 */
describe("ใบสั่งซื้อ — รายละเอียดต่อบรรทัดที่ดึงมาจากใบขอซื้อ และส่วนลด", () => {
  it("ก๊อปวันต้องการ / รหัสแผนก / รหัสบัญชี ต่อบรรทัดมาด้วย", async () => {
    const pr = await approvedPurchaseRequest();
    const po = await createPurchaseOrder({ purchaseRequestId: pr.id });
    const first = po.lines[0] as unknown as Record<string, unknown>;
    expect(first.neededByDate).toBe("2026-09-15");
    expect(first.departmentCode).toBe("G143");
    expect(first.costCode).toBe("5150-13");
  });

  it("บันทึกส่วนลดรายบรรทัดและส่วนลดท้ายใบได้ และโหมดที่ไม่รู้จักถือเป็นเปอร์เซ็นต์", async () => {
    const po = await createPurchaseOrder({});
    const patched = await api(`/api/purchase-orders/${encodeURIComponent(po.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        discount: 5, discountMode: "amount",
        lines: [{ id: "x1", productId: null, productCode: "", description: "ของ", subDetails: [], unit: "ชิ้น", qty: 1, unitPrice: 100, discount: 10, discountMode: "เดาไม่ถูก", remark: "" }],
      }),
    });
    expect(patched.status, JSON.stringify(await patched.clone().json())).toBe(200);
    const saved = (await json<{ purchaseOrder: Record<string, unknown> }>(patched)).purchaseOrder;
    expect(saved.discount).toBe(5);
    expect(saved.discountMode).toBe("amount");
    const savedLine = (saved.lines as Record<string, unknown>[])[0];
    expect(savedLine.discount).toBe(10);
    expect(savedLine.discountMode, "โหมดแปลก ๆ ต้องกลายเป็น percent ไม่ใช่เก็บดิบ").toBe("percent");
  });
});

describe("ทะเบียนผู้ขาย", () => {
  it("สร้างผู้ขายพร้อมรหัส แล้วรหัสถูกเก็บเป็นตัวพิมพ์ใหญ่", async () => {
    const res = await createVendor({ name: "บริษัท เหล็กดี จำกัด", code: "v-001", contactName: "คุณเอ", phone: "02-111-2222" });
    expect(res.status).toBe(201);
    const vendor = (await json<{ vendor: VendorDoc }>(res)).vendor;
    expect(vendor.name).toBe("บริษัท เหล็กดี จำกัด");
    expect(vendor.code, "รหัสถูก normalize เป็นตัวพิมพ์ใหญ่ ทั้ง regex และ unique index จึงเห็นค่าเดียวกัน").toBe("V-001");
    expect(vendor.isActive).toBe(true);
    expect(vendor.isDeleted).toBe(false);
  });

  it("รหัสซ้ำแบบไม่สนตัวพิมพ์ถูกปฏิเสธด้วย 409 ไม่ใช่ 500", async () => {
    expect((await createVendor({ name: "รายแรก", code: "DUP-9" })).status).toBe(201);
    const clash = await createVendor({ name: "รายที่สอง", code: "dup-9" });
    expect(clash.status).toBe(409);
    expect((await json<{ error: string }>(clash)).error).toContain("รหัสผู้ขาย");
  });

  it("รหัสว่างมีได้หลายราย — ไม่ใช่ทุกคนมีรหัสตั้งแต่วันแรก", async () => {
    expect((await createVendor({ name: "ไม่มีรหัส ก" })).status).toBe(201);
    expect((await createVendor({ name: "ไม่มีรหัส ข" })).status).toBe(201);
  });

  it("ชื่อผู้ขายเป็นฟิลด์บังคับ", async () => {
    expect((await createVendor({ code: "NO-NAME" })).status).toBe(400);
  });

  it("แก้ไขผู้ขายโดยคงรหัสเดิมไว้ได้ — ต้องไม่ชนกับตัวเอง", async () => {
    const created = (await json<{ vendor: VendorDoc }>(await createVendor({ name: "รายที่แก้", code: "SELF-1" }))).vendor;
    const patched = await api(`/api/vendors/${encodeURIComponent(created.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ code: "SELF-1", contactName: "คุณบี" }),
    });
    expect(patched.status, JSON.stringify(await patched.clone().json())).toBe(200);
    expect((await json<{ vendor: VendorDoc }>(patched)).vendor.contactName).toBe("คุณบี");
  });

  it("แก้รหัสไปชนรายอื่นยังโดน 409", async () => {
    await createVendor({ name: "เจ้าของรหัส", code: "TAKEN-1" });
    const other = (await json<{ vendor: VendorDoc }>(await createVendor({ name: "อีกราย", code: "FREE-1" }))).vendor;
    const clash = await api(`/api/vendors/${encodeURIComponent(other.id)}`, { method: "PATCH", body: JSON.stringify({ code: "taken-1" }) });
    expect(clash.status).toBe(409);
  });

  it("เก็บถาวรแล้วยังอยู่ในฐานข้อมูล — ใบสั่งซื้อเก่าอ้างชื่อผู้ขายไว้", async () => {
    const created = (await json<{ vendor: VendorDoc }>(await createVendor({ name: "รายที่เก็บถาวร", code: "ARCH-1" }))).vendor;
    const archived = await api(`/api/vendors/${encodeURIComponent(created.id)}/archive`, { method: "POST", body: JSON.stringify({ isDeleted: true }) });
    expect(archived.status).toBe(200);
    expect((await json<{ vendor: VendorDoc }>(archived)).vendor.isDeleted).toBe(true);

    const restored = await api(`/api/vendors/${encodeURIComponent(created.id)}/archive`, { method: "POST", body: JSON.stringify({ isDeleted: false }) });
    expect((await json<{ vendor: VendorDoc }>(restored)).vendor.isDeleted).toBe(false);
  });

  it("อ่านรายการผู้ขายผ่าน Express route ได้จริง", async () => {
    const res = await api("/api/vendors");
    expect(res.status, "server/app.ts ต้องมีบรรทัด vendors ไม่งั้นจะ 404 เฉพาะบนเครื่อง").toBe(200);
    const { vendors } = await json<{ vendors: VendorDoc[] }>(res);
    expect(vendors.length).toBeGreaterThan(0);
    // ไม่ตรึงลำดับการเรียงไว้: เซิร์ฟเวอร์ใช้ sort({ name: 1 }) ของ MongoDB ซึ่งเทียบแบบไบนารี
    // ส่วน localeCompare ของ JS เทียบตามภาษา — ชื่อไทยปนอังกฤษจะได้คนละลำดับ และไม่ใช่ลำดับที่
    // ผูกพันกับใคร (หน้าจอกรอง/ค้นเองอยู่แล้ว) สิ่งที่ต้องตรึงจริงคือ route ใช้งานได้
  });
});

/**
 * **ขั้นสโตร์เช็คของ (2026-09-09)** — ไหลงานที่เจ้าของสั่ง: สร้างใบ → หัวหน้าฝ่ายอนุมัติ →
 * สโตร์เช็คของ → มีของ = จ่ายจบ / ไม่มี = ส่งต่อจัดซื้อ
 *
 * สี่อย่างที่ตรึงไว้เพราะแก้ทีหลังแล้วเจ็บ:
 *   1. อนุมัติแล้วใบต้องอยู่ที่ `storeStage: "pending"` และ**ออกใบสั่งซื้อยังไม่ได้**
 *   2. สโตร์บอกว่าไม่มีของ → `"forwarded"` และออกใบสั่งซื้อได้
 *   3. สโตร์จ่ายของจริง → สต๊อกลดจริง ใบปิดเป็น `"closed"` และออกใบสั่งซื้อไม่ได้อีก
 *   4. บรรทัดที่สโตร์จ่ายจากสต๊อก**ไม่ถูกลอกไปใบสั่งซื้อ** (ไม่งั้นซื้อของที่มีอยู่แล้วซ้ำ)
 */
describe("ใบขอซื้อ — ขั้นสโตร์เช็คของ", () => {
  /** สินค้าจริงในคลังพร้อมยอดตั้งต้น — ต้องมีรหัสสินค้า ไม่งั้นสโตร์จ่ายของไม่ได้ */
  async function productWithStock(code: string, qty: number, unitCost?: number): Promise<string> {
    const catRes = await api("/api/categories", { method: "POST", body: JSON.stringify({ name: `หมวด ${code}` }) });
    expect(catRes.status).toBe(201);
    const categoryId = (await json<{ category: { id: string } }>(catRes)).category.id;
    const prodRes = await api("/api/products", {
      method: "POST",
      body: JSON.stringify({ code, name: `สินค้า ${code}`, categoryId, unit: "ชิ้น", defaultPrice: 0 }),
    });
    expect(prodRes.status).toBe(201);
    const productId = (await json<{ product: { id: string } }>(prodRes)).product.id;
    const moveRes = await api("/api/stock-movements", {
      method: "POST",
      body: JSON.stringify({ productId, kind: "receive", qty, reason: "ตั้งยอดตั้งต้น", ...(unitCost === undefined ? {} : { unitCost }) }),
    });
    expect(moveRes.status).toBe(201);
    return productId;
  }

  async function stockOf(productId: string): Promise<number> {
    const res = await api("/api/products");
    const { products } = await json<{ products: { id: string; stockQty: number }[] }>(res);
    return products.find((p) => p.id === productId)?.stockQty ?? 0;
  }

  it("อนุมัติแล้วรอสโตร์ — ออกใบสั่งซื้อยังไม่ได้", async () => {
    const pr = await approvedAwaitingStore();
    expect(pr.storeStage).toBe("pending");
    const po = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ purchaseRequestId: pr.id }) });
    expect(po.status).toBe(400);
  });

  it("สโตร์บอกว่าไม่มีของ — ส่งต่อจัดซื้อแล้วออกใบสั่งซื้อได้", async () => {
    const pr = await approvedAwaitingStore();
    const reviewed = await storeForwardsToPurchasing(pr.id);
    expect(reviewed.storeStage).toBe("forwarded");
    expect(reviewed.storeRemark).toBe("ไม่มีของทั้งสองรายการ");
    expect(reviewed.lines.every((l) => l.storeDecision === "purchase")).toBe(true);
    const po = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ purchaseRequestId: pr.id }) });
    expect(po.status).toBe(201);
  });

  it("มีของครบแล้วจ่ายครบ — สต๊อกลดจริง ใบปิด และออกใบสั่งซื้อไม่ได้อีก", async () => {
    const productId = await productWithStock("STK-001", 10);
    const pr = await createStandalonePurchaseRequest();
    const patched = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH",
      body: JSON.stringify({ lines: [{ id: "s1", productId, subDetails: [], qtyRequested: 4, remark: "" }] }),
    });
    expect(patched.status).toBe(200);
    expect((await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/submit-approval`, { method: "POST" })).status).toBe(200);
    expect((await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/approve`, { method: "POST" })).status).toBe(200);

    const reviewed = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-review`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", decision: "stock" }] }),
    });
    expect(reviewed.status).toBe(200);
    // เช็คแล้วว่ามีของ แต่ยังไม่จ่าย — ยังเป็นงานของสโตร์อยู่ ไม่ใช่ของจัดซื้อ
    expect((await json<{ purchaseRequest: PurchaseRequestDoc }>(reviewed)).purchaseRequest.storeStage).toBe("pending");

    const issued = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-issues`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", qty: 4 }], remark: "จ่ายครบ" }),
    });
    expect(issued.status).toBe(200);
    const afterIssue = (await json<{ purchaseRequest: PurchaseRequestDoc; stockByProduct: Record<string, number> }>(issued));
    expect(afterIssue.purchaseRequest.storeStage).toBe("closed");
    expect(afterIssue.stockByProduct[productId]).toBe(6);
    expect(await stockOf(productId)).toBe(6);

    const po = await api("/api/purchase-orders", { method: "POST", body: JSON.stringify({ purchaseRequestId: pr.id }) });
    expect(po.status).toBe(400);
  });

  it("จ่ายเกินที่ขอไม่ได้ และจ่ายเกินที่มีในคลังไม่ได้", async () => {
    const productId = await productWithStock("STK-002", 3);
    const pr = await createStandalonePurchaseRequest();
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH", body: JSON.stringify({ lines: [{ id: "s1", productId, subDetails: [], qtyRequested: 5, remark: "" }] }),
    });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/submit-approval`, { method: "POST" });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/approve`, { method: "POST" });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-review`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", decision: "stock" }] }),
    });

    const tooMany = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-issues`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", qty: 6 }] }),
    });
    expect(tooMany.status, "จ่ายเกินจำนวนที่ขอไว้").toBe(400);

    const shortStock = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-issues`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", qty: 5 }] }),
    });
    expect(shortStock.status, "ของในคลังมีแค่ 3").toBe(400);
    expect(await stockOf(productId), "ปฏิเสธแล้วต้องไม่ตัดสต๊อกเลย").toBe(3);
  });

  it("บรรทัดที่จ่ายจากสต๊อกไม่ถูกลอกไปใบสั่งซื้อ", async () => {
    const productId = await productWithStock("STK-003", 10);
    const pr = await createStandalonePurchaseRequest();
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        lines: [
          { id: "have", productId, subDetails: [], qtyRequested: 2, remark: "" },
          { id: "buy", productId: null, productCode: "", description: "ของที่ต้องซื้อ", subDetails: [], unit: "ชุด", qtyRequested: 1, remark: "" },
        ],
      }),
    });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/submit-approval`, { method: "POST" });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/approve`, { method: "POST" });
    const reviewed = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-review`, {
      method: "POST",
      body: JSON.stringify({ lines: [{ lineId: "have", decision: "stock" }, { lineId: "buy", decision: "purchase" }] }),
    });
    expect((await json<{ purchaseRequest: PurchaseRequestDoc }>(reviewed)).purchaseRequest.storeStage).toBe("forwarded");

    const po = await createPurchaseOrder({ purchaseRequestId: pr.id });
    expect(po.lines).toHaveLength(1);
    expect(po.lines[0].description).toBe("ของที่ต้องซื้อ");
  });

  it("ยกเลิกรอบการจ่ายล่าสุด — ของกลับเข้าคลังด้วยราคาซื้อล่าสุด", async () => {
    const productId = await productWithStock("STK-004", 8, 125);
    const pr = await createStandalonePurchaseRequest();
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH", body: JSON.stringify({ lines: [{ id: "s1", productId, subDetails: [], qtyRequested: 5, remark: "" }] }),
    });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/submit-approval`, { method: "POST" });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/approve`, { method: "POST" });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-review`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", decision: "stock" }] }),
    });
    const issued = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-issues`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", qty: 5 }] }),
    });
    const batchId = (await json<{ purchaseRequest: PurchaseRequestDoc }>(issued)).purchaseRequest.storeIssues?.[0].id ?? "";
    expect(batchId).not.toBe("");
    expect(await stockOf(productId)).toBe(3);

    const cancelled = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-issues/${encodeURIComponent(batchId)}`, { method: "DELETE" });
    expect(cancelled.status).toBe(200);
    const after = await json<{ purchaseRequest: PurchaseRequestDoc }>(cancelled);
    expect(after.purchaseRequest.storeIssues ?? []).toHaveLength(0);
    expect(await stockOf(productId)).toBe(8);

    // แถวที่คืนเข้าคลังต้องลงด้วยราคาซื้อล่าสุด (125) ไม่ใช่ 0 และไม่ใช่ราคาขาย
    const moves = await api(`/api/stock-movements?productId=${encodeURIComponent(productId)}`);
    const { movements } = await json<{ movements: { kind: string; unitCost?: number }[] }>(moves);
    const returned = movements.find((m) => m.kind === "return");
    expect(returned?.unitCost).toBe(125);
  });
});

/**
 * **ฝ่ายจัดซื้อแก้ใบที่อนุมัติแล้ว (2026-09-09)** — เจ้าของสั่ง: *"จัดซื้อสามารถแก้ไข PR ได้ เนื่องจาก
 * ชื่อหรือยี่ห้อตอนซื้ออาจจะไม่ตรงตามที่พิมพ์ไว้ในใบ"* และเลือกให้แก้ได้ทุกช่องเหมือนใบร่าง
 */
describe("ใบขอซื้อ — ขั้นของฝ่ายจัดซื้อ (2026-09-21)", () => {
  it("สโตร์ส่งต่อ = ใบเข้าขั้น review ของจัดซื้อ แล้วจัดซื้ออนุมัติจนล็อกใบได้", async () => {
    const pr = await approvedPurchaseRequest();
    expect(pr.purchasingStage, "สโตร์ส่งต่อแล้วใบต้องอยู่ในมือจัดซื้อ").toBe("review");

    const res = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-approve`, { method: "POST" });
    expect(res.status).toBe(200);
    const approved = (await json<{ purchaseRequest: PurchaseRequestDoc }>(res)).purchaseRequest;
    expect(approved.purchasingStage).toBe("approved");
    expect(approved.status, "ยังเป็นเอกสาร Final เหมือนเดิม ไม่ใช่สถานะที่ 4").toBe("Final");
    // ลงชื่อในช่อง "ฝ่ายจัดซื้อ" ให้อัตโนมัติเมื่อยังไม่มีใครพิมพ์ไว้
    expect((approved.purchasingDeptBy ?? "").trim()).not.toBe("");
    expect((approved.purchasingDeptAt ?? "").trim()).not.toBe("");
    expect((approved.purchasingApprovedByUserId ?? "").trim()).not.toBe("");
  });

  it("อนุมัติแล้วแก้ใบไม่ได้ จนกว่าจะถอนการอนุมัติ", async () => {
    const pr = await approvedPurchaseRequest();
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-approve`, { method: "POST" });

    const blocked = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH", body: JSON.stringify({ headerRemark: "แก้หลังล็อก" }),
    });
    expect(blocked.status).toBe(400);

    const reopened = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-reopen`, { method: "POST" });
    expect(reopened.status).toBe(200);
    expect((await json<{ purchaseRequest: PurchaseRequestDoc }>(reopened)).purchaseRequest.purchasingStage).toBe("review");

    const ok = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH", body: JSON.stringify({ headerRemark: "แก้ได้แล้ว" }),
    });
    expect(ok.status).toBe(200);
  });

  it("ออกใบสั่งซื้อไปแล้วถอนการอนุมัติไม่ได้", async () => {
    const pr = await approvedPurchaseRequest();
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-approve`, { method: "POST" });
    await createPurchaseOrder({ purchaseRequestId: pr.id });

    const res = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-reopen`, { method: "POST" });
    expect(res.status).toBe(400);
  });

  it("อนุมัติซ้ำไม่ได้ และใบที่ยังรอสโตร์อนุมัติฝั่งจัดซื้อไม่ได้", async () => {
    const waiting = await approvedAwaitingStore();
    expect(waiting.purchasingStage, "ใบที่ยังรอสโตร์ยังไม่เข้ามือจัดซื้อ").toBeUndefined();
    const tooEarly = await api(`/api/purchase-requests/${encodeURIComponent(waiting.id)}/purchasing-approve`, { method: "POST" });
    expect(tooEarly.status).toBe(400);

    const pr = await approvedPurchaseRequest();
    expect((await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-approve`, { method: "POST" })).status).toBe(200);
    expect((await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-approve`, { method: "POST" })).status).toBe(400);
  });

  it("เช็คของซ้ำหลังจัดซื้ออนุมัติแล้ว ไม่รีเซ็ตขั้นของจัดซื้อทิ้ง", async () => {
    const pr = await approvedPurchaseRequest();
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-approve`, { method: "POST" });
    const again = await storeForwardsToPurchasing(pr.id);
    expect(again.storeStage).toBe("forwarded");
    expect(again.purchasingStage, "nextStoreStage() ต้องไม่แตะฟิลด์ของจัดซื้อ").toBe("approved");
  });

  it("จัดซื้อดึงใบที่ยังรอสโตร์มาทำเองได้ — ใบถูกส่งต่อทันทีและลอกบรรทัดครบทุกบรรทัด", async () => {
    const waiting = await approvedAwaitingStore();
    expect(waiting.storeStage).toBe("pending");

    const res = await api(`/api/purchase-requests/${encodeURIComponent(waiting.id)}/pull-to-purchasing`, { method: "POST" });
    expect(res.status).toBe(200);
    const pulled = (await json<{ purchaseRequest: PurchaseRequestDoc }>(res)).purchaseRequest;
    expect(pulled.storeStage).toBe("forwarded");
    expect(pulled.purchasingStage).toBe("review");
    expect(pulled.storeRemark ?? "").toContain("ดึงใบมาดำเนินการเอง");
    // ไม่แตะบรรทัดเลย — storeDecision ยังว่าง ซึ่งตัวกรองตอนสร้าง PO นับว่า "ต้องซื้อ"
    expect(pulled.lines.every((l) => !l.storeDecision)).toBe(true);

    const po = await createPurchaseOrder({ purchaseRequestId: pulled.id });
    expect(po.lines).toHaveLength(pulled.lines.length);
  });

  it("ดึงซ้ำไม่ได้ และใบที่สโตร์ปิดไปแล้วดึงไม่ได้", async () => {
    const waiting = await approvedAwaitingStore();
    expect((await api(`/api/purchase-requests/${encodeURIComponent(waiting.id)}/pull-to-purchasing`, { method: "POST" })).status).toBe(200);
    expect((await api(`/api/purchase-requests/${encodeURIComponent(waiting.id)}/pull-to-purchasing`, { method: "POST" })).status).toBe(400);
  });

  /**
   * บั๊กที่มีโอกาสเกิดสูงสุดของงานชุดนี้ — `handleRewrite` ใช้ `...rest` ถ้าไม่ล้างฟิลด์นี้
   * ฉบับแก้ไขจะเกิดมาพร้อม "approved" แล้วถูกล็อกทันทีที่หัวหน้าอนุมัติ ทั้งที่จัดซื้อยังไม่เคยเห็น
   */
  it("Rewrite แล้วฉบับใหม่ต้องไม่ติดขั้นของจัดซื้อมาด้วย", async () => {
    const pr = await approvedPurchaseRequest();
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/purchasing-approve`, { method: "POST" });

    const res = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/rewrite`, { method: "POST" });
    expect(res.status).toBe(201);
    const rewritten = (await json<{ purchaseRequest: PurchaseRequestDoc }>(res)).purchaseRequest;
    expect(rewritten.status).toBe("Draft");
    expect(rewritten.purchasingStage, "ฉบับแก้ไขต้องเริ่มที่ยังไม่ผ่านจัดซื้อ").toBeUndefined();
    expect(rewritten.purchasingApprovedByUserId ?? "").toBe("");
    expect(rewritten.purchasingDeptBy ?? "").toBe("");
  });
});

describe("ใบขอซื้อ — จัดซื้อแก้ใบที่อนุมัติแล้ว", () => {
  it("แก้ชื่อ/ยี่ห้อบนใบ Final ได้ และถูกจดไว้ในประวัติ", async () => {
    const pr = await approvedPurchaseRequest();
    const patched = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        lines: pr.lines.map((l) => (l.id === "l1" ? { ...l, description: "ปั๊มเคมี ยี่ห้อ Grundfos" } : l)),
        purchasingEditNote: "เปลี่ยนยี่ห้อตามที่ร้านมี",
      }),
    });
    expect(patched.status).toBe(200);
    const updated = (await json<{ purchaseRequest: PurchaseRequestDoc }>(patched)).purchaseRequest;
    expect(updated.status, "แก้แล้วยังเป็นใบที่อนุมัติแล้ว ไม่ถูกตีกลับเป็นร่าง").toBe("Final");
    expect(updated.lines.find((l) => l.id === "l1")?.description).toBe("ปั๊มเคมี ยี่ห้อ Grundfos");
    expect(updated.purchasingEdits ?? []).toHaveLength(1);
    expect((updated.purchasingEdits ?? [])[0].note).toBe("เปลี่ยนยี่ห้อตามที่ร้านมี");
  });

  it("บันทึกอัตโนมัติแก้ใบที่อนุมัติแล้วไม่ได้ (409)", async () => {
    const pr = await approvedPurchaseRequest();
    const auto = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}?autoSave=1`, {
      method: "PATCH", body: JSON.stringify({ headerRemark: "แก้เงียบ ๆ" }),
    });
    expect(auto.status).toBe(409);
  });

  it("ลดจำนวนต่ำกว่าที่สโตร์จ่ายไปแล้วไม่ได้", async () => {
    const catRes = await api("/api/categories", { method: "POST", body: JSON.stringify({ name: "หมวดกันลด" }) });
    const categoryId = (await json<{ category: { id: string } }>(catRes)).category.id;
    const prodRes = await api("/api/products", {
      method: "POST", body: JSON.stringify({ code: "STK-EDIT", name: "สินค้ากันลด", categoryId, unit: "ชิ้น", defaultPrice: 0 }),
    });
    const productId = (await json<{ product: { id: string } }>(prodRes)).product.id;
    await api("/api/stock-movements", { method: "POST", body: JSON.stringify({ productId, kind: "receive", qty: 10, reason: "ตั้งต้น" }) });

    const pr = await createStandalonePurchaseRequest();
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH", body: JSON.stringify({ lines: [{ id: "s1", productId, subDetails: [], qtyRequested: 6, remark: "" }] }),
    });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/submit-approval`, { method: "POST" });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/approve`, { method: "POST" });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-review`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", decision: "stock" }] }),
    });
    await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}/store-issues`, {
      method: "POST", body: JSON.stringify({ lines: [{ lineId: "s1", qty: 4 }] }),
    });

    const shrink = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH", body: JSON.stringify({ lines: [{ id: "s1", productId, subDetails: [], qtyRequested: 2, remark: "" }] }),
    });
    expect(shrink.status).toBe(400);

    const removed = await api(`/api/purchase-requests/${encodeURIComponent(pr.id)}`, {
      method: "PATCH", body: JSON.stringify({ lines: [] }),
    });
    expect(removed.status, "ลบบรรทัดที่จ่ายของไปแล้วไม่ได้").toBe(400);
  });
});

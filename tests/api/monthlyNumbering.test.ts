import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

/**
 * `nextMonthlyDocumentNumber()` — the one `{PREFIX}-{YYYYMM}-{NNNN}` minter every internal document
 * (PO/PR/JO/MR/SC/CC/SR/RR) shares since 2026-09-03. Same in-memory harness as arNumbering.test.ts.
 * The things worth pinning: Gregorian (the owner chose ค.ศ., unlike the AR family), the counter
 * restarts at 0001 on a new month, two prefixes in the same month never share a counter, and a UTC
 * timestamp late on the last day of a month still lands in the Bangkok-local month.
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let countersCollection: typeof import("../../api/_lib/collections.js").countersCollection;
let nextMonthlyDocumentNumber: typeof import("../../api/_lib/documentNumbering.js").nextMonthlyDocumentNumber;
let bangkokYyyyMm: typeof import("../../api/_lib/documentNumbering.js").bangkokYyyyMm;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  ({ countersCollection } = await import("../../api/_lib/collections.js"));
  ({ nextMonthlyDocumentNumber, bangkokYyyyMm } = await import("../../api/_lib/documentNumbering.js"));
});

afterAll(async () => {
  await client.close();
  await mongod.stop();
});

beforeEach(async () => {
  await client.db("tcs_erp").collection("counters").deleteMany({});
});

describe("bangkokYyyyMm()", () => {
  it("ปี ค.ศ. 4 หลัก + เดือน 2 หลัก ตามเวลาไทย", () => {
    expect(bangkokYyyyMm(new Date("2026-09-03T06:00:00.000Z"))).toEqual({ yyyy: "2026", mm: "09" });
  });

  it("ไม่ใช่ พ.ศ. — 2026 ต้องไม่กลายเป็น 2569", () => {
    expect(bangkokYyyyMm(new Date("2026-09-03T06:00:00.000Z")).yyyy).not.toBe("2569");
  });

  it("UTC ดึกวันสิ้นเดือนคือเดือนถัดไปตามเวลาไทยแล้ว", () => {
    expect(bangkokYyyyMm(new Date("2026-08-31T18:30:00.000Z")).mm).toBe("09");
  });
});

describe("nextMonthlyDocumentNumber()", () => {
  it("ใบแรกของเดือนได้ 0001 และรูปแบบคือ PREFIX-YYYYMM-NNNN", async () => {
    const counters = await countersCollection();
    const at = new Date("2026-09-03T06:00:00.000Z");
    expect(await nextMonthlyDocumentNumber(counters, "PO", "purchase_order", at)).toBe("PO-202609-0001");
    expect(await nextMonthlyDocumentNumber(counters, "PO", "purchase_order", at)).toBe("PO-202609-0002");
  });

  it("ข้ามเดือนแล้วเริ่ม 0001 ใหม่ โดยตัวนับเดือนเก่าไม่ถูกแตะ", async () => {
    const counters = await countersCollection();
    await nextMonthlyDocumentNumber(counters, "MR", "material_requisition", new Date("2026-09-30T05:00:00.000Z"));
    await nextMonthlyDocumentNumber(counters, "MR", "material_requisition", new Date("2026-09-30T05:00:00.000Z"));
    expect(await nextMonthlyDocumentNumber(counters, "MR", "material_requisition", new Date("2026-10-01T05:00:00.000Z"))).toBe("MR-202610-0001");
    expect(await nextMonthlyDocumentNumber(counters, "MR", "material_requisition", new Date("2026-09-30T06:00:00.000Z"))).toBe("MR-202609-0003");
  });

  it("คนละ prefix ในเดือนเดียวกันไม่ใช้ตัวนับร่วมกัน", async () => {
    const counters = await countersCollection();
    const at = new Date("2026-09-03T06:00:00.000Z");
    expect(await nextMonthlyDocumentNumber(counters, "PO", "purchase_order", at)).toBe("PO-202609-0001");
    expect(await nextMonthlyDocumentNumber(counters, "PR", "purchase_request", at)).toBe("PR-202609-0001");
    expect(await nextMonthlyDocumentNumber(counters, "RR", "receiving_report", at)).toBe("RR-202609-0001");
  });

  it("ตัวนับเก่าแบบรายปี พ.ศ. ไม่มีผลกับเลขใหม่ (ใบเก่าไม่ถูกเปลี่ยนเลข เลขใหม่ไม่ต่อจากของเก่า)", async () => {
    const counters = await countersCollection();
    await client.db("tcs_erp").collection("counters").insertOne({ _id: "purchase_order_2569" as never, seq: 41 });
    expect(await nextMonthlyDocumentNumber(counters, "PO", "purchase_order", new Date("2026-09-03T06:00:00.000Z"))).toBe("PO-202609-0001");
  });
});

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";

/**
 * Integration test for AR/IV/BI document numbering (api/_lib/documentNumbering.ts) against a
 * throwaway in-memory MongoDB — same harness as tests/api/loginRateLimit.test.ts. Covers the two
 * things most likely to be silently wrong: Buddhist- vs Gregorian-year math, and the Dec 31 -> Jan 1
 * rollover (see docs/MODULES/Accounting.md / the plan's decision #4).
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let countersCollection: typeof import("../../api/_lib/collections.js").countersCollection;
let nextArDocNumber: typeof import("../../api/_lib/documentNumbering.js").nextArDocNumber;
let bangkokBuddhistYyMm: typeof import("../../api/_lib/documentNumbering.js").bangkokBuddhistYyMm;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  ({ countersCollection } = await import("../../api/_lib/collections.js"));
  ({ nextArDocNumber, bangkokBuddhistYyMm } = await import("../../api/_lib/documentNumbering.js"));
});

afterAll(async () => {
  await client.close();
  await mongod.stop();
});

beforeEach(async () => {
  await client.db("tcs_erp").collection("counters").deleteMany({});
});

describe("bangkokBuddhistYyMm() — Buddhist year, not Gregorian", () => {
  it("2026-08-17 (UTC) -> Buddhist 2569 -> yy '69', mm '08' — matches the real reference PDFs' AR6907008/IV6908014", () => {
    // Bangkok is UTC+7 — pick a UTC time safely mid-day Bangkok so the +7h shift can't cross a day
    // boundary and confuse the test.
    const { yy, mm } = bangkokBuddhistYyMm(new Date("2026-08-17T06:00:00.000Z"));
    expect(yy).toBe("69");
    expect(mm).toBe("08");
  });

  it("is Buddhist (+543), not Gregorian %100 — 2026 must NOT produce yy '26'", () => {
    const { yy } = bangkokBuddhistYyMm(new Date("2026-08-17T06:00:00.000Z"));
    expect(yy).not.toBe("26");
  });

  it("a UTC-side date near midnight Bangkok still resolves to the correct Bangkok-local month", () => {
    // 2026-07-31T18:00:00Z + 7h = 2026-08-01T01:00:00 Bangkok-local -> should already be August.
    const { mm } = bangkokBuddhistYyMm(new Date("2026-07-31T18:00:00.000Z"));
    expect(mm).toBe("08");
  });
});

describe("nextArDocNumber() — atomic per (prefix, yy, mm) sequence", () => {
  it("first document of the month for a prefix gets seq 001", async () => {
    const counters = await countersCollection();
    const docNo = await nextArDocNumber(counters, "AR");
    expect(docNo).toMatch(/^AR\d{4}001$/);
  });

  it("increments per prefix independently within the same month", async () => {
    const counters = await countersCollection();
    const ar1 = await nextArDocNumber(counters, "AR");
    const iv1 = await nextArDocNumber(counters, "IV");
    const ar2 = await nextArDocNumber(counters, "AR");
    expect(ar1.slice(0, 2)).toBe("AR");
    expect(iv1.slice(0, 2)).toBe("IV");
    expect(ar1.slice(-3)).toBe("001");
    expect(iv1.slice(-3)).toBe("001"); // independent counter from AR's, not sharing the sequence
    expect(ar2.slice(-3)).toBe("002");
  });

  it("RE (receipt, added 2026-08-18) runs its own independent monthly sequence like the Phase-1 prefixes", async () => {
    const counters = await countersCollection();
    await nextArDocNumber(counters, "AR"); // bump AR so a shared counter would be exposed
    const re1 = await nextArDocNumber(counters, "RE");
    const re2 = await nextArDocNumber(counters, "RE");
    expect(re1).toMatch(/^RE\d{4}001$/);
    expect(re2.slice(-3)).toBe("002");
  });

  it("format is exactly {PREFIX}{YY}{MM}{SEQ:3} — 9 characters, matching the real AR6907008 shape", async () => {
    const counters = await countersCollection();
    const docNo = await nextArDocNumber(counters, "BI");
    expect(docNo).toHaveLength(9);
    expect(docNo).toMatch(/^BI\d{7}$/);
  });

  it("10 concurrent issuances for the same prefix never collide and land on 001..010", async () => {
    const counters = await countersCollection();
    const results = await Promise.all(Array.from({ length: 10 }, () => nextArDocNumber(counters, "AR")));
    const seqs = results.map((r) => r.slice(-3)).sort();
    expect(seqs).toEqual(["001", "002", "003", "004", "005", "006", "007", "008", "009", "010"]);
    expect(new Set(results).size).toBe(10); // all distinct
  });

  it("Dec 31 -> Jan 1 rollover resets the sequence to 001 under a fresh year key (the case most likely to be silently wrong)", async () => {
    const counters = await countersCollection();
    // 2026-12-31 23:30/23:59 Bangkok-local (UTC 16:30/16:59, well clear of the UTC+7 midnight
    // boundary) -> still Buddhist 2569, December.
    const beforeRollover = await nextArDocNumber(counters, "AR", new Date("2026-12-31T16:30:00.000Z"));
    const beforeRollover2 = await nextArDocNumber(counters, "AR", new Date("2026-12-31T16:59:00.000Z"));
    expect(beforeRollover.slice(-3)).toBe("001");
    expect(beforeRollover2.slice(-3)).toBe("002");
    expect(beforeRollover.slice(2, 6)).toBe("6912"); // Buddhist 69, December

    // 2027-01-01 00:30 Bangkok-local -> Buddhist 2570 ("70"), January — a genuinely new counter key.
    const afterRollover = await nextArDocNumber(counters, "AR", new Date("2026-12-31T17:30:00.000Z"));
    expect(afterRollover.slice(2, 6)).toBe("7001"); // Buddhist 70, January
    expect(afterRollover.slice(-3)).toBe("001"); // fresh sequence, NOT 003
  });
});

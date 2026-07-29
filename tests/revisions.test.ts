import { describe, it, expect } from "vitest";
import { getRevisionRoot, getRevisionNumber, dedupeQuotesByRevisionChain } from "../api/_lib/quoteRevisions";

describe("revision-chain parsing (-R{n} suffix, shared by Quotation + Scope of Work)", () => {
  it("root/number round-trip for originals and revisions", () => {
    expect(getRevisionRoot("QT-2567-0041")).toBe("QT-2567-0041");
    expect(getRevisionNumber("QT-2567-0041")).toBe(0);
    expect(getRevisionRoot("QT-2567-0041-R1")).toBe("QT-2567-0041");
    expect(getRevisionNumber("QT-2567-0041-R2")).toBe(2);
    // Scope of Work numbers use the same convention — incl. free-form manual numbers (2026-07-29)
    expect(getRevisionRoot("PQ202607-6-TA-SK-R1")).toBe("PQ202607-6-TA-SK");
    expect(getRevisionRoot("MY-JOB-01-R3")).toBe("MY-JOB-01");
    expect(getRevisionNumber("MY-JOB-01-R3")).toBe(3);
  });

  it("rewriting an already-rewritten doc advances the SAME chain (never -R1-R1)", () => {
    const r1 = "QT-2567-0041-R1";
    const nextNumber = getRevisionNumber(r1) + 1;
    expect(`${getRevisionRoot(r1)}-R${nextNumber}`).toBe("QT-2567-0041-R2");
  });

  it("ids that merely resemble the suffix don't parse as revisions", () => {
    expect(getRevisionNumber("QT-2567-R")).toBe(0);
    expect(getRevisionNumber("QT-2567-RX1")).toBe(0);
    expect(getRevisionRoot("QT-R1-0042")).toBe("QT-R1-0042"); // -R1 mid-string, not a suffix
  });
});

describe("dedupeQuotesByRevisionChain — Dashboard counts each chain exactly once", () => {
  it("keeps only the latest revision per chain", () => {
    const docs = [
      { _id: "QT-2567-0041", amount: 100 },
      { _id: "QT-2567-0041-R1", amount: 200 },
      { _id: "QT-2567-0041-R2", amount: 300 },
      { _id: "QT-2567-0042", amount: 400 },
    ];
    const out = dedupeQuotesByRevisionChain(docs);
    expect(out).toHaveLength(2);
    const byRoot = new Map(out.map((d) => [getRevisionRoot(d._id), d]));
    expect(byRoot.get("QT-2567-0041")?._id).toBe("QT-2567-0041-R2");
    expect(byRoot.get("QT-2567-0042")?._id).toBe("QT-2567-0042");
  });

  it("input order doesn't change the winner", () => {
    const shuffled = [
      { _id: "QT-1-R2" }, { _id: "QT-1" }, { _id: "QT-1-R1" },
    ];
    const out = dedupeQuotesByRevisionChain(shuffled);
    expect(out).toHaveLength(1);
    expect(out[0]._id).toBe("QT-1-R2");
  });

  it("an empty input stays empty", () => {
    expect(dedupeQuotesByRevisionChain([])).toEqual([]);
  });
});

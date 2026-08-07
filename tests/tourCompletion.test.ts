import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Guards the per-page tour "seen" storage (src/lib/tour.ts) — one half of the 2026-08-07
 * auto-replay investigation. The storage layer turned out to be correct; the bug was upstream in
 * useDriverTour's unmounting ref latching under StrictMode, so `markPageTourCompleted()` was never
 * reached at all. These tests pin the half that works, in particular that read and write derive the
 * same key: a prefix mismatch here would produce the identical symptom (tour replays forever) with
 * a completely different cause.
 *
 * NOTE: the actual regression — a React effect lifecycle bug — is NOT covered by any automated test
 * in this repo, which has no DOM test environment. See docs/TODO.md.
 */

const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
});

const { hasPageTourCompleted, markPageTourCompleted, hasTourCompleted, markTourCompleted } = await import("../src/lib/tour");

beforeEach(() => store.clear());

describe("per-page tour completion storage", () => {
  it("round-trips: what mark writes is what has reads", () => {
    expect(hasPageTourCompleted("service", "u1")).toBe(false);
    markPageTourCompleted("service", "u1");
    expect(hasPageTourCompleted("service", "u1")).toBe(true);
  });

  it("persists to real storage, so it survives a reload rather than living in memory", () => {
    markPageTourCompleted("serviceDoc", "u1");
    expect(store.get("tcs_erp_page_tour_completed:serviceDoc")).toBe(JSON.stringify(["u1"]));
  });

  it("keeps each tour key independent — all three Service surfaces track separately", () => {
    markPageTourCompleted("service", "u1");
    expect(hasPageTourCompleted("serviceDoc", "u1"), "the report editor is its own tour").toBe(false);
    expect(hasPageTourCompleted("serviceTemplates", "u1")).toBe(false);
  });

  it("keeps each user independent on a shared browser profile", () => {
    markPageTourCompleted("service", "u1");
    expect(hasPageTourCompleted("service", "u2")).toBe(false);
    markPageTourCompleted("service", "u2");
    expect(hasPageTourCompleted("service", "u1")).toBe(true);
    expect(hasPageTourCompleted("service", "u2")).toBe(true);
  });

  it("marking twice is a no-op, not a duplicate entry", () => {
    markPageTourCompleted("service", "u1");
    markPageTourCompleted("service", "u1");
    expect(store.get("tcs_erp_page_tour_completed:service")).toBe(JSON.stringify(["u1"]));
  });

  it("survives corrupted storage instead of throwing into the render path", () => {
    store.set("tcs_erp_page_tour_completed:service", "{not json");
    expect(hasPageTourCompleted("service", "u1")).toBe(false);
  });

  it("the main first-login tour uses its own separate store", () => {
    markTourCompleted("u1");
    expect(hasTourCompleted("u1")).toBe(true);
    expect(hasPageTourCompleted("service", "u1"), "page tours are not implied by the main tour").toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import type { ApiRequest } from "../../api/_lib/httpTypes.js";
import { getPathSegments } from "../../api/_lib/http.js";

/**
 * Regression test for a real bug found 2026-08-18 during the Project module's Stage 6 live-browser
 * walkthrough: every quotation id is formatted like "Q#260817-0001" (a literal "#"), and
 * `src/lib/quotes.tsx`'s `updateQuote()`/`duplicateQuote()`/etc. built API URLs by interpolating
 * the id directly into the path. Browsers strip everything from "#" onward as a URL *fragment*
 * before a fetch() request is ever sent, so every PATCH/POST-by-id on an existing quotation
 * silently hit e.g. `/api/quotes/Q` instead of the real id and 404'd — quotations could never be
 * saved after creation. Fixed by wrapping every id in `encodeURIComponent()` client-side
 * (`src/lib/*.ts`) and decoding each path segment server-side here, so a real request for
 * `/api/quotes/Q%23260817-0001` resolves back to the literal `Q#260817-0001` id.
 */
describe("getPathSegments", () => {
  function req(url: string): ApiRequest {
    return { url } as unknown as ApiRequest;
  }

  it("decodes a percent-encoded id segment back to its literal form (e.g. a quotation id containing '#')", () => {
    expect(getPathSegments(req("/api/quotes/Q%23260817-0001"), "/api/quotes")).toEqual(["Q#260817-0001"]);
  });

  it("leaves a plain alphanumeric/hyphen id segment unchanged (the common case is a no-op)", () => {
    expect(getPathSegments(req("/api/job-orders/JO-2569-0001"), "/api/job-orders")).toEqual(["JO-2569-0001"]);
  });

  it("decodes multiple segments independently (e.g. a nested sub-resource path)", () => {
    expect(getPathSegments(req("/api/projects/proj%23A/items/item%23B"), "/api/projects")).toEqual(["proj#A", "items", "item#B"]);
  });

  it("ignores a query string and strips the prefix as before", () => {
    expect(getPathSegments(req("/api/quotes/Q%23260817-0001?foo=bar"), "/api/quotes")).toEqual(["Q#260817-0001"]);
  });
});

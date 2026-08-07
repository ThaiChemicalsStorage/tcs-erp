import { describe, it, expect, beforeEach } from "vitest";
import { normalizeAppPassword, encryptAppPassword, decryptAppPassword } from "../api/_lib/emailCredentials.js";
import { HttpError } from "../api/_lib/http.js";

/**
 * Unit tests for the Gmail App Password encryption layer (api/_lib/emailCredentials.ts).
 * The key derivation reads EMAIL_CRED_SECRET at call time (with an internal cache keyed by the
 * secret's value), so tests can rotate the secret by just reassigning the env var.
 */

beforeEach(() => {
  process.env.EMAIL_CRED_SECRET = "test-only-email-secret";
});

describe("normalizeAppPassword", () => {
  it("strips whitespace from Gmail's display format", () => {
    expect(normalizeAppPassword("abcd efgh ijkl mnop")).toBe("abcdefghijklmnop");
    expect(normalizeAppPassword(" AbCdEfGhIjKlMnOp ")).toBe("AbCdEfGhIjKlMnOp");
  });

  it("rejects wrong lengths and non-letters with a Thai 400", () => {
    for (const bad of ["short", "abcd efgh ijkl mno", "abcdefghijklmnopq", "abcd1fghijklmnop", ""]) {
      let thrown: unknown;
      try { normalizeAppPassword(bad); } catch (err) { thrown = err; }
      expect(thrown).toBeInstanceOf(HttpError);
      expect((thrown as HttpError).status).toBe(400);
    }
  });
});

describe("encryptAppPassword / decryptAppPassword", () => {
  it("round-trips", () => {
    const enc = encryptAppPassword("abcdefghijklmnop");
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("abcdefghijklmnop");
    expect(decryptAppPassword(enc)).toBe("abcdefghijklmnop");
  });

  it("uses a random IV — two encryptions of the same value differ, both decrypt", () => {
    const a = encryptAppPassword("abcdefghijklmnop");
    const b = encryptAppPassword("abcdefghijklmnop");
    expect(a).not.toBe(b);
    expect(decryptAppPassword(a)).toBe("abcdefghijklmnop");
    expect(decryptAppPassword(b)).toBe("abcdefghijklmnop");
  });

  it("returns null (never throws) on tampered ciphertext", () => {
    const enc = encryptAppPassword("abcdefghijklmnop");
    const parts = enc.split(":");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("aa") ? "bb" : "aa");
    expect(decryptAppPassword(parts.join(":"))).toBeNull();
  });

  it("returns null on garbage / legacy values", () => {
    expect(decryptAppPassword("")).toBeNull();
    expect(decryptAppPassword("not-encrypted")).toBeNull();
    expect(decryptAppPassword("v2:a:b:c")).toBeNull();
  });

  it("returns null after EMAIL_CRED_SECRET rotation (users must re-enter, no 500s)", () => {
    const enc = encryptAppPassword("abcdefghijklmnop");
    process.env.EMAIL_CRED_SECRET = "a-different-secret";
    expect(decryptAppPassword(enc)).toBeNull();
  });

  it("throws a 500 HttpError when EMAIL_CRED_SECRET is unset", () => {
    delete process.env.EMAIL_CRED_SECRET;
    let thrown: unknown;
    try { encryptAppPassword("abcdefghijklmnop"); } catch (err) { thrown = err; }
    expect(thrown).toBeInstanceOf(HttpError);
    expect((thrown as HttpError).status).toBe(500);
  });
});

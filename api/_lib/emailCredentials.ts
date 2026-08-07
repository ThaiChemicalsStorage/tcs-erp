/**
 * Encryption for per-user Gmail App Passwords (`users.emailAppPasswordEnc`) — added 2026-08-07,
 * replacing the central-Resend model with person-to-person sending (each user sends Scope of Work
 * emails from their OWN Gmail account — see docs/MODULES/ScopeOfWork.md "Document Recipients").
 *
 * AES-256-GCM, key derived from the `EMAIL_CRED_SECRET` env var via scrypt. Deliberately a
 * SEPARATE secret from `JWT_SECRET`: rotating `JWT_SECRET` is documented as safe ("logs everyone
 * out"); if it also keyed these credentials, that rotation would silently destroy every stored
 * App Password. Rotating `EMAIL_CRED_SECRET` has its own documented consequence instead — login
 * is unaffected, but every user must re-enter their App Password (decrypt returns null → the
 * caller responds 400 "ตั้งค่าใหม่", never a 500).
 *
 * Stored format: `v1:<iv>:<tag>:<ciphertext>` (base64url each). The plaintext App Password is
 * never returned to any client — `toPublicUser()` strips `emailAppPasswordEnc` and exposes only
 * the derived `hasEmailAppPassword` boolean.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { HttpError } from "./http.js";

const KEY_CONTEXT = "tcs-email-cred-v1";

let cachedKey: { secret: string; key: Buffer } | null = null;

export function isEmailCredSecretConfigured(): boolean {
  return !!process.env.EMAIL_CRED_SECRET;
}

function getEmailCredKey(): Buffer {
  const secret = process.env.EMAIL_CRED_SECRET;
  if (!secret) {
    throw new HttpError(500, "ระบบยังไม่ได้ตั้งค่าการเข้ารหัสอีเมล (EMAIL_CRED_SECRET) กรุณาติดต่อผู้ดูแลระบบ");
  }
  if (!cachedKey || cachedKey.secret !== secret) {
    cachedKey = { secret, key: scryptSync(secret, KEY_CONTEXT, 32) };
  }
  return cachedKey.key;
}

/** Gmail shows App Passwords as `abcd efgh ijkl mnop` — accept whitespace anywhere, but the
 * result must be exactly 16 ASCII letters (Gmail's fixed format). Throws a Thai 400 otherwise. */
export function normalizeAppPassword(raw: string): string {
  const stripped = raw.replace(/\s+/g, "");
  if (!/^[a-zA-Z]{16}$/.test(stripped)) {
    throw new HttpError(400, "รูปแบบ App Password ไม่ถูกต้อง — ต้องเป็นตัวอักษร 16 ตัวที่ได้จาก Google (มีเว้นวรรคได้)");
  }
  return stripped;
}

export function encryptAppPassword(plain: string): string {
  const key = getEmailCredKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

/** Returns null on ANY failure — malformed value, rotated `EMAIL_CRED_SECRET`, tampered
 * ciphertext — so callers degrade to "please set it up again" (400), never an opaque 500. */
export function decryptAppPassword(enc: string): string | null {
  try {
    const [version, ivB64, tagB64, ctB64] = enc.split(":");
    if (version !== "v1" || !ivB64 || !tagB64 || !ctB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", getEmailCredKey(), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

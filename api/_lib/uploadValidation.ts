import { HttpError } from "./http.js";

/**
 * Server-side validation for the base64 data-URL "uploads" this app accepts inline on documents
 * (profile pictures, signatures, company logo/stamp — see DATABASE.md's "still base64-in-document"
 * note). Added per the 2026-07-10 Codex review's Medium finding that these were accepted as
 * arbitrary strings with no MIME/size validation, risking oversized MongoDB documents (16MB/doc
 * ceiling) or a non-image payload being stored and later rendered as an `<img src>`.
 */
const DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/]+=*)$/;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024; // 2MB — generous for a profile/signature/logo image, small next to the 16MB document ceiling.

/** "" (no upload / clearing an existing one) or a real base64 image data URL under the size cap — throws otherwise. */
export function validateImageDataUrl(v: unknown, fieldLabel: string): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v !== "string") throw new HttpError(400, `${fieldLabel}ไม่ถูกต้อง`);
  const match = DATA_URL_PATTERN.exec(v);
  if (!match) throw new HttpError(400, `${fieldLabel}ต้องเป็นไฟล์รูปภาพ (PNG, JPEG, WEBP หรือ GIF)`);
  // Real byte size of base64 (4 chars encode 3 bytes, minus 1-2 bytes for trailing '=' padding) —
  // cheaper than decoding the whole payload just to measure it.
  const base64 = match[2];
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  const approxBytes = (base64.length * 3) / 4 - padding;
  if (approxBytes > MAX_UPLOAD_BYTES) {
    throw new HttpError(400, `${fieldLabel}มีขนาดใหญ่เกินไป (สูงสุด ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB)`);
  }
  return v;
}

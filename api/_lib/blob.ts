import { put, del } from "@vercel/blob";
import { HttpError } from "./http.js";

/**
 * Vercel Blob wrapper (added 2026-07-24 for Scope of Work attachments) — file BYTES live here, not
 * in MongoDB, per the explicit user concern about filling the database up ("กลัว db เต็ม"). MongoDB
 * only ever stores each file's metadata + blob URL (a few hundred bytes), so attachments have
 * effectively zero impact on Atlas storage.
 *
 * ⚠️ Requires a Blob store connected to the Vercel project (Vercel dashboard → Storage → Blob →
 * Connect Project) — NOT configured by this codebase, same convention as `RESEND_API_KEY`
 * (api/_lib/email.ts). Auth works in either of the two forms Vercel provisions (verified against
 * `@vercel/blob` 2.6.1's own credential resolution, and against this project's real store which
 * uses the newer form):
 *   1. classic: a `BLOB_READ_WRITE_TOKEN` env var, or
 *   2. newer stores: a `BLOB_STORE_ID` env var + the OIDC token the Vercel Functions runtime
 *      provides automatically (`VERCEL_OIDC_TOKEN`) — no static token appears in the env list at
 *      all (only `BLOB_STORE_ID` + `BLOB_WEBHOOK_PUBLIC_KEY`), which is exactly what this
 *      project's store looks like.
 * The SDK resolves either automatically; the guard below only answers "is a store connected at
 * all" so a missing store fails with a clear Thai 503 instead of a cryptic SDK error. See
 * docs/TODO.md.
 *
 * Files are uploaded with `access: "public"` + a random URL suffix — the URL is unguessable but
 * requires no auth to open, which is deliberate: attachment links go into the recipient email
 * (api/_lib/scopeOfWorkHandler.ts), and email recipients don't have an authenticated app session
 * in their mail client. Same tradeoff every email-attachment-link service makes.
 */

function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

function requireBlobToken(): void {
  if (!isBlobConfigured()) {
    throw new HttpError(
      503,
      "ยังไม่ได้ตั้งค่าที่เก็บไฟล์ (Vercel Blob) — ผู้ดูแลระบบต้องสร้าง Blob store และเชื่อมกับโปรเจกต์ในหน้า Vercel Dashboard → Storage ก่อนจึงจะแนบไฟล์ได้",
    );
  }
}

/** Uploads one file; returns its public (random-suffix) URL. */
export async function uploadBlobFile(pathname: string, data: Buffer, contentType: string): Promise<string> {
  requireBlobToken();
  const result = await put(pathname, data, {
    access: "public",
    contentType,
    addRandomSuffix: true,
  });
  return result.url;
}

/** Deletes a previously-uploaded file by its URL. Never throws — an orphaned blob is a cheaper
 * failure mode than blocking the user's metadata removal (and is invisible to them either way). */
export async function deleteBlobFile(url: string): Promise<void> {
  if (!isBlobConfigured()) return;
  try {
    await del(url);
  } catch (err) {
    console.warn("Blob delete failed (orphaned file left in storage):", err);
  }
}

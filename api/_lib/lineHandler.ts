import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHmac, randomInt } from "node:crypto";
import { HttpError } from "./http.js";
import { customersCollection, auditLogCollection } from "./collections.js";
import { nowIso } from "../../src/lib/products.js";

/**
 * LINE Official Account integration (added 2026-08-10) — backs the Service Report
 * customer-approval flow (docs/MODULES/Service.md "Customer Approval via LINE"). Two halves:
 *
 * 1. Outbound: `pushLineMessage()` sends the approval Flex message to a customer's linked
 *    `lineUserId` via the Messaging API. Configured by two env vars —
 *    `LINE_CHANNEL_ACCESS_TOKEN` (push/reply auth) and `LINE_CHANNEL_SECRET` (webhook signature).
 *    When unconfigured, the feature degrades gracefully: the approval link still gets created,
 *    staff just copy it manually (`sentViaLine: false`).
 *
 * 2. Inbound: `handleLineWebhook()` receives LINE platform events at `POST /api/line/webhook`.
 *    Its one job is the one-time customer pairing handshake: staff generate a short code
 *    (`POST /api/customers/:id/line-pairing`), tell the customer to add the OA and type it in
 *    chat; the webhook matches the code and stores that chat's `userId` as
 *    `customers.lineUserId` permanently.
 *
 * **Express-runtime only.** Signature verification needs the RAW request body (HMAC-SHA256,
 * base64, `x-line-signature` header) — `server/app.ts` captures it as `req.rawBody` via
 * express.json's `verify` hook. The Vercel demo has no `/api/line` rewrite (vercel.json is
 * deliberately untouched; its runtime also pre-parses bodies, losing the raw bytes), so the
 * OA's Webhook URL must point at the real server.
 */

const LINE_API_BASE = "https://api.line.me/v2/bot";

export function isLinePushConfigured(): boolean {
  return typeof process.env.LINE_CHANNEL_ACCESS_TOKEN === "string" && process.env.LINE_CHANNEL_ACCESS_TOKEN.trim() !== "";
}

async function callLineApi(path: string, payload: unknown): Promise<void> {
  const token = (process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "").trim();
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not configured");
  const resp = await fetch(`${LINE_API_BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    throw new Error(`LINE API ${path} failed: ${resp.status} ${detail.slice(0, 300)}`);
  }
}

export async function pushLineMessage(to: string, messages: unknown[]): Promise<void> {
  await callLineApi("/message/push", { to, messages });
}

/** Replies are free (they don't consume the monthly push quota) but the token is single-use and
 * short-lived — failures here are logged and swallowed, never breaking webhook 200-acking. */
async function replyLineMessage(replyToken: string, text: string): Promise<void> {
  if (!isLinePushConfigured()) return;
  try {
    await callLineApi("/message/reply", { replyToken, messages: [{ type: "text", text }] });
  } catch (err) {
    console.error("[line] reply failed", err);
  }
}

/** The approval push: a Flex bubble in the app's navy/gold, with one URI button opening the
 * time-boxed approval link. `altText` is what notification previews / unsupported clients show. */
export function buildApprovalFlexMessage(input: {
  reportId: string;
  companyName: string;
  customerName: string;
  serviceSystemName: string;
  inspectionDate: string;
  approvalUrl: string;
  expiresAt: string;
}): unknown {
  const row = (label: string, value: string) => ({
    type: "box", layout: "baseline", spacing: "sm",
    contents: [
      { type: "text", text: label, size: "sm", color: "#8a94a6", flex: 3 },
      { type: "text", text: value || "-", size: "sm", color: "#1a1a1a", flex: 5, wrap: true },
    ],
  });
  return {
    type: "flex",
    altText: `รายงานบริการ ${input.reportId} รอการอนุมัติจากท่าน`,
    contents: {
      type: "bubble",
      header: {
        type: "box", layout: "vertical", backgroundColor: "#0b1d3a", paddingAll: "16px", spacing: "xs",
        contents: [
          { type: "text", text: input.companyName || "TCS ERP", size: "xs", weight: "bold", color: "#c9a84c" },
          { type: "text", text: "รายงานบริการรอการอนุมัติ", size: "md", weight: "bold", color: "#ffffff" },
        ],
      },
      body: {
        type: "box", layout: "vertical", spacing: "md",
        contents: [
          row("เลขที่รายงาน", input.reportId),
          row("ลูกค้า", input.customerName),
          row("ระบบที่บริการ", input.serviceSystemName),
          row("วันที่เข้าบริการ", input.inspectionDate),
          { type: "text", text: `ลิงก์ใช้ได้ถึง ${input.expiresAt.slice(0, 10)}`, size: "xs", color: "#8a94a6", margin: "md" },
        ],
      },
      footer: {
        type: "box", layout: "vertical",
        contents: [{
          type: "button", style: "primary", color: "#c9a84c", height: "sm",
          action: { type: "uri", label: "เปิดดูและอนุมัติ", uri: input.approvalUrl },
        }],
      },
    },
  };
}

// ─── Pairing codes ──────────────────────────────────────────────────────────────────────────────

/** No 0/O/1/I/L — the customer types this by hand in a chat. */
const PAIRING_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIRING_CODE_TTL_MS = 24 * 60 * 60 * 1000;

export function generatePairingCode(): string {
  let suffix = "";
  for (let i = 0; i < 5; i++) suffix += PAIRING_ALPHABET[randomInt(PAIRING_ALPHABET.length)];
  return `TCS-${suffix}`;
}

/** Uppercases and strips spacing/dashes so "tcs 4 8 2 1 x" still matches "TCS-4821X". */
function normalizePairingAttempt(text: string): string {
  return text.toUpperCase().replace(/[\s-]+/g, "");
}

// ─── Webhook ────────────────────────────────────────────────────────────────────────────────────

function verifyLineSignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("base64");
  return expected === signature;
}

type LineEvent = {
  type?: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
};

export async function handleLineWebhook(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const secret = (process.env.LINE_CHANNEL_SECRET ?? "").trim();
  // Unconfigured → ack quietly so a stray/verify request never 500s in logs.
  if (!secret) {
    res.status(200).json({ ok: true });
    return;
  }

  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const signature = req.headers["x-line-signature"];
  if (!rawBody || typeof signature !== "string" || !verifyLineSignature(rawBody, signature, secret)) {
    throw new HttpError(403, "Bad signature");
  }

  const events: LineEvent[] = Array.isArray((req.body as { events?: unknown } | undefined)?.events)
    ? ((req.body as { events: LineEvent[] }).events)
    : [];

  for (const event of events) {
    const userId = event.source?.userId ?? "";
    if (event.type === "follow" && event.replyToken) {
      await replyLineMessage(event.replyToken, "สวัสดีครับ นี่คือบัญชีทางการของ TCS สำหรับรับเอกสารอนุมัติ\nหากเจ้าหน้าที่แจ้งรหัสเชื่อมบัญชีให้ท่าน (ขึ้นต้นด้วย TCS-) กรุณาพิมพ์รหัสนั้นในแชทนี้ได้เลยครับ");
      continue;
    }
    if (event.type !== "message" || event.message?.type !== "text" || !userId) continue;
    const attempt = normalizePairingAttempt(event.message.text ?? "");
    // Only react to things that look like a pairing code — ordinary chat stays unanswered.
    if (!/^TCS[A-Z0-9]{4,8}$/.test(attempt)) continue;

    const customers = await customersCollection();
    const candidates = await customers
      .find({ "linePairing.expiresAt": { $gt: nowIso() } }, { projection: { companyName: 1, linePairing: 1 } })
      .toArray();
    const match = candidates.find((c) => c.linePairing && normalizePairingAttempt(c.linePairing.code) === attempt);
    if (!match) {
      if (event.replyToken) await replyLineMessage(event.replyToken, "รหัสเชื่อมบัญชีไม่ถูกต้องหรือหมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อขอรหัสใหม่ครับ");
      continue;
    }

    await customers.updateOne(
      { _id: match._id },
      { $set: { lineUserId: userId, updatedAt: nowIso() }, $unset: { linePairing: "" } },
    );
    const auditLog = await auditLogCollection();
    await auditLog.insertOne({
      userId: "",
      userName: "LINE webhook",
      roleName: "ระบบ",
      module: "ลูกค้า",
      action: "Customer LINE Linked",
      details: `ผูกบัญชี LINE ของลูกค้า ${match.companyName} สำเร็จ (ผ่านรหัสจับคู่)`,
      createdAt: nowIso(),
      relatedCustomerName: match.companyName,
    });
    if (event.replyToken) {
      await replyLineMessage(event.replyToken, `เชื่อมบัญชี LINE กับ "${match.companyName}" เรียบร้อยแล้วครับ\nเมื่อมีเอกสารรอการอนุมัติ ระบบจะส่งให้ทางแชทนี้โดยตรง`);
    }
  }

  res.status(200).json({ ok: true });
}

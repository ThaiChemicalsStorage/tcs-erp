import type { VercelRequest, VercelResponse } from "@vercel/node";
import { withErrorHandling, HttpError, getPathSegments } from "../_lib/http.js";
import { usersCollection, loginAttemptsCollection, ensureIndexes, toPublicUser } from "../_lib/collections.js";
import { hashPassword, verifyPassword, issueSessionCookie, clearSessionCookie, getAuthContext } from "../_lib/auth.js";
import { seedDefaultRolesIfEmpty, bootstrapRbac } from "../_lib/rbacSeed.js";
import { seedSystemDataIfEmpty } from "../_lib/systemSeed.js";
import { defaultRoles } from "../../src/lib/roles.js";
import { nowIso } from "../../src/lib/products.js";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function handleSession(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") throw new HttpError(405, "Method not allowed");
  const ctx = await getAuthContext(req);
  if (ctx) {
    res.status(200).json({ user: ctx.user, needsSetup: false });
    return;
  }
  const users = await usersCollection();
  const count = await users.estimatedDocumentCount();
  res.status(200).json({ user: null, needsSetup: count === 0 });
}

async function handleSetup(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const users = await usersCollection();
  const existing = await users.estimatedDocumentCount();
  if (existing > 0) throw new HttpError(409, "ตั้งค่าเริ่มต้นระบบไปแล้ว");

  const body = req.body ?? {};
  const { employeeId, fullName, username, email, password } = body;
  if (!employeeId?.trim() || !fullName?.trim() || !username?.trim() || !email?.trim() || !password) {
    throw new HttpError(400, "กรุณากรอกข้อมูลให้ครบทุกช่อง");
  }
  if (password.length < 6) throw new HttpError(400, "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");

  await ensureIndexes();
  await seedDefaultRolesIfEmpty();
  // Records every RBAC migration as already-applied on a fresh database — the roles just seeded
  // from defaultRoles are current by definition, so a later boot must never "backfill" them.
  await bootstrapRbac();
  await seedSystemDataIfEmpty();
  const superAdminRole = defaultRoles.find((r) => r.isSuperAdmin) ?? defaultRoles[0];

  const now = nowIso();
  const passwordHash = await hashPassword(password);
  const insertResult = await users.insertOne({
    employeeId: employeeId.trim(),
    fullName: fullName.trim(),
    username: username.trim(),
    email: email.trim(),
    passwordHash,
    phone: "",
    department: "",
    position: "",
    roleKey: superAdminRole.key,
    status: "active",
    profilePictureDataUrl: "",
    signatureDataUrl: "",
    createdAt: now,
    updatedAt: now,
  });
  const doc = await users.findOne({ _id: insertResult.insertedId });
  if (!doc) throw new HttpError(500, "Failed to create user");

  issueSessionCookie(res, doc._id.toString());
  res.status(201).json({ user: toPublicUser(doc) });
}

// ─── Login rate limiting (added 2026-07-29 — closes the long-standing docs/RBAC.md Known Gap) ───
// FAILED attempts are recorded in the `login_attempts` collection and counted over a sliding
// window, keyed two ways: per typed identifier (protects one account from a targeted guess) and
// per requesting IP (blunts a scripted sweep across many usernames — its cap is higher so one
// office NAT IP with several fat-fingering humans doesn't trip it). A successful login clears the
// identifier's failures. MongoDB-backed (not per-instance memory: cold starts reset it and
// concurrent serverless instances don't share it), auto-purged by a TTL index on `createdAt`.

const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_FAILURES_PER_IDENTIFIER = 5;
const MAX_FAILURES_PER_IP = 20;

/** Same defensive once-per-warm-instance pattern as `ensureScopeNumberIndexes()`
 * (api/_lib/scopeOfWorkHandler.ts) — the Setup-Wizard-only `ensureIndexes()` never runs on an
 * already-provisioned deployment, and the TTL index IS the cleanup mechanism, so it must really
 * exist. TTL granularity is ~60s; the `$gte` cutoff in the count query is the precise bound. */
let loginAttemptIndexesEnsured = false;
async function ensureLoginAttemptIndexes(
  attempts: Awaited<ReturnType<typeof loginAttemptsCollection>>,
): Promise<void> {
  if (loginAttemptIndexesEnsured) return;
  await Promise.all([
    attempts.createIndex({ createdAt: 1 }, { expireAfterSeconds: LOGIN_WINDOW_SECONDS }),
    attempts.createIndex({ identifier: 1, createdAt: 1 }),
    attempts.createIndex({ ip: 1, createdAt: 1 }),
  ]);
  loginAttemptIndexesEnsured = true;
}

/** First hop of `x-forwarded-for` — on Vercel that's the real client IP (the platform sets it;
 * a client-supplied value is appended after, never first). Falls back to the socket address for
 * non-proxied local dev. */
function requestIp(req: VercelRequest): string {
  const fwd = req.headers["x-forwarded-for"];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd ?? "").split(",")[0].trim();
  return first || req.socket?.remoteAddress || "unknown";
}

async function handleLogin(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const { identifier, password } = req.body ?? {};
  if (!identifier?.trim() || !password) throw new HttpError(400, "กรุณากรอกชื่อผู้ใช้และรหัสผ่าน");

  // Rate-limit check BEFORE the user lookup + bcrypt compare, so a locked-out caller costs one
  // cheap count query, not a ~100ms hash verification per request.
  const attempts = await loginAttemptsCollection();
  await ensureLoginAttemptIndexes(attempts);
  const identifierKey = identifier.trim().toLowerCase();
  const ip = requestIp(req);
  const cutoff = new Date(Date.now() - LOGIN_WINDOW_SECONDS * 1000);
  const [identifierFailures, ipFailures] = await Promise.all([
    attempts.countDocuments({ identifier: identifierKey, createdAt: { $gte: cutoff } }),
    attempts.countDocuments({ ip, createdAt: { $gte: cutoff } }),
  ]);
  if (identifierFailures >= MAX_FAILURES_PER_IDENTIFIER || ipFailures >= MAX_FAILURES_PER_IP) {
    // Retry hint = when the OLDEST in-window failure ages out (frees one slot). Clamped to ≥1 min
    // so the message never promises "0 minutes".
    const overKey = identifierFailures >= MAX_FAILURES_PER_IDENTIFIER ? { identifier: identifierKey } : { ip };
    const oldest = await attempts.find({ ...overKey, createdAt: { $gte: cutoff } }).sort({ createdAt: 1 }).limit(1).toArray();
    const retryMs = oldest.length > 0 ? oldest[0].createdAt.getTime() + LOGIN_WINDOW_SECONDS * 1000 - Date.now() : LOGIN_WINDOW_SECONDS * 1000;
    const retryMinutes = Math.max(1, Math.ceil(retryMs / 60000));
    res.setHeader("Retry-After", String(Math.max(60, Math.ceil(retryMs / 1000))));
    throw new HttpError(429, `พยายามเข้าสู่ระบบผิดหลายครั้งเกินไป กรุณารอประมาณ ${retryMinutes} นาทีแล้วลองใหม่อีกครั้ง`);
  }

  const users = await usersCollection();
  const needle = escapeRegExp(identifier.trim());
  const re = new RegExp(`^${needle}$`, "i");
  const doc = await users.findOne({ $or: [{ username: re }, { email: re }] });

  if (!doc || !(await verifyPassword(password, doc.passwordHash))) {
    await attempts.insertOne({ identifier: identifierKey, ip, createdAt: new Date() });
    throw new HttpError(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }
  if (doc.status === "inactive") {
    // Correct password — not a guess, so no failure is recorded (and none cleared: an attacker
    // shouldn't be able to reset a lockout by hammering a known-suspended account).
    throw new HttpError(403, "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ");
  }

  // Real login — clear this identifier's failed-attempt history so a legitimate user who
  // fat-fingered a few times doesn't stay one typo away from a lockout all window long.
  await attempts.deleteMany({ identifier: identifierKey });

  issueSessionCookie(res, doc._id.toString());
  res.status(200).json({ user: toPublicUser(doc) });
}

async function handleLogout(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  clearSessionCookie(res);
  res.status(204).end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await withErrorHandling(req, res, async () => {
    const [path] = getPathSegments(req, "/api/auth");

    if (path === "session") return handleSession(req, res);
    if (path === "setup") return handleSetup(req, res);
    if (path === "login") return handleLogin(req, res);
    if (path === "logout") return handleLogout(req, res);
    throw new HttpError(404, "Not found");
  });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import jwt, { type JwtPayload } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { parseCookie, stringifySetCookie } from "cookie";
import { ObjectId } from "mongodb";
import { HttpError } from "./http.js";
import { usersCollection, rolesCollection, toObjectId, toPublicUser, type PublicUser } from "./collections.js";
import { roleHasPermission, findRole } from "../../src/lib/roles.js";
import type { Permission } from "../../src/lib/permissions.js";
import type { Role } from "../../src/lib/roles.js";

const COOKIE_NAME = "tcs_erp_session";
const SESSION_DAYS = 7;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET environment variable");
  return secret;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function issueSessionCookie(res: VercelResponse, userId: string) {
  const token = jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: `${SESSION_DAYS}d` });
  res.setHeader(
    "Set-Cookie",
    stringifySetCookie({ name: COOKIE_NAME, value: token, ...cookieOptions(SESSION_DAYS * 24 * 60 * 60) }),
  );
}

export function clearSessionCookie(res: VercelResponse) {
  res.setHeader("Set-Cookie", stringifySetCookie({ name: COOKIE_NAME, value: "", ...cookieOptions(0) }));
}

/**
 * Rolling/sliding expiration: re-signs and re-issues the session cookie with a fresh SESSION_DAYS
 * window on every request that carries a still-valid token, so an active user is never logged out
 * mid-session. A token only ever reaches its `exp` (and thus 401s) after SESSION_DAYS have passed
 * with zero requests in between. No DB lookup here — cheap enough to run unconditionally per request.
 */
export function refreshSessionCookie(req: VercelRequest, res: VercelResponse) {
  const token = readSessionToken(req);
  if (!token) return;

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return;
  }
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  if (!userId) return;

  issueSessionCookie(res, userId);
}

function readSessionToken(req: VercelRequest): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  return parseCookie(raw)[COOKIE_NAME] ?? null;
}

export interface AuthContext {
  user: PublicUser;
  role: Role | undefined;
}

/**
 * Re-fetches the user (and their role) from the DB on every request rather than trusting JWT
 * claims — this is what makes deactivating/editing a user take effect immediately instead of
 * only after their token expires.
 */
export async function getAuthContext(req: VercelRequest): Promise<AuthContext | null> {
  const token = readSessionToken(req);
  if (!token) return null;

  let payload: JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
  } catch {
    return null;
  }
  const userId = typeof payload.sub === "string" ? payload.sub : null;
  if (!userId || !ObjectId.isValid(userId)) return null;

  const [users, roles] = await Promise.all([usersCollection(), rolesCollection()]);
  const doc = await users.findOne({ _id: toObjectId(userId) });
  if (!doc || doc.status !== "active") return null;

  const roleList = await roles.find({}).toArray();
  return { user: toPublicUser(doc), role: findRole(roleList, doc.roleKey) };
}

export async function requireUser(req: VercelRequest): Promise<AuthContext> {
  const ctx = await getAuthContext(req);
  if (!ctx) throw new HttpError(401, "Not authenticated");
  return ctx;
}

export async function requirePermission(req: VercelRequest, permission: Permission): Promise<AuthContext> {
  const ctx = await requireUser(req);
  if (!roleHasPermission(ctx.role, permission)) {
    throw new HttpError(403, "Forbidden");
  }
  return ctx;
}

/** Passes if the caller holds ANY of the given permissions — for a route two otherwise-unrelated
 * permission groups both need read access to (e.g. GET /api/products, needed by both Product
 * Library and the Stock page's stock:view-only holders). See RBAC.md "Permission dependencies".
 * Named distinctly from `quotationTemplatesHandler.ts`'s own module-local `requireAnyPermission()`
 * (different shape: sync, takes an already-resolved AuthContext) — same "any of" idea, unrelated
 * code, deliberately not sharing a name to avoid confusing the two at a glance. */
export async function requireOneOfPermissions(req: VercelRequest, permissions: Permission[]): Promise<AuthContext> {
  const ctx = await requireUser(req);
  if (!permissions.some((p) => roleHasPermission(ctx.role, p))) {
    throw new HttpError(403, "Forbidden");
  }
  return ctx;
}

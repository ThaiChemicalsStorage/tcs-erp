import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { Permission } from "../../src/lib/permissions";

/**
 * Integration test for permission-dependency auto-inclusion on the real role routes
 * (api/handlers/roles.ts), against a throwaway in-memory MongoDB. The point is to prove the guard
 * holds for a **custom role created through the API** — not merely that the seeded defaultRoles
 * happen to be written correctly. A role saved with service:create but without
 * serviceTemplates:view would get a Service Report editor that fails to load at all.
 */

const PASSWORD = "correct-horse-1";
let mongod: MongoMemoryServer;
let client: MongoClient;
let authHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let rolesHandler: (req: VercelRequest, res: VercelResponse) => Promise<void>;
let sessionCookie = "";

interface CapturedResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

function makeReqRes(method: string, url: string, body?: unknown): { req: VercelRequest; res: VercelResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 0, body: undefined, headers: {} };
  const req = {
    method,
    url,
    body,
    headers: { "x-forwarded-for": "10.0.0.1", cookie: sessionCookie },
    socket: { remoteAddress: "10.0.0.1" },
  } as unknown as VercelRequest;
  const res = {
    status(code: number) { captured.statusCode = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
    setHeader(name: string, value: string) { captured.headers[name.toLowerCase()] = value; return this; },
    end() { return this; },
  } as unknown as VercelResponse;
  return { req, res, captured };
}

async function callRoles(method: string, url: string, body?: unknown): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes(method, url, body);
  await rolesHandler(req, res);
  return captured;
}

async function createRole(name: string, permissions: Permission[]): Promise<{ key: string; permissions: Permission[] }> {
  const r = await callRoles("POST", "/api/roles", { name, description: "", permissions });
  expect(r.statusCode, JSON.stringify(r.body)).toBe(201);
  return (r.body as { role: { key: string; permissions: Permission[] } }).role;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  authHandler = (await import("../../api/handlers/auth.js")).default;
  rolesHandler = (await import("../../api/handlers/roles.js")).default;

  // The Setup Wizard path creates the one Super Admin and hands back a real session cookie —
  // roles:manage is required for every route under test.
  const { req, res, captured } = makeReqRes("POST", "/api/auth/setup", {
    employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: PASSWORD,
  });
  await authHandler(req, res);
  expect(captured.statusCode).toBe(201);
  sessionCookie = captured.headers["set-cookie"].split(";")[0];
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("POST /api/roles auto-includes permission dependencies", () => {
  it("a custom role created with service:create but not serviceTemplates:view gets it added", async () => {
    const role = await createRole("Field Tech", ["service:view", "service:create", "service:edit"]);

    expect(role.permissions, "the whole point: the editor's boot fetch would 403 without this")
      .toContain("serviceTemplates:view");
    // ...and it is genuinely persisted, not just echoed back in the response.
    const stored = await client.db("tcs_erp").collection("roles").findOne({ key: role.key });
    expect(stored?.permissions).toContain("serviceTemplates:view");
  });

  it("adds nothing to a permission set that has no dependencies", async () => {
    const role = await createRole("Stock Clerk", ["products:view", "products:edit"]);
    expect(role.permissions.sort()).toEqual(["products:edit", "products:view"]);
  });

  it("still strips Super-Admin-only permissions while adding dependencies", async () => {
    const role = await createRole("Sneaky", ["service:create", "roles:manage", "company:manage"] as Permission[]);
    expect(role.permissions).toContain("serviceTemplates:view");
    expect(role.permissions).not.toContain("roles:manage");
    expect(role.permissions).not.toContain("company:manage");
  });
});

describe("PATCH /api/roles/:key auto-includes permission dependencies", () => {
  it("re-adds a dependency an edit tried to remove", async () => {
    const role = await createRole("Inspector", ["service:view", "serviceTemplates:view"]);

    // The exact bad edit: untick "เข้าถึงหน้าจัดการ Template รายงานบริการ", keep the Service grant.
    const patched = await callRoles("PATCH", `/api/roles/${role.key}`, { permissions: ["service:view"] });
    expect(patched.statusCode).toBe(200);
    expect((patched.body as { role: { permissions: Permission[] } }).role.permissions)
      .toEqual(["service:view", "serviceTemplates:view"]);
  });

  it("a genuine removal still works when nothing depends on it", async () => {
    const role = await createRole("Downgradable", ["service:view", "products:view"]);
    const patched = await callRoles("PATCH", `/api/roles/${role.key}`, { permissions: ["products:view"] });
    expect(patched.statusCode).toBe(200);
    expect((patched.body as { role: { permissions: Permission[] } }).role.permissions).toEqual(["products:view"]);
  });

  it("an edit that touches only the description leaves permissions alone", async () => {
    const role = await createRole("Untouched", ["service:create"]);
    const patched = await callRoles("PATCH", `/api/roles/${role.key}`, { description: "renamed only" });
    expect(patched.statusCode).toBe(200);
    const body = (patched.body as { role: { permissions: Permission[]; description: string } }).role;
    expect(body.description).toBe("renamed only");
    expect(body.permissions).toEqual(role.permissions);
  });
});

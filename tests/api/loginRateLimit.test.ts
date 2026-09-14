import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient } from "mongodb";
import type { ApiRequest, ApiResponse } from "../../api/_lib/httpTypes.js";

/**
 * Integration test for POST /api/auth/login — the real handler (api/handlers/auth.ts), the real
 * bcrypt/JWT code paths, and the real rate-limiting queries, against a throwaway in-memory MongoDB
 * (mongodb-memory-server downloads and runs an actual mongod). No production data is involved and
 * nothing here can touch a real deployment: MONGODB_URI is pointed at the memory server before the
 * handler module is imported.
 */

const PASSWORD = "correct-horse-1";
let mongod: MongoMemoryServer;
let client: MongoClient;
let authHandler: (req: ApiRequest, res: ApiResponse) => Promise<void>;

interface CapturedResponse {
  statusCode: number;
  body: unknown;
  headers: Record<string, string>;
}

function makeReqRes(path: string, body: unknown, ip = "10.0.0.1"): { req: ApiRequest; res: ApiResponse; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 0, body: undefined, headers: {} };
  const req = {
    method: "POST",
    url: path,
    body,
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  } as unknown as ApiRequest;
  const res = {
    status(code: number) { captured.statusCode = code; return this; },
    json(payload: unknown) { captured.body = payload; return this; },
    setHeader(name: string, value: string) { captured.headers[name.toLowerCase()] = value; return this; },
    end() { return this; },
  } as unknown as ApiResponse;
  return { req, res, captured };
}

async function login(identifier: string, password: string, ip = "10.0.0.1"): Promise<CapturedResponse> {
  const { req, res, captured } = makeReqRes("/api/auth/login", { identifier, password }, ip);
  await authHandler(req, res);
  return captured;
}

async function clearAttempts(): Promise<void> {
  await client.db("tcs_erp").collection("login_attempts").deleteMany({});
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  process.env.JWT_SECRET = "test-only-secret";
  client = new MongoClient(mongod.getUri());
  await client.connect();
  // Import AFTER the env vars point at the memory server — api/_lib/mongodb.ts connects lazily,
  // but late-importing keeps the ordering airtight either way.
  authHandler = (await import("../../api/handlers/auth.js")).default;

  const { req, res, captured } = makeReqRes("/api/auth/setup", {
    employeeId: "E001", fullName: "Admin", username: "admin", email: "admin@test.local", password: PASSWORD,
  });
  await authHandler(req, res);
  expect(captured.statusCode).toBe(201);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("login basics", () => {
  it("correct credentials sign in and set the session cookie", async () => {
    await clearAttempts();
    const { req, res, captured } = makeReqRes("/api/auth/login", { identifier: "admin", password: PASSWORD });
    await authHandler(req, res);
    expect(captured.statusCode).toBe(200);
    expect(captured.headers["set-cookie"]).toContain("tcs_erp_session=");
    expect((captured.body as { user: { username: string } }).user.username).toBe("admin");
  });

  it("wrong password is a 401 with the generic Thai message", async () => {
    await clearAttempts();
    const r = await login("admin", "wrong-password");
    expect(r.statusCode).toBe(401);
    expect((r.body as { error: string }).error).toContain("ไม่ถูกต้อง");
  });
});

describe("rate limiting (5 failures per identifier / 15 min)", () => {
  it("locks the identifier after 5 failures — even the CORRECT password then gets 429", async () => {
    await clearAttempts();
    for (let i = 0; i < 5; i++) {
      const r = await login("admin", `wrong-${i}`);
      expect(r.statusCode, `failure #${i + 1} should still be an ordinary 401`).toBe(401);
    }
    const locked = await login("admin", "wrong-6");
    expect(locked.statusCode).toBe(429);
    expect((locked.body as { error: string }).error).toContain("นาที");
    expect(Number(locked.headers["retry-after"])).toBeGreaterThan(0);

    const correctButLocked = await login("admin", PASSWORD);
    expect(correctButLocked.statusCode, "the lockout must not be bypassable with the right password").toBe(429);
  });

  it("a successful login clears the identifier's failure history", async () => {
    await clearAttempts();
    await login("admin", "wrong-a");
    await login("admin", "wrong-b");
    const ok = await login("admin", PASSWORD);
    expect(ok.statusCode).toBe(200);
    const remaining = await client.db("tcs_erp").collection("login_attempts").countDocuments({ identifier: "admin" });
    expect(remaining).toBe(0);
  });

  it("failures on one identifier never lock a different one", async () => {
    await clearAttempts();
    for (let i = 0; i < 5; i++) await login("someone-else", `wrong-${i}`);
    const r = await login("admin", PASSWORD);
    expect(r.statusCode).toBe(200);
  });

  it("the per-IP cap (20) trips across many identifiers from one address", async () => {
    await clearAttempts();
    const now = new Date();
    await client.db("tcs_erp").collection("login_attempts").insertMany(
      Array.from({ length: 20 }, (_, i) => ({ identifier: `probe-${i}`, ip: "9.9.9.9", createdAt: now })),
    );
    const swept = await login("admin", PASSWORD, "9.9.9.9");
    expect(swept.statusCode).toBe(429);
    const cleanIp = await login("admin", PASSWORD, "10.1.2.3");
    expect(cleanIp.statusCode, "an unrelated IP is unaffected").toBe(200);
  });

  it("failed attempts really land in login_attempts with the caller's IP", async () => {
    await clearAttempts();
    await login("admin", "wrong-x", "172.16.0.9");
    const doc = await client.db("tcs_erp").collection("login_attempts").findOne({ identifier: "admin" });
    expect(doc).toBeTruthy();
    expect(doc?.ip).toBe("172.16.0.9");
    expect(doc?.createdAt).toBeInstanceOf(Date);
  });

  it("a suspended account with the CORRECT password gets 403 and records no failure", async () => {
    await clearAttempts();
    const users = client.db("tcs_erp").collection("users");
    await users.updateOne({ username: "admin" }, { $set: { status: "inactive" } });
    try {
      const r = await login("admin", PASSWORD);
      expect(r.statusCode).toBe(403);
      const count = await client.db("tcs_erp").collection("login_attempts").countDocuments({ identifier: "admin" });
      expect(count, "a correct-password attempt is not a guess and must not count").toBe(0);
    } finally {
      await users.updateOne({ username: "admin" }, { $set: { status: "active" } });
    }
  });

  it("the TTL cleanup index exists on login_attempts", async () => {
    const indexes = await client.db("tcs_erp").collection("login_attempts").indexes();
    const ttl = indexes.find((ix) => ix.key?.createdAt === 1 && typeof ix.expireAfterSeconds === "number");
    expect(ttl?.expireAfterSeconds).toBe(15 * 60);
  });
});

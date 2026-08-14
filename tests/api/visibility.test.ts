import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, type Collection } from "mongodb";
import type { Role } from "../../src/lib/roles";
import type { AuthContext } from "../../api/_lib/auth";

/**
 * Integration test for buildOwnershipClause()/resolveVisibilityScope() (api/_lib/visibility.ts),
 * the shared 4-tier visibility cascade added 2026-08-14 for Sales' 2-team split: own → team →
 * department → all. Runs the real filter against a throwaway in-memory MongoDB, verifying it
 * against actual query results rather than asserting on the Mongo operator shape.
 */

let mongod: MongoMemoryServer;
let client: MongoClient;
let users: Collection<{ department: string; teamId: string }>;
let records: Collection<{ seq: number; createdByUserId: string }>;
let buildOwnershipClause: typeof import("../../api/_lib/visibility.js").buildOwnershipClause;
let resolveVisibilityScope: typeof import("../../api/_lib/visibility.js").resolveVisibilityScope;

let aliceId: string, bobId: string, carolId: string, daveId: string;

function roleWith(...permissions: string[]): Role {
  return { key: "test_role", name: "Test", description: "", permissions: permissions as Role["permissions"], isSuperAdmin: false, isSystem: false };
}

function ctxFor(userId: string, department: string, teamId: string, role: Role | undefined): AuthContext {
  return {
    user: { id: userId, department, teamId } as AuthContext["user"],
    role,
  };
}

async function visibleSeqs(ctx: AuthContext): Promise<number[]> {
  const filter = await buildOwnershipClause(ctx, "quotations", "createdByUserId");
  const docs = await records.find(filter).sort({ seq: 1 }).toArray();
  return docs.map((d) => d.seq);
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  client = new MongoClient(mongod.getUri());
  await client.connect();
  const db = client.db("tcs_erp");
  users = db.collection("users");
  records = db.collection("records");
  // Import AFTER MONGODB_URI points at the memory server.
  const visibility = await import("../../api/_lib/visibility.js");
  buildOwnershipClause = visibility.buildOwnershipClause;
  resolveVisibilityScope = visibility.resolveVisibilityScope;

  // Sales/team1: alice, carol. Sales/team2: bob. Purchasing/no team: dave.
  const aliceRes = await users.insertOne({ department: "Sales", teamId: "team1" });
  const bobRes = await users.insertOne({ department: "Sales", teamId: "team2" });
  const carolRes = await users.insertOne({ department: "Sales", teamId: "team1" });
  const daveRes = await users.insertOne({ department: "Purchasing", teamId: "" });
  aliceId = aliceRes.insertedId.toString();
  bobId = bobRes.insertedId.toString();
  carolId = carolRes.insertedId.toString();
  daveId = daveRes.insertedId.toString();

  await records.insertMany([
    { seq: 1, createdByUserId: aliceId },
    { seq: 2, createdByUserId: bobId },
    { seq: 3, createdByUserId: carolId },
    { seq: 4, createdByUserId: daveId },
    { seq: 5, createdByUserId: "" }, // legacy/ownerless — visible to everyone at every tier
  ]);
});

afterAll(async () => {
  await client?.close();
  await mongod?.stop();
});

describe("resolveVisibilityScope", () => {
  it("resolves to 'own' when the role has no view-tier permissions at all", () => {
    expect(resolveVisibilityScope(ctxFor(aliceId, "Sales", "team1", roleWith("quotations:view")), "quotations")).toBe("own");
  });

  it("resolves to 'team' when the role holds viewTeam and the user has a team", () => {
    expect(resolveVisibilityScope(ctxFor(aliceId, "Sales", "team1", roleWith("quotations:view", "quotations:viewTeam")), "quotations")).toBe("team");
  });

  it("falls back to 'own' for viewTeam when the user has no team assigned", () => {
    expect(resolveVisibilityScope(ctxFor(daveId, "Purchasing", "", roleWith("quotations:view", "quotations:viewTeam")), "quotations")).toBe("own");
  });

  it("resolves to 'department' when the role holds viewDepartment and the user has a department", () => {
    expect(resolveVisibilityScope(ctxFor(aliceId, "Sales", "team1", roleWith("quotations:view", "quotations:viewDepartment")), "quotations")).toBe("department");
  });

  it("prioritizes viewDepartment over viewTeam when a role holds both", () => {
    expect(resolveVisibilityScope(ctxFor(aliceId, "Sales", "team1", roleWith("quotations:view", "quotations:viewTeam", "quotations:viewDepartment")), "quotations")).toBe("department");
  });

  it("resolves to 'all' for viewAll regardless of department/team", () => {
    expect(resolveVisibilityScope(ctxFor(aliceId, "Sales", "team1", roleWith("quotations:viewAll")), "quotations")).toBe("all");
  });

  it("is scoped per module — a viewTeam grant on scopeOfWork doesn't leak into quotations", () => {
    expect(resolveVisibilityScope(ctxFor(aliceId, "Sales", "team1", roleWith("scopeOfWork:viewTeam")), "quotations")).toBe("own");
  });
});

describe("buildOwnershipClause — 4-tier cascade against real query results", () => {
  it("own tier: sees only its own records plus legacy ownerless ones", async () => {
    const ctx = ctxFor(aliceId, "Sales", "team1", roleWith("quotations:view"));
    expect(await visibleSeqs(ctx)).toEqual([1, 5]);
  });

  it("team tier: sees every teammate's records (alice + carol, both team1) plus legacy", async () => {
    const ctx = ctxFor(aliceId, "Sales", "team1", roleWith("quotations:view", "quotations:viewTeam"));
    expect(await visibleSeqs(ctx)).toEqual([1, 3, 5]);
  });

  it("team tier excludes the other team in the same department (bob, team2)", async () => {
    const ctx = ctxFor(bobId, "Sales", "team2", roleWith("quotations:view", "quotations:viewTeam"));
    expect(await visibleSeqs(ctx)).toEqual([2, 5]);
  });

  it("department tier: sees every department member (alice + bob + carol, all Sales) plus legacy", async () => {
    const ctx = ctxFor(aliceId, "Sales", "team1", roleWith("quotations:view", "quotations:viewDepartment"));
    expect(await visibleSeqs(ctx)).toEqual([1, 2, 3, 5]);
  });

  it("department tier excludes other departments (dave, Purchasing)", async () => {
    const ctx = ctxFor(aliceId, "Sales", "team1", roleWith("quotations:view", "quotations:viewDepartment"));
    expect(await visibleSeqs(ctx)).not.toContain(4);
  });

  it("viewAll: sees every record company-wide, including other departments", async () => {
    const ctx = ctxFor(aliceId, "Sales", "team1", roleWith("quotations:viewAll"));
    expect(await visibleSeqs(ctx)).toEqual([1, 2, 3, 4, 5]);
  });

  it("a user with no team assigned falls back to own-only even with viewTeam granted", async () => {
    const ctx = ctxFor(daveId, "Purchasing", "", roleWith("quotations:view", "quotations:viewTeam"));
    expect(await visibleSeqs(ctx)).toEqual([4, 5]);
  });
});

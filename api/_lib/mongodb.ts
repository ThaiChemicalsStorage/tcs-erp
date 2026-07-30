import { setServers } from "node:dns";
import { MongoClient, type Db } from "mongodb";

const dbName = process.env.MONGODB_DB || "tcs_erp";

// Local `vercel dev` only (`VERCEL_ENV` is always set on an actual Vercel deployment, never here)
// — some local networks/firewalls/antivirus block Node's own DNS SRV lookups (`querySrv
// ECONNREFUSED`) for the `mongodb+srv://` connection string even though the OS resolver (and every
// other DNS lookup) works fine. Explicit public resolvers sidestep it; never applies in production.
if (!process.env.VERCEL_ENV) {
  setServers(["8.8.8.8", "1.1.1.1"]);
}

/**
 * One client per warm serverless instance, reused across invocations on that instance
 * (module scope survives between invocations, not just within one). Each Vercel Function
 * is bundled separately, so this is a singleton per-function-instance, not a single
 * process-wide connection — that's the correct shape for serverless (there's no shared
 * process to hold one connection across all functions).
 */
let clientPromise: Promise<MongoClient> | undefined;

function connect(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("Missing MONGODB_URI environment variable");
  }
  const client = new MongoClient(uri, { maxPoolSize: 10 });
  return client.connect();
}

export async function getDb(): Promise<Db> {
  if (!clientPromise) {
    clientPromise = connect();
  }
  try {
    const client = await clientPromise;
    return client.db(dbName);
  } catch (err) {
    // Reset so the next invocation retries the connection instead of replaying a dead promise.
    clientPromise = undefined;
    throw err;
  }
}

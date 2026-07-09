import { MongoClient, type Db } from "mongodb";

const dbName = process.env.MONGODB_DB || "tcs_erp";

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

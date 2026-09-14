import { setServers } from "node:dns";
import { MongoClient, type Db } from "mongodb";

const dbName = process.env.MONGODB_DB || "tcs_erp";

// Local development only (the server sets NODE_ENV=production on a real host — see .env.example)
// — some local networks/firewalls/antivirus block Node's own DNS SRV lookups (`querySrv
// ECONNREFUSED`) for a `mongodb+srv://` connection string even though the OS resolver (and every
// other DNS lookup) works fine. Explicit public resolvers sidestep it; never applies in production,
// where overriding the machine's resolver could itself break name resolution.
if (process.env.NODE_ENV !== "production") {
  setServers(["8.8.8.8", "1.1.1.1"]);
}

/**
 * One MongoClient for the whole Express process, created on first use and reused by every request
 * (the driver pools connections internally, `maxPoolSize` below).
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

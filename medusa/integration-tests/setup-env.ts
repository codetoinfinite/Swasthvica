import { readFileSync } from "fs";
import { join } from "path";

/* ------------------------------------------------------------------------------------------------
 * What the HTTP suite needs set before anything else loads.
 *
 * `@medusajs/test-utils` reads DB_HOST, DB_PORT, DB_USERNAME and DB_PASSWORD into module-level
 * constants (test-utils/dist/database.js:12-15) the moment it is imported, and defaults the user to
 * `postgres`. On a Homebrew Postgres there is no such role, so the runner cannot create its scratch
 * database and every test in the file fails at boot with an authentication error.
 *
 * The connection this project actually uses is already written down once, in `.env`, so the four
 * variables are derived from it rather than duplicated. Jest runs this file via `setupFiles`, which
 * is before the spec module and therefore before test-utils is imported -- putting this inside the
 * spec would be too late, because imports are hoisted above it.
 * ---------------------------------------------------------------------------------------------- */

/** `.env` as a plain map. Deliberately not dotenv: this runs before any module system is warm. */
function readEnvFile(path: string): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of contents.split("\n")) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    values[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return values;
}

const fileEnv = readEnvFile(join(__dirname, "..", ".env"));

/** An existing value always wins, so CI can point the suite anywhere without editing this file. */
function preset(name: string, value: string | undefined): void {
  if (!process.env[name] && value) process.env[name] = value;
}

const databaseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
if (databaseUrl) {
  const parsed = new URL(databaseUrl);
  // 127.0.0.1 and localhost are the same machine but not the same string, and one of them turns
  // TLS on: test-utils/dist/medusa-test-runner-utils/config.js:22 gives the connection
  // `ssl: { rejectUnauthorized: false }` for any URL that does not literally contain "localhost".
  // A Homebrew Postgres is built without SSL, so the handshake never completes and the run dies
  // sixty seconds later as "Knex: Timeout acquiring a connection. The pool is probably full."
  const loopback = ["127.0.0.1", "::1", "[::1]"].includes(parsed.hostname);
  preset("DB_HOST", loopback ? "localhost" : parsed.hostname);
  preset("DB_PORT", parsed.port || "5432");
  preset("DB_USERNAME", decodeURIComponent(parsed.username));
  preset("DB_PASSWORD", decodeURIComponent(parsed.password));
  preset("DATABASE_URL", databaseUrl);
}

/**
 * A Redis of its own, on a different logical database.
 *
 * Four modules and the rate limiter point at REDIS_URL. Sharing one logical database with a running
 * `medusa develop` would mean the two processes consuming each other's event-bus and workflow-engine
 * queues -- a test order completing a workflow in the developer's terminal -- and the limiter's
 * counters being spent by whichever of them got there first. Index 9 is this suite's, and nothing
 * else in the project addresses it.
 */
const redisUrl = process.env.REDIS_URL ?? fileEnv.REDIS_URL ?? "redis://localhost:6379";
const testRedis = new URL(redisUrl);
testRedis.pathname = "/9";
process.env.REDIS_URL = testRedis.toString();

// `medusa-config.ts` calls required() on these five and refuses to boot without them. They are in
// `.env`, but loadEnv only runs once the config module is being evaluated -- which is inside the
// runner's beforeAll, long after this file. Presetting them keeps the failure legible: a missing
// secret should say which one, not fail somewhere inside a migration.
for (const name of ["STORE_CORS", "ADMIN_CORS", "AUTH_CORS", "JWT_SECRET", "COOKIE_SECRET"]) {
  preset(name, fileEnv[name]);
}

import { readFileSync } from "node:fs";
import pg from "pg";
import type { Store } from "./store.js";

/** TLS `ssl` value for the pg pool: false (off) or a Node TLS options object. */
export type PgSsl = false | { rejectUnauthorized: boolean; ca?: string };

/** Read a pinned CA from DATABASE_CA — inline PEM, or a path to a PEM file. */
function readDatabaseCa(env: NodeJS.ProcessEnv): string | undefined {
  const v = env.DATABASE_CA?.trim();
  if (!v) return undefined;
  if (v.startsWith("-----BEGIN")) return v;
  try {
    return readFileSync(v, "utf8");
  } catch (err) {
    throw new Error(`DATABASE_CA points to a file that could not be read: ${(err as Error).message}`);
  }
}

/**
 * Decide the TLS posture for a Postgres connection (audit #6). TLS is on for
 * remote hosts (off for localhost); `DATABASE_SSL=true|false` forces it either
 * way. When on, the server certificate is VERIFIED by default — the previous
 * `rejectUnauthorized: false` encrypted the link but let any endpoint
 * impersonate the database. `DATABASE_CA` pins a provider CA; the escape hatch
 * `DATABASE_SSL_NO_VERIFY=true` disables verification but says so loudly.
 */
export function resolvePgSsl(connectionString: string, env: NodeJS.ProcessEnv = process.env): PgSsl {
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
  const flag = env.DATABASE_SSL;
  const off = flag === "false" || (flag !== "true" && local);
  if (off) return false;

  const ca = readDatabaseCa(env);
  if (env.DATABASE_SSL_NO_VERIFY === "true") {
    console.error(
      "[db] DATABASE_SSL_NO_VERIFY=true — TLS is on but the server certificate is NOT verified. " +
        "The connection is encrypted but exposed to endpoint impersonation; prefer DATABASE_CA.",
    );
    return ca ? { rejectUnauthorized: false, ca } : { rejectUnauthorized: false };
  }
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}

/**
 * Drop any `sslmode` query param from a Postgres DSN. We always set TLS via the
 * explicit `ssl` option below, so the URL's `sslmode` is redundant — and leaving
 * it in makes pg-connection-string log a deprecation warning (it currently treats
 * `require`/`prefer`/`verify-ca` as `verify-full`, changing in a future major).
 * URL-form DSNs (Neon, Supabase, RDS, …) go through the URL parser; the regex is
 * a best-effort fallback for libpq key=value strings.
 */
function withoutSslMode(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString
      .replace(/([?&])sslmode=[^&]*(&|$)/gi, (_m, sep, tail) => (tail === "&" ? sep : ""))
      .replace(/[?&]$/, "");
  }
}

/**
 * PostgresStore — the durable, concurrent-safe {@link Store} for cloud deploys
 * (dec.action-audit-log). A single key/value table keyed by (collection, id)
 * with a jsonb value; upserts on put. Selected automatically when DATABASE_URL
 * is set (see {@link createStore} in store.ts). The stateless-server design
 * means switching to this is config, not code.
 */
export class PostgresStore implements Store {
  private readonly pool: pg.Pool;

  private constructor(
    connectionString: string,
    private readonly table = "sleepbot_kv",
  ) {
    this.pool = new pg.Pool({
      connectionString: withoutSslMode(connectionString),
      // Managed Postgres (Neon/Supabase/Fly/Render) needs TLS with a provider
      // cert; local dev does not. TLS verifies the server cert by default — see
      // resolvePgSsl (DATABASE_SSL / DATABASE_CA / DATABASE_SSL_NO_VERIFY).
      ssl: resolvePgSsl(connectionString),
    });
  }

  /** Construct and ensure the table exists before first use. */
  static async create(connectionString: string, table?: string): Promise<PostgresStore> {
    const store = new PostgresStore(connectionString, table);
    await store.pool.query(
      `CREATE TABLE IF NOT EXISTS ${store.table} (
         collection text NOT NULL,
         id text NOT NULL,
         value jsonb NOT NULL,
         updated_at timestamptz NOT NULL DEFAULT now(),
         PRIMARY KEY (collection, id)
       )`,
    );
    return store;
  }

  async put(collection: string, id: string, value: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.table} (collection, id, value, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (collection, id) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [collection, id, JSON.stringify(value)],
    );
  }

  async get<T = unknown>(collection: string, id: string): Promise<T | null> {
    const r = await this.pool.query(`SELECT value FROM ${this.table} WHERE collection = $1 AND id = $2`, [
      collection,
      id,
    ]);
    return r.rows[0] ? (r.rows[0].value as T) : null;
  }

  async list<T = unknown>(collection: string): Promise<T[]> {
    const r = await this.pool.query(`SELECT value FROM ${this.table} WHERE collection = $1`, [collection]);
    return r.rows.map((row) => row.value as T);
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.table} WHERE collection = $1 AND id = $2`, [collection, id]);
  }

  /** Close the pool (tests / graceful shutdown). */
  close(): Promise<void> {
    return this.pool.end();
  }
}

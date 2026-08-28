import pg from "pg";
import type { Store } from "./store.js";

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
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
    this.pool = new pg.Pool({
      connectionString,
      // Managed Postgres (Neon/Supabase/Fly/Render) generally needs TLS with a
      // provider cert; local dev does not. Override with DATABASE_SSL.
      ssl:
        process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : process.env.DATABASE_SSL === "false" || local
            ? false
            : { rejectUnauthorized: false },
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

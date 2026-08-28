import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * Store — the single persistence boundary for Phase 2 state (pending actions
 * and the audit log). Keeping everything behind this interface honors the
 * stateless-server principle: no code assumes a local disk, so moving to a
 * hosted database is an implementation swap, not a rewrite
 * (see dec.action-audit-log).
 *
 * A "collection" is a named bucket (e.g. "pending", "audit"); ids are unique
 * within a collection.
 */
export interface Store {
  put(collection: string, id: string, value: unknown): Promise<void>;
  get<T = unknown>(collection: string, id: string): Promise<T | null>;
  list<T = unknown>(collection: string): Promise<T[]>;
  delete(collection: string, id: string): Promise<void>;
}

type Snapshot = Record<string, Record<string, unknown>>;

/**
 * JsonFileStore — the local-development default. Loads the whole store into
 * memory and rewrites the file on each mutation, serializing writes so
 * concurrent calls in a single process don't clobber each other.
 *
 * NOTE: a multi-instance cloud deploy needs a real concurrent-safe store; this
 * single-file impl is intentionally the dev default (dec.action-audit-log).
 */
export class JsonFileStore implements Store {
  private data: Snapshot | null = null;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly path: string = ".data/store.json") {}

  private async load(): Promise<Snapshot> {
    if (this.data) return this.data;
    try {
      this.data = JSON.parse(await readFile(this.path, "utf8")) as Snapshot;
    } catch {
      this.data = {};
    }
    return this.data;
  }

  /** Serialize persistence so overlapping writes can't interleave. */
  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      await writeFile(this.path, JSON.stringify(this.data ?? {}, null, 2));
    });
    return this.writeChain;
  }

  async put(collection: string, id: string, value: unknown): Promise<void> {
    const data = await this.load();
    (data[collection] ??= {})[id] = value;
    await this.persist();
  }

  async get<T = unknown>(collection: string, id: string): Promise<T | null> {
    const data = await this.load();
    return (data[collection]?.[id] as T) ?? null;
  }

  async list<T = unknown>(collection: string): Promise<T[]> {
    const data = await this.load();
    return Object.values(data[collection] ?? {}) as T[];
  }

  async delete(collection: string, id: string): Promise<void> {
    const data = await this.load();
    if (data[collection]) delete data[collection][id];
    await this.persist();
  }
}

/** InMemoryStore — for tests and ephemeral runs. Never touches disk. */
export class InMemoryStore implements Store {
  private data: Snapshot = {};

  async put(collection: string, id: string, value: unknown): Promise<void> {
    (this.data[collection] ??= {})[id] = value;
  }
  async get<T = unknown>(collection: string, id: string): Promise<T | null> {
    return (this.data[collection]?.[id] as T) ?? null;
  }
  async list<T = unknown>(collection: string): Promise<T[]> {
    return Object.values(this.data[collection] ?? {}) as T[];
  }
  async delete(collection: string, id: string): Promise<void> {
    if (this.data[collection]) delete this.data[collection][id];
  }
}

/**
 * Pick the right store for the environment: Postgres when DATABASE_URL is set
 * (cloud), else the local JSON file. The `pg`-backed store is dynamically
 * imported so its driver only loads when actually used (dec.action-audit-log).
 */
export async function createStore(): Promise<Store> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { PostgresStore } = await import("./postgresStore.js");
    return PostgresStore.create(url);
  }
  return new JsonFileStore();
}

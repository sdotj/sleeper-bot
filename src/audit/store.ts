import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
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
  /** Release resources (e.g. a DB pool) on graceful shutdown. Optional. */
  close?(): Promise<void>;
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

    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (err) {
      // Only a genuinely-absent file is a new store. Any other read failure
      // (permissions, I/O) must NOT be mistaken for "empty" — that would let
      // the next write overwrite real data (audit #12).
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        this.data = {};
        return this.data;
      }
      throw new Error(`could not read store at ${this.path}: ${(err as Error).message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("top-level value is not a JSON object");
      }
    } catch (err) {
      // Corrupt on disk: preserve the damaged bytes and refuse to run rather
      // than silently starting empty and clobbering them on the next write.
      const backup = `${this.path}.corrupt-${Date.now()}`;
      await writeFile(backup, raw).catch(() => {});
      throw new Error(
        `store at ${this.path} is corrupt (${(err as Error).message}) — preserved a copy at ${backup}. ` +
          `Refusing to overwrite it with an empty store; inspect/restore it and restart.`,
      );
    }
    this.data = parsed as Snapshot;
    return this.data;
  }

  /**
   * Serialize persistence so overlapping writes can't interleave. Writes go to a
   * temp file and are atomically renamed into place, so a crash mid-write can't
   * truncate the store. A prior write's rejection is swallowed at the chain link
   * so one failure doesn't block every later write (audit #12).
   */
  private persist(): Promise<void> {
    this.writeChain = this.writeChain.catch(() => {}).then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.tmp-${process.pid}`;
      await writeFile(tmp, JSON.stringify(this.data ?? {}, null, 2));
      await rename(tmp, this.path); // atomic on the same filesystem
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

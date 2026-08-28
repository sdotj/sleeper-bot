import { afterAll, describe, expect, it } from "vitest";
import { PostgresStore } from "./postgresStore.js";

// Integration test — runs only when DATABASE_URL points at a reachable Postgres
// (e.g. a throwaway docker container). Skipped in the normal unit-test run.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("PostgresStore (integration)", () => {
  let store: PostgresStore;

  it("upserts, gets, lists, and deletes", async () => {
    store = await PostgresStore.create(url!, "sleepbot_kv_test");

    await store.put("c", "a", { n: 1 });
    await store.put("c", "b", { n: 2 });
    expect(await store.get("c", "a")).toEqual({ n: 1 });

    await store.put("c", "a", { n: 99 }); // upsert
    expect(await store.get("c", "a")).toEqual({ n: 99 });

    const all = await store.list<{ n: number }>("c");
    expect(all.map((x) => x.n).sort((x, y) => x - y)).toEqual([2, 99]);

    await store.delete("c", "a");
    expect(await store.get("c", "a")).toBeNull();
    expect(await store.get("missing", "x")).toBeNull();
  });

  afterAll(async () => {
    await store?.close();
  });
});

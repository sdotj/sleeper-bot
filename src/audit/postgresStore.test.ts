import { afterAll, describe, expect, it } from "vitest";
import { PostgresStore, resolvePgSsl } from "./postgresStore.js";

describe("resolvePgSsl (TLS verification, audit #6)", () => {
  const remote = "postgres://u:p@db.neon.tech:5432/main";
  const localhost = "postgres://u:p@localhost:5432/main";

  it("verifies the server certificate by default for remote hosts", () => {
    expect(resolvePgSsl(remote, {})).toEqual({ rejectUnauthorized: true });
  });

  it("is off for localhost and when DATABASE_SSL=false", () => {
    expect(resolvePgSsl(localhost, {})).toBe(false);
    expect(resolvePgSsl(remote, { DATABASE_SSL: "false" })).toBe(false);
  });

  it("forces TLS (verified) for localhost when DATABASE_SSL=true", () => {
    expect(resolvePgSsl(localhost, { DATABASE_SSL: "true" })).toEqual({ rejectUnauthorized: true });
  });

  it("pins an inline CA from DATABASE_CA", () => {
    const ca = "-----BEGIN CERTIFICATE-----\nMIID\n-----END CERTIFICATE-----";
    expect(resolvePgSsl(remote, { DATABASE_CA: ca })).toEqual({ rejectUnauthorized: true, ca });
  });

  it("only disables verification behind the explicit DATABASE_SSL_NO_VERIFY escape hatch", () => {
    expect(resolvePgSsl(remote, { DATABASE_SSL_NO_VERIFY: "true" })).toEqual({ rejectUnauthorized: false });
  });
});

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

import { describe, expect, it } from "vitest";
import { AuditLog } from "./auditLog.js";
import { InMemoryStore } from "./store.js";

describe("InMemoryStore", () => {
  it("puts, gets, lists, and deletes within a collection", async () => {
    const s = new InMemoryStore();
    await s.put("c", "a", { n: 1 });
    await s.put("c", "b", { n: 2 });
    expect(await s.get("c", "a")).toEqual({ n: 1 });
    expect(await s.list("c")).toHaveLength(2);
    await s.delete("c", "a");
    expect(await s.get("c", "a")).toBeNull();
    expect(await s.get("missing", "x")).toBeNull();
  });
});

describe("AuditLog", () => {
  it("records events and lists them newest-first, filtered by league", async () => {
    const log = new AuditLog(new InMemoryStore());
    await log.record({ actionId: "1", leagueId: "L1", type: "proposed", actor: "user", summary: "a", at: 100 });
    await log.record({ actionId: "1", leagueId: "L1", type: "executed", actor: "user", summary: "b", at: 200 });
    await log.record({ actionId: "2", leagueId: "L2", type: "proposed", actor: "auto", summary: "c", at: 150 });

    const all = await log.list();
    expect(all.map((e) => e.summary)).toEqual(["b", "c", "a"]); // 200, 150, 100

    const l1 = await log.list("L1");
    expect(l1.map((e) => e.summary)).toEqual(["b", "a"]);
    expect(l1[0].id).toBeDefined();
  });
});

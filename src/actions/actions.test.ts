import { describe, expect, it, vi } from "vitest";
import type { PlayerRef, WriteableLeagueAdapter } from "../adapters/LeagueAdapter.js";
import { AuditLog, InMemoryStore } from "../audit/index.js";
import { GenericValueProvider } from "../value/index.js";
import { RulesEngine, rulesConfigSchema } from "../rules/index.js";
import { ActionPipeline } from "./pipeline.js";
import { PendingStore } from "./pendingStore.js";

/** Minimal write-capable adapter: resolves names and records executed writes. */
function fakeAdapter(executeTrade = vi.fn(async () => ({ ok: true, platformRef: "X1", message: "sent" }))) {
  const adapter = {
    async resolvePlayers(ids: string[]): Promise<PlayerRef[]> {
      return ids.map((id) => ({
        playerId: id,
        name: id === "star" ? "Ja'Marr Chase" : id,
        position: "",
        team: null,
      }));
    },
    executeTrade,
    executeWaiverClaim: vi.fn(async () => ({ ok: true, message: "sent" })),
    executeAddDrop: vi.fn(async () => ({ ok: true, message: "sent" })),
  } as unknown as WriteableLeagueAdapter;
  return { adapter, executeTrade };
}

function pipeline(cfg: unknown, adapter: WriteableLeagueAdapter) {
  const store = new InMemoryStore();
  const audit = new AuditLog(store);
  const pending = new PendingStore(store);
  return {
    audit,
    pending,
    pipe: new ActionPipeline({
      rules: new RulesEngine(rulesConfigSchema.parse(cfg)),
      audit,
      pending,
      valueFor: () => new GenericValueProvider({}),
      adapterFor: () => adapter,
    }),
  };
}

const trade = { fromRosterId: 1, toRosterId: 2, sendPlayerIds: ["scrub"], receivePlayerIds: ["star"] };

describe("ActionPipeline (manual mode)", () => {
  it("proposes a draft without sending, then executes on confirmation", async () => {
    const { adapter, executeTrade } = fakeAdapter();
    const { pipe, pending, audit } = pipeline({ mode: "manual" }, adapter);

    const proposed = await pipe.propose("L1", "trade", trade);
    expect(proposed.status).toBe("pending");
    expect(executeTrade).not.toHaveBeenCalled();
    expect(await pending.list("L1")).toHaveLength(1);

    const executed = await pipe.execute(proposed.id, "user");
    expect(executed.status).toBe("executed");
    expect(executed.result?.platformRef).toBe("X1");
    expect(executeTrade).toHaveBeenCalledOnce();
    expect(await pending.list("L1")).toHaveLength(0);

    const events = await audit.list("L1");
    expect(events.map((e) => e.type).sort()).toEqual(["executed", "proposed"]);
  });

  it("blocks a protected trade: not stored, not sent, audited as rejected", async () => {
    const { adapter, executeTrade } = fakeAdapter();
    const { pipe, pending, audit } = pipeline(
      { mode: "manual", protect: [{ playerName: "Ja'Marr Chase" }] },
      adapter,
    );

    const blockedTrade = { ...trade, sendPlayerIds: ["star"], receivePlayerIds: ["scrub"] };
    const proposed = await pipe.propose("L1", "trade", blockedTrade);

    expect(proposed.status).toBe("rejected");
    expect(proposed.verdict.blockedReasons).not.toHaveLength(0);
    expect(await pending.list("L1")).toHaveLength(0);
    expect(executeTrade).not.toHaveBeenCalled();
    expect((await audit.list("L1"))[0].type).toBe("rejected");
  });

  it("throws when executing an unknown action id", async () => {
    const { adapter } = fakeAdapter();
    const { pipe } = pipeline({ mode: "manual" }, adapter);
    await expect(pipe.execute("nope")).rejects.toThrow(/no pending action/);
  });

  it("treats a non-ok write as a failure: audits failed, keeps the draft (audit #8)", async () => {
    // Adapter reports the write did not land — the pipeline must NOT mark it
    // executed or remove the pending draft.
    const executeTrade = vi.fn(async () => ({ ok: false, message: "no transaction" }));
    const { adapter } = fakeAdapter(executeTrade);
    const { pipe, pending, audit } = pipeline({ mode: "manual" }, adapter);

    const proposed = await pipe.propose("L1", "trade", trade);
    await expect(pipe.execute(proposed.id, "user")).rejects.toThrow(/no transaction/);

    expect(await pending.list("L1")).toHaveLength(1); // still re-tryable
    const events = await audit.list("L1");
    expect(events.map((e) => e.type)).toContain("failed");
    expect(events.map((e) => e.type)).not.toContain("executed");
  });

  it("dispatches a pending action at most once under concurrent execute (audit #4)", async () => {
    let inFlight = 0;
    let maxConcurrent = 0;
    const executeTrade = vi.fn(async () => {
      inFlight++;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return { ok: true, platformRef: "X1", message: "sent" };
    });
    const { adapter } = fakeAdapter(executeTrade);
    const { pipe, pending } = pipeline({ mode: "manual" }, adapter);

    const proposed = await pipe.propose("L1", "trade", trade);
    const results = await Promise.allSettled([
      pipe.execute(proposed.id, "user"),
      pipe.execute(proposed.id, "user"),
    ]);

    expect(executeTrade).toHaveBeenCalledOnce();
    expect(maxConcurrent).toBe(1);
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toMatch(/already executing/);
    expect(await pending.list("L1")).toHaveLength(0);
  });
});

describe("ActionPipeline (auto mode)", () => {
  it("executes an unblocked proposal immediately", async () => {
    const { adapter, executeTrade } = fakeAdapter();
    const { pipe, pending } = pipeline({ mode: "auto" }, adapter);

    const result = await pipe.propose("L1", "trade", trade);
    expect(result.status).toBe("executed");
    expect(executeTrade).toHaveBeenCalledOnce();
    expect(await pending.list("L1")).toHaveLength(0);
  });
});

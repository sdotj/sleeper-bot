import { describe, expect, it, vi } from "vitest";
import type { AppContext, SleepBotOperations } from "../core/index.js";
import type { Notifier } from "../notify/index.js";
import type { RuleVerdict } from "../rules/index.js";
import { AgentRunner } from "./agentRunner.js";
import { dispatchAgentTool, type Recommendation } from "./agentTools.js";

const allow: RuleVerdict = { decision: "allow", blockedReasons: [], warnings: [] };
const warned: RuleVerdict = { decision: "allow", blockedReasons: [], warnings: ["lopsided"] };
const blocked: RuleVerdict = { decision: "block", blockedReasons: ["protect: Star"], warnings: [] };

const addDrop: Recommendation = {
  kind: "add_drop",
  rationale: "upgrade",
  payload: { rosterId: 2, addPlayerId: "x", dropPlayerId: "y" },
};

function harness(verdict: RuleVerdict) {
  const perform = vi.fn(async () => ({ status: "executed", result: { message: "sent" }, verdict } as never));
  const notifier = { propose: vi.fn(async () => {}), info: vi.fn(async () => {}) } as unknown as Notifier;
  const ctx = {
    pipeline: { evaluate: vi.fn(async () => verdict), perform },
    audit: { record: vi.fn(async () => ({})) },
    adapterFor: () => ({ resolvePlayers: async () => [{ playerId: "x", name: "Add Guy", position: "WR", team: "SF" }] }),
  } as unknown as AppContext;
  const ops = { getMyRoster: async () => ({ rosterId: 2 }) } as unknown as SleepBotOperations;
  const runner = new AgentRunner({ ctx, ops, notifier, gather: async () => [addDrop] });
  return { runner, perform, notifier, ctx };
}

describe("AgentRunner routing (3-way autonomy policy)", () => {
  it("auto + clean → executes and notifies, no approval asked", async () => {
    const { runner, perform, notifier } = harness(allow);
    await runner.sweepLeague("L1", "auto");
    expect(perform).toHaveBeenCalledWith("L1", "add_drop", expect.anything(), "auto", { override: false });
    expect(notifier.info).toHaveBeenCalledOnce();
    expect(notifier.propose).not.toHaveBeenCalled();
  });

  it("manual + clean → asks for approval (no auto-execute)", async () => {
    const { runner, perform, notifier } = harness(allow);
    await runner.sweepLeague("L1", "manual");
    expect(perform).not.toHaveBeenCalled();
    expect(notifier.propose).toHaveBeenCalledWith(expect.objectContaining({ summary: expect.any(String) }), "approve");
  });

  it("auto + warned → still asks for approval (warnings never auto)", async () => {
    const { runner, perform, notifier } = harness(warned);
    await runner.sweepLeague("L1", "auto");
    expect(perform).not.toHaveBeenCalled();
    expect(notifier.propose).toHaveBeenCalledWith(
      expect.objectContaining({ warnings: ["lopsided"] }),
      "approve",
    );
  });

  it("blocked → offers an override (never auto)", async () => {
    const { runner, perform, notifier } = harness(blocked);
    await runner.sweepLeague("L1", "auto");
    expect(perform).not.toHaveBeenCalled();
    expect(notifier.propose).toHaveBeenCalledWith(
      expect.objectContaining({ blockedReasons: ["protect: Star"] }),
      "override",
    );
  });

  it("resolves player names in the summary", async () => {
    const { runner, notifier } = harness(allow);
    await runner.sweepLeague("L1", "auto");
    const info = (notifier.info as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(info).toContain("Add Guy");
  });

  it("captures recommend_action calls and dispatches reads to ops with the bound league", async () => {
    const recs: Recommendation[] = [];
    const ops = { getStandings: vi.fn(async () => [{ rank: 1 }]) } as unknown as SleepBotOperations;

    const read = await dispatchAgentTool(ops, "L1", "get_standings", {}, recs);
    expect((ops.getStandings as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith("L1");
    expect(read).toEqual([{ rank: 1 }]);

    await dispatchAgentTool(ops, "L1", "recommend_action", {
      kind: "waiver_claim",
      rationale: "hot pickup",
      rosterId: 2,
      addPlayerId: "a",
      faabBid: 12,
    }, recs);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ kind: "waiver_claim", payload: { rosterId: 2, addPlayerId: "a", faabBid: 12 } });
  });

  it("skips a league with no resolvable roster", async () => {
    const notifier = { propose: vi.fn(), info: vi.fn() } as unknown as Notifier;
    const ctx = { pipeline: { evaluate: vi.fn(), perform: vi.fn() } } as unknown as AppContext;
    const ops = { getMyRoster: async () => null } as unknown as SleepBotOperations;
    const runner = new AgentRunner({ ctx, ops, notifier, gather: async () => [addDrop] });
    const r = await runner.sweepLeague("L1", "auto");
    expect(r.skipped).toMatch(/username/);
    expect(notifier.propose).not.toHaveBeenCalled();
  });
});

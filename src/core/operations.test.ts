import { describe, expect, it } from "vitest";
import type { ProposedAction } from "../actions/index.js";
import { proposalOutcome } from "./operations.js";

const base: Omit<ProposedAction, "status"> = {
  id: "a1",
  leagueId: "L1",
  kind: "add_drop",
  payload: { rosterId: 1, addPlayerId: "x" },
  verdict: { decision: "allow", blockedReasons: [], warnings: [] },
  createdMs: 0,
};

describe("proposalOutcome", () => {
  it("labels a pending action as a draft awaiting execute", () => {
    const out = proposalOutcome({ ...base, status: "pending" });
    expect(out.note).toMatch(/DRAFT/);
    expect(out.note).toMatch(/execute/);
  });

  it("labels a rejected action as blocked", () => {
    const out = proposalOutcome({
      ...base,
      status: "rejected",
      verdict: { decision: "block", blockedReasons: ["protected player"], warnings: [] },
    });
    expect(out.note).toMatch(/BLOCKED/);
    expect(out.note).toMatch(/protected player/);
  });

  it("labels an auto-executed action as SENT, not a draft (audit #9)", () => {
    const out = proposalOutcome({
      ...base,
      status: "executed",
      result: { platformRef: "T1", message: "add_drop submitted" },
    });
    expect(out.note).toMatch(/SENT/);
    expect(out.note).not.toMatch(/DRAFT/);
    expect(out.note).toMatch(/T1/);
  });
});

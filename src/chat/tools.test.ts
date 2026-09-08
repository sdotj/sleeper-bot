import { describe, expect, it } from "vitest";
import type { SleepBotOperations } from "../core/index.js";
import { CHAT_TOOLS, dispatchTool } from "./tools.js";

describe("chat tools (human-in-the-loop, audit #3)", () => {
  it("exposes propose_* but NOT execute_action — chat can draft, not send", () => {
    const names = CHAT_TOOLS.map((t) => t.name);
    expect(names).toContain("propose_trade");
    expect(names).toContain("propose_add_drop");
    expect(names).toContain("propose_waiver_claim");
    expect(names).not.toContain("execute_action");
  });

  it("refuses to dispatch execute_action even if the model asks for it", async () => {
    // No pipeline should be touched — the switch has no case for it anymore.
    const ops = {} as SleepBotOperations;
    await expect(dispatchTool(ops, "execute_action", { actionId: "a1" })).rejects.toThrow(
      /unknown tool/,
    );
  });
});

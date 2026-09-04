import { describe, expect, it, vi } from "vitest";
import { InMemoryStore } from "../audit/index.js";
import { ChatHistory, MemoryStore } from "../history/index.js";
import type { SleepBotOperations } from "../core/index.js";
import { dispatchTool } from "./tools.js";
import { runPersistedTurn, type ChatRunner } from "./session.js";

// runPersistedTurn reads ops.memory; give the stub an empty one.
const opsWith = (memory = new MemoryStore(new InMemoryStore())) =>
  ({ memory } as SleepBotOperations);
const ops = opsWith();

describe("runPersistedTurn", () => {
  it("lazily creates a conversation, titles it, and stores both messages", async () => {
    const history = new ChatHistory(new InMemoryStore());
    const runner: ChatRunner = vi.fn(async () => ({ reply: "You should start Chase.", toolCalls: ["get_my_roster"] }));

    const r = await runPersistedTurn(ops, history, { message: "who do I start?" }, {}, runner);
    expect(r.reply).toBe("You should start Chase.");
    expect(r.conversationId).toBeTruthy();

    const convo = await history.get(r.conversationId);
    expect(convo?.title).toBe("who do I start?");
    expect(convo?.messages.map((m) => [m.role, m.content])).toEqual([
      ["user", "who do I start?"],
      ["assistant", "You should start Chase."],
    ]);
  });

  it("appends to an existing conversation and passes the prior history to the model", async () => {
    const history = new ChatHistory(new InMemoryStore());
    const runner = vi.fn(async (_ops, h) => ({ reply: `reply-${h.length}`, toolCalls: [] }));

    const first = await runPersistedTurn(ops, history, { message: "one" }, {}, runner);
    await runPersistedTurn(ops, history, { conversationId: first.conversationId, message: "two" }, {}, runner);

    // The second turn's model history includes the first exchange + the new user msg.
    const modelHistory = runner.mock.calls[1][1];
    expect(modelHistory.map((m) => m.content)).toEqual(["one", "reply-1", "two"]);

    const convo = await history.get(first.conversationId);
    expect(convo?.messages).toHaveLength(4);
  });

  it("throws on an unknown conversationId (nothing persisted)", async () => {
    const history = new ChatHistory(new InMemoryStore());
    const runner = vi.fn(async () => ({ reply: "x", toolCalls: [] }));
    await expect(
      runPersistedTurn(ops, history, { conversationId: "ghost", message: "hi" }, {}, runner),
    ).rejects.toThrow(/unknown conversationId/);
    expect(runner).not.toHaveBeenCalled();
  });

  it("does not persist anything when the model turn throws", async () => {
    const history = new ChatHistory(new InMemoryStore());
    const runner: ChatRunner = vi.fn(async () => {
      throw new Error("ANTHROPIC_API_KEY missing");
    });
    await expect(runPersistedTurn(ops, history, { message: "hi" }, {}, runner)).rejects.toThrow(/ANTHROPIC/);
    expect(await history.list()).toEqual([]); // no orphan thread
  });

  it("injects the MEMORY block into the turn's system prompt", async () => {
    const memory = new MemoryStore(new InMemoryStore());
    await memory.add("I'm rebuilding, value youth");
    const history = new ChatHistory(new InMemoryStore());
    const runner = vi.fn(async () => ({ reply: "ok", toolCalls: [] }));

    await runPersistedTurn(opsWith(memory), history, { message: "hi" }, {}, runner);

    const passedOpts = runner.mock.calls[0][2];
    expect(passedOpts.systemExtra).toContain("## MEMORY");
    expect(passedOpts.systemExtra).toContain("I'm rebuilding, value youth");
  });

  it("passes no systemExtra when memory is empty", async () => {
    const runner = vi.fn(async () => ({ reply: "ok", toolCalls: [] }));
    await runPersistedTurn(opsWith(), new ChatHistory(new InMemoryStore()), { message: "hi" }, {}, runner);
    expect(runner.mock.calls[0][2].systemExtra).toBeUndefined();
  });
});

describe("memory tools", () => {
  it("remember_fact saves a note and forget_fact removes it by id", async () => {
    const memory = new MemoryStore(new InMemoryStore());
    const o = opsWith(memory);

    const saved = (await dispatchTool(o, "remember_fact", { text: "I stream defenses" })) as { id: string };
    expect((await memory.list()).map((n) => n.text)).toEqual(["I stream defenses"]);
    expect((await memory.list())[0].source).toBe("model");

    const res = (await dispatchTool(o, "forget_fact", { id: saved.id })) as { ok: boolean };
    expect(res.ok).toBe(true);
    expect(await memory.list()).toEqual([]);
  });
});

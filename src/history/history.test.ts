import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../audit/index.js";
import { ChatHistory, titleFrom, trimForModel, newConversation, type StoredMessage } from "./index.js";

const msg = (role: "user" | "assistant", content: string, at = Date.now()): StoredMessage => ({ role, content, at });

describe("titleFrom", () => {
  it("collapses whitespace and truncates long messages", () => {
    expect(titleFrom("  who should  I start? ")).toBe("who should I start?");
    expect(titleFrom("x".repeat(60))).toHaveLength(48); // 47 chars + ellipsis
    expect(titleFrom("   ")).toBe("New chat");
  });
});

describe("trimForModel", () => {
  it("keeps the most recent messages within the char budget", () => {
    const messages = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? "assistant" : "user", "z".repeat(100), i));
    const trimmed = trimForModel(messages, 250);
    // 250 / 100 => keeps ~2-3 most recent, and always at least one.
    expect(trimmed.length).toBeGreaterThan(0);
    expect(trimmed.length).toBeLessThan(messages.length);
    expect(trimmed[trimmed.length - 1].content).toBe("z".repeat(100));
    expect(trimmed.every((m) => "role" in m && "content" in m)).toBe(true);
  });

  it("returns all messages when under budget", () => {
    const messages = [msg("user", "hi"), msg("assistant", "hey")];
    expect(trimForModel(messages)).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hey" },
    ]);
  });
});

describe("ChatHistory", () => {
  it("saves, lists (newest first, no bodies), gets, renames, and deletes", async () => {
    const store = new InMemoryStore();
    const h = new ChatHistory(store);

    const a = newConversation("first chat");
    a.updatedAt = 1000;
    const b = newConversation("second chat");
    b.updatedAt = 2000;
    b.messages.push(msg("user", "hi"), msg("assistant", "yo"));
    await h.save(a);
    await h.save(b);

    const list = await h.list();
    expect(list.map((c) => c.id)).toEqual([b.id, a.id]); // newest updatedAt first
    expect(list[0]).toMatchObject({ title: "second chat", messageCount: 2 });
    expect(list[0]).not.toHaveProperty("messages");

    expect((await h.get(a.id))?.title).toBe("first chat");

    await h.rename(a.id, "renamed");
    expect((await h.get(a.id))?.title).toBe("renamed");

    await h.delete(a.id);
    expect(await h.get(a.id)).toBeNull();
    expect((await h.list()).map((c) => c.id)).toEqual([b.id]);
  });

  it("rename throws on an unknown id", async () => {
    const h = new ChatHistory(new InMemoryStore());
    await expect(h.rename("nope", "x")).rejects.toThrow(/unknown conversationId/);
  });
});

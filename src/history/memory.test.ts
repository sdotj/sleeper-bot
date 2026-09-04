import { describe, expect, it } from "vitest";
import { InMemoryStore } from "../audit/index.js";
import { MemoryStore, memoryBlock } from "./index.js";

describe("MemoryStore", () => {
  it("adds, lists oldest-first, and removes", async () => {
    const m = new MemoryStore(new InMemoryStore());
    const a = await m.add("I'm rebuilding, value youth", "user");
    const b = await m.add("I stream defenses weekly", "model");
    const list = await m.list();
    expect(list.map((n) => n.text)).toEqual(["I'm rebuilding, value youth", "I stream defenses weekly"]);
    expect(list[1].source).toBe("model");

    await m.remove(a.id);
    expect((await m.list()).map((n) => n.id)).toEqual([b.id]);
  });

  it("de-duplicates identical text (case-insensitive) and rejects empty", async () => {
    const m = new MemoryStore(new InMemoryStore());
    const first = await m.add("Value youth");
    const dup = await m.add("  value YOUTH  ");
    expect(dup.id).toBe(first.id);
    expect(await m.list()).toHaveLength(1);
    await expect(m.add("   ")).rejects.toThrow(/required/);
  });
});

describe("memoryBlock", () => {
  it("is empty with no notes and lists notes with their ids otherwise", async () => {
    expect(memoryBlock([])).toBe("");
    const m = new MemoryStore(new InMemoryStore());
    const note = await m.add("Only start Chase at flex in a pinch");
    const block = memoryBlock(await m.list());
    expect(block).toContain("## MEMORY");
    expect(block).toContain(`[${note.id}] Only start Chase at flex in a pinch`);
    expect(block).toContain("remember_fact");
  });
});

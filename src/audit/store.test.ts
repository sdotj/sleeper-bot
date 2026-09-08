import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JsonFileStore } from "./store.js";

function tmpPath(): string {
  return join(mkdtempSync(join(tmpdir(), "sleepbot-store-")), "store.json");
}

describe("JsonFileStore corruption safety (audit #12)", () => {
  it("treats a genuinely-absent file as a new empty store", async () => {
    const store = new JsonFileStore(tmpPath());
    expect(await store.list("audit")).toEqual([]);
    await store.put("audit", "a", { n: 1 });
    expect(await store.get("audit", "a")).toEqual({ n: 1 });
  });

  it("refuses to run on a corrupt file and preserves the damaged bytes", async () => {
    const path = tmpPath();
    writeFileSync(path, "{ this is not json");
    const store = new JsonFileStore(path);

    await expect(store.get("audit", "a")).rejects.toThrow(/corrupt/);
    // The original bytes are untouched and a .corrupt-* copy was made.
    expect(readFileSync(path, "utf8")).toBe("{ this is not json");
    const backups = readdirSync(join(path, "..")).filter((f) => f.includes(".corrupt-"));
    expect(backups.length).toBe(1);
  });

  it("rejects a non-object top-level JSON value as corrupt", async () => {
    const path = tmpPath();
    writeFileSync(path, "[1,2,3]");
    await expect(new JsonFileStore(path).list("audit")).rejects.toThrow(/corrupt/);
  });

  it("writes atomically and reloads what it persisted", async () => {
    const path = tmpPath();
    const store = new JsonFileStore(path);
    await store.put("c", "1", { v: "a" });
    await store.put("c", "2", { v: "b" });
    // A fresh instance reads the persisted file back.
    const reopened = new JsonFileStore(path);
    expect((await reopened.list<{ v: string }>("c")).map((x) => x.v).sort()).toEqual(["a", "b"]);
    // No stray temp file left behind.
    expect(readdirSync(join(path, "..")).some((f) => f.includes(".tmp-"))).toBe(false);
  });
});

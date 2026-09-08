import { describe, expect, it } from "vitest";
import { LoginGuard } from "./loginGuard.js";

describe("LoginGuard rate limiting", () => {
  it("allows up to maxPerWindow attempts, then blocks until the window resets", () => {
    let t = 1000;
    const g = new LoginGuard({ windowMs: 100, maxPerWindow: 3, now: () => t });

    expect(g.allow("ip")).toBe(true);
    expect(g.allow("ip")).toBe(true);
    expect(g.allow("ip")).toBe(true);
    expect(g.allow("ip")).toBe(false); // budget spent

    t += 100; // window elapsed
    expect(g.allow("ip")).toBe(true);
  });

  it("tracks each key independently", () => {
    const g = new LoginGuard({ maxPerWindow: 1 });
    expect(g.allow("a")).toBe(true);
    expect(g.allow("a")).toBe(false);
    expect(g.allow("b")).toBe(true); // different key, own budget
  });
});

describe("LoginGuard concurrency cap", () => {
  it("grants up to maxConcurrent slots, refuses beyond, and frees on release", () => {
    const g = new LoginGuard({ maxConcurrent: 2 });
    expect(g.tryAcquire()).toBe(true);
    expect(g.tryAcquire()).toBe(true);
    expect(g.tryAcquire()).toBe(false); // saturated

    g.release();
    expect(g.tryAcquire()).toBe(true);
  });

  it("release never drops below zero", () => {
    const g = new LoginGuard({ maxConcurrent: 1 });
    g.release();
    g.release();
    expect(g.tryAcquire()).toBe(true);
    expect(g.tryAcquire()).toBe(false);
  });
});

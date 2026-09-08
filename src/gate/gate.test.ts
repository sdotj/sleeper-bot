import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { hashPassword, verifyPassword, verifyPasswordAsync, safeEqual } from "./credentials.js";
import { loadGateConfig } from "./config.js";
import { registerAuth } from "./registerAuth.js";

describe("credentials", () => {
  it("verifies a password against its own scrypt hash", () => {
    const encoded = hashPassword("hunter2");
    expect(encoded.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("hunter2", encoded)).toBe(true);
    expect(verifyPassword("wrong", encoded)).toBe(false);
  });

  it("produces a fresh salt each time (different hashes, both valid)", () => {
    const a = hashPassword("same");
    const b = hashPassword("same");
    expect(a).not.toBe(b);
    expect(verifyPassword("same", a)).toBe(true);
    expect(verifyPassword("same", b)).toBe(true);
  });

  it("returns false (never throws) on malformed encoded input", () => {
    expect(verifyPassword("x", "")).toBe(false);
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "scrypt$16384$8$1$zz$zz")).toBe(false);
  });

  it("verifyPasswordAsync matches the sync check without blocking (audit #7)", async () => {
    const encoded = hashPassword("hunter2");
    expect(await verifyPasswordAsync("hunter2", encoded)).toBe(true);
    expect(await verifyPasswordAsync("wrong", encoded)).toBe(false);
    expect(await verifyPasswordAsync("x", "not-a-hash")).toBe(false);
  });

  it("safeEqual compares in constant form", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("loadGateConfig", () => {
  it("is disabled with nothing set, partial with some, enabled with all three", () => {
    expect(loadGateConfig({}).enabled).toBe(false);
    expect(loadGateConfig({ SLEEPBOT_AUTH_USER: "a" }).partial).toBe(true);
    const full = loadGateConfig({
      SLEEPBOT_AUTH_USER: "a",
      SLEEPBOT_AUTH_PASSWORD_HASH: "h",
      SLEEPBOT_JWT_SECRET: "s",
    });
    expect(full.enabled).toBe(true);
    expect(full.ttl).toBe("7d");
  });
});

describe("registerAuth (integration)", () => {
  const saved = { ...process.env };
  let app: FastifyInstance;

  /** Build a tiny app: registerAuth + one protected route + public health + an /internal route. */
  async function build(): Promise<FastifyInstance> {
    const a = Fastify({ logger: false });
    await registerAuth(a);
    a.get("/api/health", async () => ({ ok: true }));
    a.get("/api/leagues", async () => [{ id: "L1" }]);
    a.post("/internal/sweep", async () => ({ swept: true }));
    return a;
  }

  beforeEach(() => {
    process.env.SLEEPBOT_AUTH_USER = "sam";
    process.env.SLEEPBOT_AUTH_PASSWORD_HASH = hashPassword("s3cret");
    process.env.SLEEPBOT_JWT_SECRET = "test-signing-secret";
  });

  afterEach(async () => {
    process.env = { ...saved };
    if (app) await app.close();
  });

  it("issues a token for the right credentials and rejects wrong ones", async () => {
    app = await build();
    const bad = await app.inject({ method: "POST", url: "/api/login", payload: { username: "sam", password: "nope" } });
    expect(bad.statusCode).toBe(401);

    const ok = await app.inject({ method: "POST", url: "/api/login", payload: { username: "sam", password: "s3cret" } });
    expect(ok.statusCode).toBe(200);
    expect(typeof ok.json().token).toBe("string");
  });

  it("guards protected routes but leaves health, login, and /internal open", async () => {
    app = await build();
    // No token → protected route is 401 with the auth_required code.
    const noTok = await app.inject({ method: "GET", url: "/api/leagues" });
    expect(noTok.statusCode).toBe(401);
    expect(noTok.json().code).toBe("auth_required");

    // Public routes need no token.
    expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
    expect((await app.inject({ method: "POST", url: "/internal/sweep" })).statusCode).toBe(200);

    // With a token, the protected route works.
    const { token } = (await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { username: "sam", password: "s3cret" },
    })).json();
    const withTok = await app.inject({
      method: "GET",
      url: "/api/leagues",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(withTok.statusCode).toBe(200);
    expect(withTok.json()).toEqual([{ id: "L1" }]);
  });

  it("does not let a percent-encoded path bypass the guard (regression #1)", async () => {
    app = await build();
    const encoded = await app.inject({ method: "GET", url: "/%61pi/leagues" }); // decodes to /api/leagues
    expect(encoded.statusCode).toBe(401);
    expect(encoded.json().code).toBe("auth_required");
    const { token } = (
      await app.inject({ method: "POST", url: "/api/login", payload: { username: "sam", password: "s3cret" } })
    ).json();
    const ok = await app.inject({
      method: "GET",
      url: "/%61pi/leagues",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("refuses to start with a partially-configured gate (fail closed, #2)", async () => {
    delete process.env.SLEEPBOT_JWT_SECRET; // user + hash set, secret missing
    await expect(build()).rejects.toThrow(/partially configured/);
  });

  it("rejects a weak secret or malformed password hash at startup (#2)", async () => {
    process.env.SLEEPBOT_JWT_SECRET = "short";
    await expect(build()).rejects.toThrow(/too short/);
    process.env.SLEEPBOT_JWT_SECRET = "a-sufficiently-long-secret";
    process.env.SLEEPBOT_AUTH_PASSWORD_HASH = "not-a-scrypt-hash";
    await expect(build()).rejects.toThrow(/scrypt hash/);
  });

  it("SLEEPBOT_REQUIRE_AUTH forces auth even when unconfigured (#2)", async () => {
    delete process.env.SLEEPBOT_AUTH_USER;
    delete process.env.SLEEPBOT_AUTH_PASSWORD_HASH;
    delete process.env.SLEEPBOT_JWT_SECRET;
    process.env.SLEEPBOT_REQUIRE_AUTH = "true";
    await expect(build()).rejects.toThrow(/refusing to start without auth/i);
  });

  it("rate-limits repeated login attempts (audit #7)", async () => {
    app = await build();
    // The default guard allows 10 attempts per window; the 11th is throttled.
    let last = 200;
    for (let i = 0; i < 10; i++) {
      const r = await app.inject({ method: "POST", url: "/api/login", payload: { username: "sam", password: "nope" } });
      last = r.statusCode;
    }
    expect(last).toBe(401); // the 10 allowed attempts are just wrong-password
    const throttled = await app.inject({ method: "POST", url: "/api/login", payload: { username: "sam", password: "nope" } });
    expect(throttled.statusCode).toBe(429);
    expect(throttled.json().code).toBe("rate_limited");
  });

  it("is a no-op (API open) when auth is not configured", async () => {
    delete process.env.SLEEPBOT_AUTH_USER;
    delete process.env.SLEEPBOT_AUTH_PASSWORD_HASH;
    delete process.env.SLEEPBOT_JWT_SECRET;
    app = await build();
    expect((await app.inject({ method: "GET", url: "/api/leagues" })).statusCode).toBe(200);
    // login route isn't registered when disabled
    expect((await app.inject({ method: "POST", url: "/api/login", payload: {} })).statusCode).toBe(404);
  });
});

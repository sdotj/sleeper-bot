import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryStore } from "../audit/index.js";
import { ConfigRegistry } from "../config/loader.js";
import { buildAppContext } from "./context.js";

/**
 * Settings / config-in-store behavior (dec.ui-config-editing). Uses an injected
 * InMemoryStore so nothing touches disk or the network (adapter reads are lazy).
 */

const KEY = "SLEEPBOT_SECRET_KEY";
const HEX_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
// A syntactically valid (unsigned, never sent) JWT with a far-future exp.
function fakeJwt(exp = 4102444800): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ user_id: "42", display_name: "Sam", exp })}.sig`;
}

function makeConfig(leagueId = "L1"): ConfigRegistry {
  // Build a registry directly from a validated object (bypassing env/file).
  const raw = { leagues: [{ id: "main", platform: "sleeper", sleeper: { leagueId, username: "sam" } }] };
  // ConfigRegistry has a private constructor; go through validate + a throwaway load path.
  const reg = Object.create(ConfigRegistry.prototype) as ConfigRegistry;
  (reg as unknown as { applyConfig: (c: unknown) => void }).applyConfig(ConfigRegistry.validate(raw));
  return reg;
}

const savedKey = process.env[KEY];
afterEach(() => {
  if (savedKey === undefined) delete process.env[KEY];
  else process.env[KEY] = savedKey;
  delete process.env.SLEEPER_TOKEN;
});

describe("config in store", () => {
  it("seeds the store from the passed config on first boot, then is store-authoritative", async () => {
    const store = new InMemoryStore();
    const ctx = await buildAppContext(makeConfig("111"), store);
    // Seeded:
    const seeded = await store.get<{ leagues: { sleeper?: { leagueId: string } }[] }>("config", "current");
    expect(seeded?.leagues[0].sleeper?.leagueId).toBe("111");

    // A second boot with a DIFFERENT passed config must adopt the STORED one.
    const ctx2 = await buildAppContext(makeConfig("999"), store);
    expect(ctx2.config.list()[0].sleeper?.leagueId).toBe("111");
    expect(ctx).toBeTruthy();
  });

  it("saveConfig validates, persists, and adopts live; rejects invalid input", async () => {
    const store = new InMemoryStore();
    const ctx = await buildAppContext(makeConfig(), store);

    await ctx.saveConfig({
      leagues: [{ id: "main", platform: "sleeper", sleeper: { leagueId: "222", username: "sam" }, valueMode: "dynasty" }],
    });
    expect(ctx.config.get("main").valueMode).toBe("dynasty");
    const persisted = await store.get<{ leagues: { valueMode: string }[] }>("config", "current");
    expect(persisted?.leagues[0].valueMode).toBe("dynasty");

    await expect(ctx.saveConfig({ leagues: [] })).rejects.toThrow(/at least one league/);
    // The last-good config is untouched after a rejected save.
    expect(ctx.config.get("main").valueMode).toBe("dynasty");
  });
});

describe("sleeper token secret", () => {
  beforeEach(() => {
    process.env[KEY] = HEX_KEY;
  });

  it("stores the token encrypted, reports source 'store', and survives a reboot", async () => {
    const store = new InMemoryStore();
    const ctx = await buildAppContext(makeConfig(), store);
    expect(ctx.sleeperTokenStatus().source).toBe("none");

    const jwt = fakeJwt();
    await ctx.setSleeperToken(jwt);

    const status = ctx.sleeperTokenStatus();
    expect(status.source).toBe("store");
    expect(status.state).toBe("ok"); // needs-reauth cleared immediately
    expect(status.user).toBe("Sam");

    // Not stored in the clear.
    const rec = await store.get<{ ciphertext: string }>("secrets", "sleeper_token");
    expect(rec?.ciphertext).toBeTruthy();
    expect(JSON.stringify(rec)).not.toContain(jwt);

    // A fresh boot decrypts it back to an active session.
    const ctx2 = await buildAppContext(makeConfig(), store);
    expect(ctx2.sleeperTokenStatus().source).toBe("store");
    expect(ctx2.sleeperTokenStatus().state).toBe("ok");
  });

  it("prefers the stored token over the env seed", async () => {
    const store = new InMemoryStore();
    process.env.SLEEPER_TOKEN = fakeJwt();
    const ctx = await buildAppContext(makeConfig(), store);
    expect(ctx.sleeperTokenStatus().source).toBe("env");

    await ctx.setSleeperToken(fakeJwt());
    expect(ctx.sleeperTokenStatus().source).toBe("store");

    await ctx.clearSleeperToken(); // reverts to env
    expect(ctx.sleeperTokenStatus().source).toBe("env");
  });

  it("refuses to store a non-JWT, and refuses entirely without SLEEPBOT_SECRET_KEY", async () => {
    const store = new InMemoryStore();
    const ctx = await buildAppContext(makeConfig(), store);
    await expect(ctx.setSleeperToken("not-a-jwt")).rejects.toThrow();

    delete process.env[KEY];
    const ctx2 = await buildAppContext(makeConfig(), store);
    expect(ctx2.sleeperTokenStatus().editable).toBe(false);
    await expect(ctx2.setSleeperToken(fakeJwt())).rejects.toThrow(/SLEEPBOT_SECRET_KEY/);
  });
});

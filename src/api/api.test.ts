import { describe, expect, it } from "vitest";
import { NeedsReauthError } from "../auth/index.js";
import type { SleepBotOperations } from "../core/index.js";
import { buildApiServer } from "./server.js";

/** Cast a partial stub to the ops surface the routes under test actually call. */
const ops = (over: Record<string, unknown>) => over as unknown as SleepBotOperations;

describe("API routes", () => {
  it("health and leagues return data", async () => {
    const app = await buildApiServer(ops({ listLeagues: () => [{ id: "L1", platform: "sleeper" }] }));
    expect((await app.inject({ method: "GET", url: "/api/health" })).json()).toEqual({ ok: true });
    const leagues = await app.inject({ method: "GET", url: "/api/leagues" });
    expect(leagues.json()).toEqual([{ id: "L1", platform: "sleeper" }]);
  });

  it("maps an unknown league to 404", async () => {
    const app = await buildApiServer(
      ops({
        getLeagueInfo: () => {
          throw new Error('unknown leagueId "nope". Configured leagues: L1');
        },
      }),
    );
    const res = await app.inject({ method: "GET", url: "/api/leagues/nope" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/unknown leagueId/);
  });

  it("maps a needs-reauth failure to 401", async () => {
    const app = await buildApiServer(
      ops({
        executeAction: () => {
          throw new NeedsReauthError("supply a fresh SLEEPER_TOKEN");
        },
      }),
    );
    const res = await app.inject({ method: "POST", url: "/api/actions/abc/execute" });
    expect(res.statusCode).toBe(401);
  });

  it("annotates a proposal with a draft note", async () => {
    const app = await buildApiServer(
      ops({
        proposeAddDrop: async () => ({
          id: "a1",
          status: "pending",
          kind: "add_drop",
          verdict: { decision: "allow", blockedReasons: [], warnings: [] },
        }),
      }),
    );
    const res = await app.inject({
      method: "POST",
      url: "/api/leagues/L1/propose/add-drop",
      payload: { rosterId: 1, addPlayerId: "x" },
    });
    expect(res.json().note).toMatch(/DRAFT/);
  });
});

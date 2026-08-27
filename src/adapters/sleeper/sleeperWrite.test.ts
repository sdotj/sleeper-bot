import { describe, expect, it, vi } from "vitest";
import { NeedsReauthError } from "../../auth/SessionProvider.js";
import { SleeperSessionProvider } from "../../auth/sleeperSession.js";
import {
  SleeperWriteClient,
  addDropVariables,
  tradeVariables,
  waiverVariables,
  type FetchFn,
} from "./sleeperWriteClient.js";

function jwt(): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64({ user_id: "u1", display_name: "Sam", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}
const session = () => new SleeperSessionProvider({ token: jwt(), notify: () => {} });

describe("write payload -> GraphQL variables", () => {
  it("maps a trade to parallel add/drop arrays with correct roster directions", () => {
    const v = tradeVariables("L", {
      fromRosterId: 1,
      toRosterId: 2,
      sendPlayerIds: ["a"],
      receivePlayerIds: ["b"],
    });
    expect(v.k_adds).toEqual(["a", "b"]);
    expect(v.v_adds).toEqual([2, 1]); // a received by team 2; b received by team 1
    expect(v.k_drops).toEqual(["a", "b"]);
    expect(v.v_drops).toEqual([1, 2]); // a sent by team 1; b sent by team 2
  });

  it("maps add/drop and waiver payloads", () => {
    expect(addDropVariables("L", { rosterId: 3, addPlayerId: "x", dropPlayerId: "y" })).toMatchObject({
      roster_id: 3,
      adds: { x: 3 },
      drops: { y: 3 },
    });
    expect(waiverVariables("L", { rosterId: 3, addPlayerId: "x", faabBid: 15 })).toMatchObject({
      adds: { x: 3 },
      drops: {},
      waiver_budget: 15,
    });
  });
});

describe("SleeperWriteClient transport", () => {
  it("posts to the graphql endpoint with the op header and returns a WriteResult", async () => {
    const calls: { url: string; init: { headers: Record<string, string> } }[] = [];
    const fetchFn: FetchFn = async (url, init) => {
      calls.push({ url, init });
      return {
        status: 200,
        text: async () =>
          JSON.stringify({ data: { create_free_agent: { transaction_id: "T1", status: "complete" } } }),
      };
    };
    const res = await new SleeperWriteClient("L", session(), fetchFn).executeAddDrop({
      rosterId: 1,
      addPlayerId: "x",
    });
    expect(res).toMatchObject({ ok: true, platformRef: "T1" });
    expect(calls[0].url).toBe("https://sleeper.com/graphql");
    expect(calls[0].init.headers["x-sleeper-graphql-op"]).toBe("create_free_agent");
    expect(calls[0].init.headers.authorization).toMatch(/^eyJ/);
  });

  it("trips needs-reauth on an unauthorized error (by code)", async () => {
    const s = session();
    const markInvalid = vi.spyOn(s, "markInvalid");
    const fetchFn: FetchFn = async () => ({
      status: 200,
      text: async () => JSON.stringify({ errors: [{ message: "nope", code: "unauthorized" }] }),
    });
    await expect(
      new SleeperWriteClient("L", s, fetchFn).executeAddDrop({ rosterId: 1, addPlayerId: "x" }),
    ).rejects.toBeInstanceOf(NeedsReauthError);
    expect(markInvalid).toHaveBeenCalledOnce();
  });

  it("trips needs-reauth on the real message-only token error", async () => {
    // Exactly what the live endpoint returns for a bad token (no `code`).
    const s = session();
    const markInvalid = vi.spyOn(s, "markInvalid");
    const fetchFn: FetchFn = async () => ({
      status: 200,
      text: async () => JSON.stringify({ errors: [{ message: "Your token is invalid." }] }),
    });
    await expect(
      new SleeperWriteClient("L", s, fetchFn).executeAddDrop({ rosterId: 1, addPlayerId: "x" }),
    ).rejects.toBeInstanceOf(NeedsReauthError);
    expect(markInvalid).toHaveBeenCalledOnce();
  });

  it("throws NeedsReauthError before hitting the network when no token is set", async () => {
    const fetchFn = vi.fn();
    const client = new SleeperWriteClient(
      "L",
      new SleeperSessionProvider({ notify: () => {} }),
      fetchFn as unknown as FetchFn,
    );
    await expect(client.executeAddDrop({ rosterId: 1, addPlayerId: "x" })).rejects.toBeInstanceOf(
      NeedsReauthError,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

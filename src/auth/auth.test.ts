import { describe, expect, it, vi } from "vitest";
import { NeedsReauthError } from "./SessionProvider.js";
import { SleeperSessionProvider } from "./sleeperSession.js";

describe("SleeperSessionProvider", () => {
  it("starts in needs-reauth and throws when no token is configured", async () => {
    const p = new SleeperSessionProvider({ notify: () => {} });
    expect(p.state).toBe("needs-reauth");
    await expect(p.getToken()).rejects.toBeInstanceOf(NeedsReauthError);
  });

  it("returns the token when configured", async () => {
    const p = new SleeperSessionProvider({ token: "tok", notify: () => {} });
    expect(p.state).toBe("ok");
    expect(await p.getToken()).toBe("tok");
  });

  it("fails safe to needs-reauth and notifies when it cannot refresh", async () => {
    const notify = vi.fn();
    const p = new SleeperSessionProvider({ token: "tok", notify });
    await p.markInvalid(); // no refresh token -> cannot refresh
    expect(p.state).toBe("needs-reauth");
    expect(notify).toHaveBeenCalledOnce();
    await expect(p.getToken()).rejects.toBeInstanceOf(NeedsReauthError);
  });
});

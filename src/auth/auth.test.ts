import { describe, expect, it, vi } from "vitest";
import { NeedsReauthError } from "./SessionProvider.js";
import { SleeperSessionProvider } from "./sleeperSession.js";
import { inspectToken, isExpired } from "./token.js";

/** Build an unsigned JWT with a given expiry offset (seconds from now). */
function jwt(expOffsetSec: number, extra: Record<string, unknown> = {}): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const exp = Math.floor(Date.now() / 1000) + expOffsetSec;
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ user_id: "u1", display_name: "Sam", exp, ...extra })}.sig`;
}

describe("token inspection", () => {
  it("decodes user and expiry, and detects expiry", () => {
    const info = inspectToken(jwt(3600));
    expect(info.userId).toBe("u1");
    expect(info.displayName).toBe("Sam");
    expect(isExpired(info)).toBe(false);
    expect(isExpired(inspectToken(jwt(-10)))).toBe(true);
  });

  it("rejects a non-JWT string", () => {
    expect(() => inspectToken("not-a-jwt")).toThrow();
  });
});

describe("SleeperSessionProvider", () => {
  it("starts in needs-reauth and throws when no token is configured", async () => {
    const p = new SleeperSessionProvider({ notify: () => {} });
    expect(p.state).toBe("needs-reauth");
    await expect(p.getToken()).rejects.toBeInstanceOf(NeedsReauthError);
  });

  it("is ok with a valid token and exposes status", async () => {
    const token = jwt(3600);
    const p = new SleeperSessionProvider({ token, notify: () => {} });
    expect(p.state).toBe("ok");
    expect(await p.getToken()).toBe(token);
    const s = p.status();
    expect(s.state).toBe("ok");
    expect(s.user).toBe("Sam");
    expect(s.secondsRemaining).toBeGreaterThan(0);
  });

  it("is needs-reauth for an expired token, and notifies", () => {
    const notify = vi.fn();
    const p = new SleeperSessionProvider({ token: jwt(-10), notify });
    expect(p.state).toBe("needs-reauth");
    expect(notify).toHaveBeenCalledOnce();
  });

  it("is needs-reauth for a malformed (non-JWT) token", () => {
    const p = new SleeperSessionProvider({ token: "garbage", notify: () => {} });
    expect(p.state).toBe("needs-reauth");
  });

  it("fails safe to needs-reauth when markInvalid is called on a valid token", async () => {
    const notify = vi.fn();
    const p = new SleeperSessionProvider({ token: jwt(3600), notify });
    expect(p.state).toBe("ok");
    await p.markInvalid();
    expect(p.state).toBe("needs-reauth");
    expect(notify).toHaveBeenCalledOnce();
    await expect(p.getToken()).rejects.toBeInstanceOf(NeedsReauthError);
  });
});

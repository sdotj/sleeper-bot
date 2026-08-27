/**
 * Sleeper session tokens are JWTs. We never *verify* them (only Sleeper can),
 * but we can decode the payload to learn who the token belongs to and when it
 * expires — which lets us flag `needs-reauth` proactively instead of only after
 * a rejected write. Protocol details reverse-engineered by cameron-eth/sleeper-sdk.
 */
export interface TokenInfo {
  userId: string;
  displayName: string;
  /** Epoch seconds. */
  issuedAt: number;
  /** Epoch seconds; 0 if the token carries no exp. */
  expiresAt: number;
}

/** Decode (not verify) a Sleeper JWT payload. Throws if it is not a JWT. */
export function inspectToken(jwt: string): TokenInfo {
  const parts = jwt.split(".");
  if (parts.length !== 3) {
    throw new Error("token does not look like a JWT (expected 3 dot-separated parts)");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
  return {
    userId: String(payload.user_id ?? ""),
    displayName: String(payload.display_name ?? ""),
    issuedAt: Number(payload.iat ?? 0),
    expiresAt: Number(payload.exp ?? 0),
  };
}

/** True when the token has an exp in the past. A missing exp is treated as valid. */
export function isExpired(info: TokenInfo, nowMs: number = Date.now()): boolean {
  return info.expiresAt > 0 && nowMs / 1000 >= info.expiresAt;
}

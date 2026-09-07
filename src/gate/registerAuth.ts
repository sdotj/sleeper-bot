import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { loadGateConfig, type GateConfig } from "./config.js";
import { isScryptHash, safeEqual, verifyPassword } from "./credentials.js";

/**
 * Login gate for the HTTP API (dec.api-auth-gate). When credentials + a JWT
 * secret are configured, this:
 *
 *  1. registers `@fastify/jwt` (HS256 with the configured secret),
 *  2. exposes `POST /api/login` — verifies the one predetermined user/password
 *     (scrypt) and returns a signed bearer token,
 *  3. adds an `onRequest` guard that requires a valid token on every route
 *     EXCEPT the public ones (health, login, the static GUI, and `/internal/*`,
 *     which carry their own shared-secret auth).
 *
 * Unconfigured ⇒ no-op (the API stays open for local dev), with a loud warning.
 * Returns the resolved {@link GateConfig} so the caller can log/branch.
 */
export async function registerAuth(app: FastifyInstance): Promise<GateConfig> {
  const gate = loadGateConfig();
  const requireAuth = /^(1|true|yes|on)$/i.test(process.env.SLEEPBOT_REQUIRE_AUTH ?? "");

  // Fail CLOSED on misconfiguration: a half-set gate must not silently run open
  // (a forgotten prod secret used to leave the whole API unauthenticated).
  if (gate.partial) {
    throw new Error(
      "[gate] auth is partially configured — set ALL of SLEEPBOT_AUTH_USER, " +
        "SLEEPBOT_AUTH_PASSWORD_HASH, and SLEEPBOT_JWT_SECRET (or none). Refusing to start with a half-set gate.",
    );
  }
  if (!gate.enabled) {
    if (requireAuth) {
      throw new Error("[gate] SLEEPBOT_REQUIRE_AUTH is set but the login gate is not configured — refusing to start without auth.");
    }
    console.error("[gate] auth disabled (no SLEEPBOT_AUTH_* set) — the HTTP API is open. Fine for localhost; set all three (or SLEEPBOT_REQUIRE_AUTH) before any public deploy.");
    return gate;
  }

  // Validate the credential material before we start trusting it.
  if (gate.secret.length < 16) {
    throw new Error("[gate] SLEEPBOT_JWT_SECRET is too short (need at least 16 chars; use `openssl rand -hex 32`).");
  }
  if (!isScryptHash(gate.passwordHash)) {
    throw new Error("[gate] SLEEPBOT_AUTH_PASSWORD_HASH is not a valid scrypt hash — run `npm run hash-password`.");
  }

  await app.register(fastifyJwt, { secret: gate.secret });

  app.post("/api/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = (req.body ?? {}) as { username?: unknown; password?: unknown };
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";

    // Verify the password even when the username is wrong so response time
    // doesn't reveal whether the username exists.
    const userOk = safeEqual(username, gate.username);
    const passOk = verifyPassword(password, gate.passwordHash);
    if (!userOk || !passOk) {
      return reply.status(401).send({ error: "invalid username or password" });
    }

    const token = app.jwt.sign({ sub: gate.username }, { expiresIn: gate.ttl });
    return { token, username: gate.username };
  });

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    if (isPublic(req)) return;
    try {
      await req.jwtVerify();
    } catch {
      // `code: "auth_required"` lets the browser distinguish a login timeout
      // from a Sleeper-token reauth (which also returns 401 but keeps the session).
      return reply.status(401).send({ error: "authentication required", code: "auth_required" });
    }
  });

  console.error(`[gate] auth enabled for user "${gate.username}" (token TTL ${gate.ttl}).`);
  return gate;
}

/** The request path, percent-decoded, without the query string. */
function decodedPath(rawUrl: string | undefined): string {
  const p = (rawUrl ?? "").split("?")[0];
  try {
    return decodeURIComponent(p);
  } catch {
    return p; // malformed encoding — leave as-is (it won't match "/api/" literally)
  }
}

/**
 * Routes reachable without a login token. DEFAULT-DENY for the JSON API: a
 * request is public only if it's a known public route, or it is neither a
 * matched `/api/*` route NOR decodes to an `/api/` path. Checking BOTH the
 * matched route (`routeOptions.url`, which Fastify has already %-decoded and
 * matched) and the decoded raw path closes the `/%61pi/leagues` bypass — an
 * encoded path still resolves to its real `/api/*` route and is enforced.
 */
function isPublic(req: FastifyRequest): boolean {
  const route = req.routeOptions?.url ?? ""; // canonical matched route (may be "" for 404/static)
  const path = decodedPath(req.raw.url);

  if (route === "/api/health" || path === "/api/health") return true;
  if (route === "/api/login" || path === "/api/login") return true;
  // Internal cron/webhook routes carry their own SLEEPBOT_INTERNAL_SECRET.
  if (route.startsWith("/internal/") || path.startsWith("/internal/")) return true;
  // Any request that is, or decodes to, an /api route needs a token; everything
  // else (static assets, SPA fallback) is public so the login page can load.
  return !(route.startsWith("/api/") || path.startsWith("/api/"));
}

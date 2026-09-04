import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { loadGateConfig, type GateConfig } from "./config.js";
import { safeEqual, verifyPassword } from "./credentials.js";

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

  if (!gate.enabled) {
    if (gate.partial) {
      console.error(
        "[gate] auth PARTIALLY configured — need SLEEPBOT_AUTH_USER, " +
          "SLEEPBOT_AUTH_PASSWORD_HASH, and SLEEPBOT_JWT_SECRET. API is OPEN until all three are set.",
      );
    } else {
      console.error("[gate] auth disabled (no SLEEPBOT_AUTH_* set) — the HTTP API is open. Fine for localhost; set all three before any public deploy.");
    }
    return gate;
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

/** Routes reachable without a login token. */
function isPublic(req: FastifyRequest): boolean {
  const path = (req.raw.url ?? "").split("?")[0];
  if (path === "/api/health") return true;
  if (path === "/api/login") return true;
  // Internal cron/webhook routes carry their own SLEEPBOT_INTERNAL_SECRET.
  if (path.startsWith("/internal/")) return true;
  // Anything that isn't the JSON API is the static GUI / SPA fallback — the
  // login page itself must load unauthenticated.
  if (!path.startsWith("/api/")) return true;
  return false;
}

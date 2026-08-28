import { existsSync } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import { NeedsReauthError } from "../auth/index.js";
import { SleepBotOperations, proposalOutcome } from "../core/index.js";
import { ChatUnavailableError, runChatTurn, type ChatMessage, type DraftContextRef } from "../chat/index.js";
import type {
  AddDropPayload,
  TradePayload,
  WaiverClaimPayload,
} from "../adapters/LeagueAdapter.js";

/**
 * The local HTTP API: a thin REST surface over {@link SleepBotOperations}. The
 * React GUI (and, later, any other client) calls these routes; Claude reaches
 * the same operations over MCP. No domain logic lives here — routes validate,
 * call an operation, and let the shared error mapper translate failures
 * (dec.gui-architecture).
 */
export function buildApiServer(ops: SleepBotOperations): FastifyInstance {
  const app = Fastify({ logger: false });

  /** Map a thrown error onto an HTTP status the GUI can branch on. */
  const fail = (reply: FastifyReply, err: unknown) => {
    const message = (err as Error).message;
    if (err instanceof NeedsReauthError) return reply.status(401).send({ error: message });
    if (/^unknown leagueId/.test(message)) return reply.status(404).send({ error: message });
    return reply.status(400).send({ error: message });
  };

  /** Wrap a handler so its resolved value is returned and errors are mapped. */
  const h =
    (fn: (req: FastifyRequest) => Promise<unknown> | unknown) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        return await fn(req);
      } catch (err) {
        return fail(reply, err);
      }
    };

  const id = (req: FastifyRequest) => (req.params as { id: string }).id;
  const week = (req: FastifyRequest) => {
    const w = (req.query as { week?: string }).week;
    return w ? Number(w) : undefined;
  };

  app.get("/api/health", async () => ({ ok: true }));

  // --- reads ---------------------------------------------------------------
  app.get("/api/leagues", h(() => ops.listLeagues()));
  app.get("/api/leagues/:id", h((req) => ops.getLeagueInfo(id(req))));
  app.get("/api/leagues/:id/rosters", h((req) => ops.getRosters(id(req))));
  app.get("/api/leagues/:id/my-roster", h((req) => ops.getMyRoster(id(req))));
  app.get("/api/leagues/:id/standings", h((req) => ops.getStandings(id(req))));
  app.get("/api/leagues/:id/matchups", h((req) => ops.getMatchups(id(req), week(req))));
  app.get("/api/leagues/:id/transactions", h((req) => ops.getTransactions(id(req), week(req))));
  app.get(
    "/api/leagues/:id/players",
    h((req) => {
      const q = req.query as { query?: string; position?: string; team?: string; limit?: string };
      return ops.searchPlayers(id(req), q.query ?? "", {
        position: q.position,
        team: q.team,
        limit: q.limit ? Number(q.limit) : undefined,
      });
    }),
  );
  app.get(
    "/api/leagues/:id/trending",
    h((req) => {
      const q = req.query as { type?: "add" | "drop"; limit?: string };
      return ops.getTrendingPlayers(id(req), q.type ?? "add", q.limit ? Number(q.limit) : undefined);
    }),
  );
  app.get("/api/leagues/:id/auth", h((req) => ops.getAuthStatus(id(req))));

  // --- drafts (read-only assistant) ----------------------------------------
  const draftId = (req: FastifyRequest) => (req.params as { draftId: string }).draftId;
  const num = (v: string | undefined) => (v != null ? Number(v) : undefined);
  app.get("/api/leagues/:id/drafts", h((req) => ops.listDrafts(id(req))));
  app.get(
    "/api/leagues/:id/drafts/:draftId/board",
    h((req) => ops.getDraftBoard(id(req), draftId(req), num((req.query as { yourRosterId?: string }).yourRosterId))),
  );
  app.get(
    "/api/leagues/:id/drafts/:draftId/picks",
    h((req) => ops.getDraftPicks(id(req), draftId(req))),
  );
  app.get(
    "/api/leagues/:id/drafts/:draftId/recommendations",
    h((req) => {
      const q = req.query as { rosterId?: string; position?: string; limit?: string };
      return ops.getDraftRecommendations(id(req), draftId(req), {
        rosterId: num(q.rosterId),
        position: q.position,
        limit: num(q.limit),
      });
    }),
  );

  app.get("/api/audit", h((req) => ops.getAuditLog((req.query as { leagueId?: string }).leagueId)));
  app.get(
    "/api/pending",
    h((req) => ops.listPendingActions((req.query as { leagueId?: string }).leagueId)),
  );

  // --- writes (confirm-by-default) -----------------------------------------
  app.post(
    "/api/leagues/:id/propose/trade",
    h(async (req) => proposalOutcome(await ops.proposeTrade(id(req), req.body as TradePayload))),
  );
  app.post(
    "/api/leagues/:id/propose/add-drop",
    h(async (req) => proposalOutcome(await ops.proposeAddDrop(id(req), req.body as AddDropPayload))),
  );
  app.post(
    "/api/leagues/:id/propose/waiver",
    h(async (req) => proposalOutcome(await ops.proposeWaiverClaim(id(req), req.body as WaiverClaimPayload))),
  );
  app.post(
    "/api/actions/:id/execute",
    h((req) => ops.executeAction(id(req))),
  );

  // --- chat (server-side Claude tool-use loop) -----------------------------
  app.post("/api/chat", async (req, reply) => {
    try {
      const { messages, draftContext } =
        (req.body as { messages?: ChatMessage[]; draftContext?: DraftContextRef }) ?? {};
      // In a draft room, keep it snappy: a fast model, tight token budget, and
      // web capped to 1 use (the live board answers most questions with none).
      // The main chat can run a stronger model with freer web.
      const inDraft = !!draftContext;
      return await runChatTurn(ops, messages ?? [], {
        draftContext,
        model: inDraft ? process.env.ANTHROPIC_DRAFT_MODEL ?? process.env.ANTHROPIC_MODEL : undefined,
        maxTokens: inDraft ? 1500 : 4096,
        maxIterations: inDraft ? 8 : 12,
        web: { maxUses: inDraft ? 1 : 3 },
      });
    } catch (err) {
      if (err instanceof ChatUnavailableError) return reply.status(503).send({ error: err.message });
      return fail(reply, err);
    }
  });

  // --- static GUI (single-deployable prod) ---------------------------------
  // Serve the built web app when present (cloud). In dev, Vite serves it and
  // this is skipped. Non-API GETs fall back to index.html for the SPA.
  const staticDir = resolve(process.env.SLEEPBOT_STATIC_DIR ?? "web/dist");
  if (process.env.SLEEPBOT_SERVE_STATIC !== "false" && existsSync(staticDir)) {
    app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === "GET" && !req.url.startsWith("/api")) return reply.sendFile("index.html");
      return reply.status(404).send({ error: "not found" });
    });
  }

  return app;
}

#!/usr/bin/env node
import { ConfigRegistry } from "../config/loader.js";
import { buildAppContext, SleepBotOperations } from "../core/index.js";
import { startAgent } from "../agent/index.js";
import { buildApiServer } from "./server.js";

/**
 * SleepBot HTTP API entrypoint. Loads config, builds the shared core, and
 * serves the REST surface for the GUI. Stateless beyond the shared Store, so it
 * moves from laptop to a cloud web service as a deploy change (dec.gui-architecture).
 * Secrets (SLEEPER_TOKEN, ANTHROPIC_API_KEY) are read from the server env only.
 */
async function main(): Promise<void> {
  const config = ConfigRegistry.load();
  const ctx = await buildAppContext(config);
  const ops = new SleepBotOperations(ctx);
  const app = await buildApiServer(ops);

  // Autonomous manager + Telegram approvals (no-op unless a league opts in and
  // TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / ANTHROPIC_API_KEY are set).
  const agent = startAgent(ctx, ops);
  if (agent) {
    const secret = process.env.SLEEPBOT_INTERNAL_SECRET;

    // Cloud Scheduler (or a manual curl) triggers a sweep. Bearer/secret auth so
    // the endpoint isn't openly callable. Requires SLEEPBOT_INTERNAL_SECRET.
    app.post("/internal/sweep", async (req, reply) => {
      const h = req.headers;
      const ok = !!secret && (h["x-sleepbot-secret"] === secret || h.authorization === `Bearer ${secret}`);
      if (!ok) return reply.status(401).send({ error: "unauthorized" });
      await agent.sweepAll();
      return { ok: true };
    });

    // Telegram webhook (scale-to-zero): each tap POSTs here and wakes the service.
    // Authenticated by the secret token Telegram echoes back.
    app.post("/internal/telegram", async (req, reply) => {
      if (!secret || req.headers["x-telegram-bot-api-secret-token"] !== secret) {
        return reply.status(401).send({ error: "unauthorized" });
      }
      // Don't swallow handler failures and return 200 — that tells Telegram the
      // update was handled and it won't retry (audit #17). Return 500 so it
      // re-delivers; the tap handler is idempotent, so a retry is safe.
      try {
        await agent.notifier.handleUpdate(req.body as never);
        return { ok: true };
      } catch (err) {
        req.log.error({ err: (err as Error).message }, "telegram webhook handler failed");
        return reply.status(500).send({ ok: false });
      }
    });
  }

  // Manual controls for the GUI (gate-protected like every other /api/* route).
  // These work whether the agent runs in polling or webhook mode; when it's off,
  // they report why so the settings panel can explain it.
  app.get("/api/agent/status", async () => ({ enabled: !!agent, mode: agent?.mode ?? null }));
  app.post("/api/agent/sweep", async () => {
    if (!agent) {
      return {
        ran: false,
        reason:
          "Autonomous manager is off — it needs TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, ANTHROPIC_API_KEY, and at least one league with the agent enabled.",
      };
    }
    const summary = await agent.sweepAll();
    // A manual check always pings Telegram so you can confirm the channel is live,
    // even when there's nothing worth proposing. Any actual proposals were already
    // sent (with Approve/Deny buttons) during the sweep.
    const line =
      summary.total > 0
        ? `🔎 Manual check: ${summary.total} proposal(s) across ${summary.leagues.length} league(s) — see the message(s) above.`
        : `🔎 Manual check: swept ${summary.leagues.length} league(s), nothing worth proposing right now.`;
    await agent.notifier.info(line).catch(() => {});
    return { ran: true, ...summary };
  });

  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  console.error(`SleepBot API listening on http://${host}:${port}`);

  // Graceful shutdown (audit #17): on SIGTERM (Cloud Run scale-down) / SIGINT,
  // stop the agent poll loop, drain the HTTP server, and close the DB pool so
  // in-flight work finishes and connections don't leak.
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`SleepBot received ${signal}, shutting down…`);
    try {
      agent?.stop();
    } catch {
      /* best-effort */
    }
    try {
      await app.close();
    } catch {
      /* best-effort */
    }
    try {
      await ctx.store.close?.();
    } catch {
      /* best-effort */
    }
    process.exit(0);
  };
  for (const sig of ["SIGTERM", "SIGINT"] as const) process.once(sig, () => void shutdown(sig));
}

main().catch((err) => {
  console.error(`SleepBot API failed to start: ${(err as Error).message}`);
  process.exit(1);
});

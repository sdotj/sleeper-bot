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
  const app = buildApiServer(ops);

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
      await agent.notifier.handleUpdate(req.body as never).catch(() => {});
      return { ok: true };
    });
  }

  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  console.error(`SleepBot API listening on http://${host}:${port}`);
}

main().catch((err) => {
  console.error(`SleepBot API failed to start: ${(err as Error).message}`);
  process.exit(1);
});

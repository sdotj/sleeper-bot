import { Notifier, TelegramClient } from "../notify/index.js";
import type { AppContext, SleepBotOperations } from "../core/index.js";
import { AgentRunner, type Autonomy } from "./agentRunner.js";
import { AgentScheduler } from "./scheduler.js";

export interface AgentHandle {
  stop(): void;
  runner: AgentRunner;
  /** The notifier — the webhook route dispatches Telegram updates through it. */
  notifier: Notifier;
  /** "polling" (always-on) or "webhook" (scale-to-zero + external cron). */
  mode: "polling" | "webhook";
  /** Run a sweep of every enabled league now (manual trigger / cron / testing). */
  sweepAll(): Promise<void>;
}

/**
 * Wire and start the autonomous manager + Telegram approvals, if configured.
 * Returns null (and logs why) when no league opts in or a prerequisite secret
 * is missing — so the rest of the app runs fine without it.
 */
export function startAgent(ctx: AppContext, ops: SleepBotOperations): AgentHandle | null {
  const enabled = ctx.config.list().filter((l) => l.agent?.enabled);
  if (!enabled.length) return null; // no league opted into the agent

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error("[agent] league(s) opted in but TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID are unset — agent disabled.");
    return null;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("[agent] ANTHROPIC_API_KEY is unset — agent disabled.");
    return null;
  }

  const telegram = new TelegramClient(token);
  const notifier = new Notifier({
    telegram,
    store: ctx.store,
    chatId,
    perform: async (leagueId, kind, payload, opts) => {
      try {
        const a = await ctx.pipeline.perform(leagueId, kind, payload, "user", opts);
        return { ok: a.status === "executed", message: a.result?.message ?? (a.verdict.blockedReasons.join("; ") || "done") };
      } catch (err) {
        return { ok: false, message: (err as Error).message };
      }
    },
  });

  const runner = new AgentRunner({ ctx, ops, notifier });
  // Read config fresh each sweep so autonomy / enabled edits from the settings
  // panel take effect without a restart (dec.ui-config-editing). (Going from zero
  // enabled leagues to one still needs a restart — the agent isn't started here
  // at all in that case; see the early return above.)
  const leagues = () =>
    ctx.config
      .list()
      .filter((l) => l.agent?.enabled)
      .map((l) => ({ id: l.id, autonomy: (l.agent?.autonomy ?? "manual") as Autonomy }));

  // Webhook + external-cron mode (scale-to-zero, $0) when a public URL + secret
  // are set; otherwise long-poll + in-process scheduler (a VM / always-on host).
  const publicUrl = process.env.SLEEPBOT_PUBLIC_URL?.replace(/\/$/, "");
  const secret = process.env.SLEEPBOT_INTERNAL_SECRET;
  const webhook = Boolean(publicUrl && secret);
  const scheduler = new AgentScheduler({
    runner,
    leagues,
    intervalMs: Math.max(5, Number(process.env.SLEEPBOT_AGENT_INTERVAL_MIN ?? 360)) * 60_000,
  });

  if (webhook) {
    void telegram
      .setWebhook(`${publicUrl}/internal/telegram`, secret!)
      .then(() => console.error(`[agent] enabled for ${enabled.map((l) => l.id).join(", ")}; Telegram webhook set; sweeps via Cloud Scheduler -> /internal/sweep.`))
      .catch((e) => console.error(`[agent] setWebhook failed: ${(e as Error).message}`));
  } else {
    if (process.env.SLEEPBOT_PUBLIC_URL && !secret) {
      console.error("[agent] SLEEPBOT_PUBLIC_URL set but SLEEPBOT_INTERNAL_SECRET missing — using polling instead.");
    }
    void telegram.deleteWebhook().catch(() => {}); // ensure long-poll isn't blocked by a stale webhook
    notifier.start();
    scheduler.start();
    console.error(`[agent] enabled for ${enabled.map((l) => l.id).join(", ")}; Telegram long-poll + in-process scheduler on.`);
  }

  return {
    stop() {
      scheduler.stop();
      notifier.stop();
    },
    runner,
    notifier,
    mode: webhook ? "webhook" : "polling",
    async sweepAll() {
      for (const { id, autonomy } of leagues()) await runner.sweepLeague(id, autonomy);
    },
  };
}

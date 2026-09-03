import { Notifier, TelegramClient } from "../notify/index.js";
import type { AppContext, SleepBotOperations } from "../core/index.js";
import { AgentRunner, type Autonomy } from "./agentRunner.js";
import { AgentScheduler } from "./scheduler.js";

export interface AgentHandle {
  stop(): void;
  runner: AgentRunner;
  /** Run a sweep of every enabled league now (manual trigger / testing). */
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
  const leagues = () => enabled.map((l) => ({ id: l.id, autonomy: (l.agent?.autonomy ?? "manual") as Autonomy }));
  const intervalMin = Math.max(5, Number(process.env.SLEEPBOT_AGENT_INTERVAL_MIN ?? 360));
  const scheduler = new AgentScheduler({ runner, leagues, intervalMs: intervalMin * 60_000 });

  notifier.start();
  scheduler.start();
  console.error(
    `[agent] enabled for ${enabled.map((l) => l.id).join(", ")}; sweep every ${intervalMin}min; Telegram polling on.`,
  );

  return {
    stop() {
      scheduler.stop();
      notifier.stop();
    },
    runner,
    async sweepAll() {
      for (const { id, autonomy } of leagues()) await runner.sweepLeague(id, autonomy);
    },
  };
}

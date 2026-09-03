import type { AgentRunner, Autonomy } from "./agentRunner.js";

/**
 * AgentScheduler — runs a sweep of every agent-enabled league on a fixed
 * interval. Deliberately does NOT sweep immediately on start, so a redeploy
 * doesn't trigger a burst of activity; the first sweep is one interval later.
 */
export class AgentScheduler {
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly deps: {
      runner: AgentRunner;
      leagues: () => { id: string; autonomy: Autonomy }[];
      intervalMs: number;
    },
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.deps.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    for (const { id, autonomy } of this.deps.leagues()) {
      try {
        const r = await this.deps.runner.sweepLeague(id, autonomy);
        console.error(`[agent] swept ${id}: ${r.recommended} recommendation(s)${r.skipped ? ` (skipped: ${r.skipped})` : ""}`);
      } catch (err) {
        console.error(`[agent] sweep ${id} failed: ${(err as Error).message}`);
      }
    }
  }
}

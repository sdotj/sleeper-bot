import type { WritePayload } from "../adapters/LeagueAdapter.js";
import type { Store } from "../audit/index.js";
import type { ActionKind } from "../rules/index.js";
import { TelegramClient, type InlineButton, type TelegramUpdate } from "./telegramClient.js";

/** How an awaiting proposal is decided by a tap. */
export type ProposalMode = "approve" | "override";

/** The outcome of actually performing a write (from the pipeline). */
export interface PerformResult {
  ok: boolean;
  message: string;
}

/** Executes (or overrides) a write on the user's tap — injected from core/pipeline. */
export type PerformFn = (
  leagueId: string,
  kind: ActionKind,
  payload: WritePayload,
  opts: { override: boolean },
) => Promise<PerformResult>;

/** What the agent hands the notifier to route to Telegram. */
export interface ProposalNotice {
  id: string;
  leagueId: string;
  kind: ActionKind;
  payload: WritePayload;
  /** One-line human summary of the action (with player names). */
  summary: string;
  warnings: string[];
  blockedReasons: string[];
}

interface OutboxRecord {
  id: string;
  leagueId: string;
  kind: ActionKind;
  payload: WritePayload;
  mode: ProposalMode;
  chatMessageId?: number;
  createdMs: number;
}

export interface NotifierDeps {
  telegram: TelegramClient;
  store: Store;
  chatId: string;
  perform: PerformFn;
}

/**
 * Notifier — pushes agent proposals to Telegram and executes your decision.
 * Awaiting proposals live in a durable outbox (the shared Store) so a tap works
 * even after a redeploy. The poll loop honors only the configured chat id
 * (dec.telegram-notifications).
 */
export class Notifier {
  private static readonly COLLECTION = "agent_outbox";
  private offset = 0;
  private running = false;
  /**
   * Proposal ids currently being performed. Telegram re-delivers callback
   * queries and users double-tap; without this, two taps on the same button
   * could both read the outbox record and perform the write twice (audit #4).
   */
  private readonly inFlight = new Set<string>();

  constructor(private readonly deps: NotifierDeps) {}

  /** A plain informational message (auto-executed action, needs-reauth, etc.). */
  async info(text: string): Promise<void> {
    await this.deps.telegram.sendMessage(this.deps.chatId, text);
  }

  /** Send a proposal awaiting a tap; persist it so the tap can act later. */
  async propose(notice: ProposalNotice, mode: ProposalMode): Promise<void> {
    const buttons: InlineButton[][] =
      mode === "override"
        ? [[
            { text: "⚠️ Override & execute", callback_data: `ovr:${notice.id}` },
            { text: "Dismiss", callback_data: `no:${notice.id}` },
          ]]
        : [[
            { text: "✅ Approve", callback_data: `ok:${notice.id}` },
            { text: "❌ Deny", callback_data: `no:${notice.id}` },
          ]];

    const { message_id } = await this.deps.telegram.sendMessage(
      this.deps.chatId,
      this.format(notice, mode),
      buttons,
    );

    const rec: OutboxRecord = {
      id: notice.id,
      leagueId: notice.leagueId,
      kind: notice.kind,
      payload: notice.payload,
      mode,
      chatMessageId: message_id,
      createdMs: Date.now(),
    };
    await this.deps.store.put(Notifier.COLLECTION, notice.id, rec);
  }

  /** Handle one button tap (exposed for tests). callback_data is `verb:id`. */
  async handleCallback(data: string, callbackQueryId: string): Promise<void> {
    const [verb, id] = data.split(":");
    const rec = id ? await this.deps.store.get<OutboxRecord>(Notifier.COLLECTION, id) : null;
    if (!rec) {
      await this.deps.telegram.answerCallbackQuery(callbackQueryId, "This proposal is no longer pending.");
      return;
    }

    let outcome: string;
    if (verb === "no") {
      outcome = "❌ Dismissed — nothing sent.";
    } else if (verb === "ok" || verb === "ovr") {
      // A second tap arriving mid-execute must not perform the write again.
      if (this.inFlight.has(rec.id)) {
        await this.deps.telegram.answerCallbackQuery(callbackQueryId, "Already processing…");
        return;
      }
      this.inFlight.add(rec.id);
      try {
        const r = await this.deps.perform(rec.leagueId, rec.kind, rec.payload, { override: verb === "ovr" });
        outcome = r.ok ? `✅ Executed — ${r.message}` : `⚠️ ${r.message}`;
      } catch (err) {
        outcome = `⚠️ Failed — ${(err as Error).message}`;
      } finally {
        this.inFlight.delete(rec.id);
      }
    } else {
      outcome = "Unknown action.";
    }

    await this.deps.store.delete(Notifier.COLLECTION, rec.id);
    if (rec.chatMessageId != null) {
      await this.deps.telegram.editMessageText(this.deps.chatId, rec.chatMessageId, outcome).catch(() => {});
    }
    await this.deps.telegram.answerCallbackQuery(callbackQueryId);
  }

  /** Process one update (from webhook or long-poll); honors the allowed chat. */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const cq = update.callback_query;
    if (!cq?.data) return;
    if (cq.message && String(cq.message.chat.id) !== String(this.deps.chatId)) return;
    await this.handleCallback(cq.data, cq.id);
  }

  /** One long-poll cycle: fetch updates, dispatch taps from the allowed chat. */
  async pollOnce(): Promise<void> {
    const updates = await this.deps.telegram.getUpdates(this.offset);
    for (const u of updates) {
      this.offset = Math.max(this.offset, u.update_id + 1);
      await this.handleUpdate(u);
    }
  }

  /** Start/stop the background poll loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }
  stop(): void {
    this.running = false;
  }
  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch {
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  private format(n: ProposalNotice, mode: ProposalMode): string {
    const lines = [`🤖 <b>SleepBot proposes</b> (${n.leagueId})`, n.summary];
    if (n.warnings.length) lines.push(`⚠️ ${n.warnings.join("; ")}`);
    if (mode === "override" && n.blockedReasons.length) lines.push(`🛑 Blocked by rule: ${n.blockedReasons.join("; ")}`);
    lines.push(mode === "override" ? "Override the rule to send it?" : "Send it?");
    return lines.join("\n");
  }
}

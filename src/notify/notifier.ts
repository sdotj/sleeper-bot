import type { Platform, WritePayload } from "../adapters/LeagueAdapter.js";
import type { Store } from "../audit/index.js";
import type { ActionKind } from "../rules/index.js";
import { TelegramClient, type InlineButton, type TelegramUpdate } from "./telegramClient.js";

/** The immutable platform target a league label maps to (audit #5). */
export interface LeagueIdentity {
  platform: Platform;
  platformLeagueId: string;
}

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
  /** The immutable target snapshot at propose time (audit #5). */
  identity?: LeagueIdentity;
  chatMessageId?: number;
  createdMs: number;
}

export interface NotifierDeps {
  telegram: TelegramClient;
  store: Store;
  chatId: string;
  perform: PerformFn;
  /** Current immutable target for a league label, to detect a remap (audit #5). */
  leagueIdentity?: (leagueId: string) => LeagueIdentity;
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
      identity: this.deps.leagueIdentity?.(notice.leagueId),
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

    // The verb must match how this proposal was offered (audit #11): an
    // `approve` proposal only accepts ok/no, an `override` proposal only
    // accepts ovr/no. Reject a mismatched verb WITHOUT performing anything, so
    // an `ovr:` tap can't override-execute a proposal that was never a block.
    const expectedApproval = verb === "ovr" ? "override" : verb === "ok" ? "approve" : null;
    if (expectedApproval && rec.mode !== expectedApproval) {
      await this.deps.telegram.answerCallbackQuery(callbackQueryId, "That action doesn't match this proposal.");
      return;
    }
    // Reject an unrecognized verb WITHOUT touching the record (audit #11: don't
    // drop the outbox entry on an unknown verb).
    if (verb !== "no" && verb !== "ok" && verb !== "ovr") {
      await this.deps.telegram.answerCallbackQuery(callbackQueryId, "Unknown action.");
      return;
    }

    let outcome: string;
    if (verb === "no") {
      outcome = "❌ Dismissed — nothing sent.";
      await this.deps.store.delete(Notifier.COLLECTION, rec.id);
    } else {
      // ok / ovr — an actual write. Hold the in-process claim across BOTH the
      // perform AND the durable delete, so a redelivered callback that arrives
      // mid-flight can't perform it a second time (audit #2/#4).
      if (this.inFlight.has(rec.id)) {
        await this.deps.telegram.answerCallbackQuery(callbackQueryId, "Already processing…");
        return;
      }
      this.inFlight.add(rec.id);
      try {
        // Target-binding: the label must still map to the approved platform/league
        // (audit #5) — a remap mustn't redirect this tap to a different target.
        const current = this.deps.leagueIdentity?.(rec.leagueId);
        if (
          rec.identity &&
          current &&
          (current.platform !== rec.identity.platform || current.platformLeagueId !== rec.identity.platformLeagueId)
        ) {
          outcome = "⚠️ Target changed since this was proposed — dismissed. Re-propose it.";
          await this.deps.store.delete(Notifier.COLLECTION, rec.id);
        } else {
          const r = await this.deps.perform(rec.leagueId, rec.kind, rec.payload, { override: verb === "ovr" });
          outcome = r.ok ? `✅ Executed — ${r.message}` : `⚠️ ${r.message}`;
          // Consume the durable record WHILE the claim is still held.
          await this.deps.store.delete(Notifier.COLLECTION, rec.id);
        }
      } catch (err) {
        // Ambiguous failure: retain the record (don't delete) so it isn't lost.
        outcome = `⚠️ Failed — ${(err as Error).message}`;
      } finally {
        this.inFlight.delete(rec.id);
      }
    }

    if (rec.chatMessageId != null) {
      await this.deps.telegram.editMessageText(this.deps.chatId, rec.chatMessageId, outcome).catch(() => {});
    }
    await this.deps.telegram.answerCallbackQuery(callbackQueryId);
  }

  /** Process one update (from webhook or long-poll); honors the allowed chat. */
  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const cq = update.callback_query;
    if (!cq?.data) return;
    // Require the callback to carry its originating message AND come from the
    // configured chat. A callback without a message can't be authorized against
    // the allowed chat, so it must not fall through and act (audit #11).
    if (!cq.message || String(cq.message.chat.id) !== String(this.deps.chatId)) {
      await this.deps.telegram.answerCallbackQuery(cq.id, "Unauthorized.").catch(() => {});
      return;
    }
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

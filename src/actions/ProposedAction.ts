import type { Platform, WritePayload } from "../adapters/LeagueAdapter.js";
import type { ActionKind, RuleVerdict } from "../rules/index.js";

/**
 * The lifecycle of a write action (dec.write-action-pipeline):
 *
 *  - `pending`    proposed, awaiting confirmation (nothing sent)
 *  - `executing`  claimed for execution and about to dispatch — a DURABLE claim
 *                 written before the platform call, so a crash/retry after the
 *                 send can't resend (audit #3)
 *  - `executed`   the platform accepted it (terminal, kept for reconciliation)
 *  - `failed`     the send errored ambiguously; NOT auto-resent (needs re-propose)
 *  - `rejected`   blocked by a rule, or its target changed after approval
 */
export type ActionStatus = "pending" | "executing" | "executed" | "failed" | "rejected";

/**
 * The immutable target an action was approved against (audit #5). The `leagueId`
 * on {@link ProposedAction} is a mutable config LABEL; if the user remaps that
 * label to a different platform/league, an old approval must NOT redirect to the
 * new target. Execution re-derives the current identity for the label and
 * refuses when it no longer matches this snapshot.
 */
export interface ActionIdentity {
  platform: Platform;
  /** The platform's own immutable league id (Sleeper/ESPN), captured at proposal. */
  platformLeagueId: string;
  /** The roster this action acts on (the actor), captured at proposal. */
  actorRosterId: number;
}

/**
 * A write action that has been proposed but — under confirm-by-default — not
 * necessarily sent. See {@link ActionStatus} for the lifecycle.
 */
export interface ProposedAction {
  id: string;
  /** The (mutable) config label the action was proposed under. */
  leagueId: string;
  kind: ActionKind;
  payload: WritePayload;
  status: ActionStatus;
  /** The rule engine's verdict at proposal time (re-checked at execution). */
  verdict: RuleVerdict;
  createdMs: number;
  /** Immutable target binding captured at proposal time (audit #5). */
  identity: ActionIdentity;
  /** Config revision at proposal time, for staleness reasoning (audit #5/#7). */
  configVersion?: number;
  /** Stable id for the execution attempt, assigned when the action is claimed. */
  executionId?: string;
  /** Populated once executed. */
  result?: { platformRef?: string; message: string };
}

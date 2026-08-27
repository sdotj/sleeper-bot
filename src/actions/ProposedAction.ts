import type { WritePayload } from "../adapters/LeagueAdapter.js";
import type { ActionKind, RuleVerdict } from "../rules/index.js";

export type ActionStatus = "pending" | "executed" | "rejected";

/**
 * A write action that has been proposed but — under confirm-by-default — not
 * necessarily sent. `pending` awaits confirmation, `executed` was sent,
 * `rejected` was blocked by a rule (dec.write-action-pipeline).
 */
export interface ProposedAction {
  id: string;
  leagueId: string;
  kind: ActionKind;
  payload: WritePayload;
  status: ActionStatus;
  /** The rule engine's verdict at proposal time (re-checked at execution). */
  verdict: RuleVerdict;
  createdMs: number;
  /** Populated once executed. */
  result?: { platformRef?: string; message: string };
}

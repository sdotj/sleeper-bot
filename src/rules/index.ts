/**
 * Rules engine — PHASE 2 STUB.
 *
 * In Phase 2, every proposed write action (trade, waiver claim, add/drop) is
 * evaluated against user-configured rules BEFORE it is shown for confirmation:
 *
 *   - block rules:  forbid an action (e.g. dropping a top-24 positional player)
 *   - warn rules:   flag an action (e.g. a trade with >20% value differential)
 *   - autoExecute:  opt-in, off by default — pre-approve an exact-match action
 *
 * Invariant: a rule may only ever *restrict* or (if explicitly opted in)
 * pre-approve what the human could already do manually. It never expands the
 * set of allowed actions. Nothing here is wired into the server yet.
 */

/** Placeholder result type for the Phase 2 evaluator. */
export interface RuleEvaluation {
  decision: "allow" | "warn" | "block";
  reasons: string[];
}

/** Phase 2 entrypoint — not yet implemented. */
export function evaluateAction(): RuleEvaluation {
  throw new Error("rules engine is not implemented until Phase 2");
}

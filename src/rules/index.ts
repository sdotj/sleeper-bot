/**
 * Rules engine — evaluates every proposed write action against user-configured
 * guardrails before it can be stored or executed (dec.rules-engine-and-value,
 * dec.write-action-pipeline).
 */
export {
  RulesEngine,
  type ActionKind,
  type RuleVerdict,
  type RuleContext,
} from "./engine.js";
export {
  loadRulesConfig,
  rulesConfigSchema,
  type RulesConfig,
  type ProtectRule,
  type WarnRule,
} from "./schema.js";

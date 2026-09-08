# Security audit remediation

Tracks the fixes for the findings in [`code-security-audit.md`](./code-security-audit.md)
(GPT‑6 Astra audit, Sept 7 2026). Every fix ships with regression tests and
passes the Cairn gate.

## Findings

| # | Severity | Finding | Status | Where |
|---|----------|---------|--------|-------|
| 1 | Critical | Percent-encoded paths bypassed the auth guard | ✅ Fixed | `gate/registerAuth.ts` — default-deny on decoded + matched route |
| 2 | High | Partially-configured gate ran open | ✅ Fixed | `gate/registerAuth.ts` — fail closed; `SLEEPBOT_REQUIRE_AUTH` |
| 3 | High | Chat could propose **and** execute in one turn | ✅ Fixed | `chat/tools.ts` — removed `execute_action`; sending is human-gated |
| 4 | High | A pending action could execute twice | ✅ Fixed | `actions/pipeline.ts`, `notify/notifier.ts` — in-process locks |
| 5 | High | Guardrails silently lost in the cloud | ✅ Fixed | `rules/schema.ts` — fail closed; `SLEEPBOT_RULES_JSON` seed |
| 6 | High | Postgres TLS didn't verify the server cert | ✅ Fixed | `audit/postgresStore.ts` — `resolvePgSsl`; `DATABASE_CA` |
| 7 | High | Login: unthrottled synchronous scrypt (DoS) | ✅ Fixed | `gate/credentials.ts` async + `gate/loginGuard.ts` |
| 8 | High | A failed write could be reported as executed | ✅ Fixed | `sleeperWriteClient.ts` + `pipeline.ts` check `result.ok` |
| 9 | Medium | Auto-executed actions labeled as drafts | ✅ Fixed | `core/operations.ts` — exhaustive `proposalOutcome` |
| 10 | Medium | No shared runtime validation at boundaries | ✅ Fixed | `actions/writeSchemas.ts` validated at the pipeline entry |
| 11 | Medium | Telegram callback auth/lifecycle gaps | ✅ Fixed | `notify/notifier.ts` — require message+chat, verb↔mode check |
| 12 | Medium | A corrupt local store was silently overwritten | ✅ Fixed | `audit/store.ts` — fail on corruption, atomic writes |
| 13 | Medium | Concurrent chat turns overwrote each other | ✅ Fixed | `chat/session.ts` — re-read before append |
| 14 | Medium | Settings/token stale in other instances | ✅ Mitigated | `core/context.ts` — versioned `refresh()` on write/sweep paths |
| 15 | Medium | Caches stayed failed/stale until restart | ✅ Fixed | value providers clear rejected builds; ESPN pool TTL + deadline |
| 16 | Medium | Frontend could mix leagues/conversations | ✅ Fixed | league-keyed views, `useAsync` resetKey, chat request tokens |
| 17 | Medium | Failures/data growth poorly bounded | ✅ Partly | agent failure counts + logs, webhook 500-on-fail, graceful shutdown |

### Notes on partial items

- **#14** — `refresh()` re-reads config + the Sleeper token when another instance
  bumped the stored version stamp, on every write and agent sweep. Read paths can
  still serve slightly stale data across instances; for now run a **single active
  manager instance**. Enabling the *first* agent-enabled league still needs a
  restart (the manager isn't started at boot when none are enabled).
- **#17** — database-side filtering/pagination and queryable summary/message
  tables are deferred; the current in-memory list/sort is fine at personal scale.
  The correctness pieces (no false success counts, webhook retries, graceful
  shutdown of the poll loop / HTTP server / DB pool) are done.

## Dependencies

- **`@fastify/jwt` 9 → 10** (fixed): removes the 3 critical + several high
  `fast-jwt` advisories in the production **auth** path. Compatible with our
  Fastify 5; all gate tests pass.
- **`qs`** (fixed) via `npm audit fix`.
- **Vitest / Vite / esbuild chain** (accepted, dev-only): the remaining root and
  frontend advisories live in the **test/build tooling**, which never ships in
  the production image (the container builds static web assets and the API bundle
  excludes devDependencies). The critical Vitest advisory requires its UI server
  listening; we run `vitest run`. Upgrading is a breaking major with no
  production exposure, so it's deferred rather than forced.

## Deferred (architecture, not vulnerabilities)

- One generated operation catalog shared by MCP/chat/agent/HTTP (the audit's
  structural recommendation); #10 validated the write path as the first step.
- Explicit read/write/draft capability flags on adapters so UIs/tools can omit
  unsupported operations (`EspnAdapter` currently throws for writes/drafts).

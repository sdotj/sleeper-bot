# Tasks: phase2-write-actions

Build order from `cairn frontier`: audit + value → auth → actions → rules → tools.

- [x] `sleepbot.audit`: Store interface + JSON-file impl + append-only audit log
- [x] `sleepbot.value`: ValueProvider interface + generic initial implementation
- [x] `sleepbot.auth`: SessionProvider, expiry detection, refresh, needs-reauth state
- [x] `sleepbot.actions`: ProposedAction model, pending store, execute pipeline
- [x] `sleepbot.rules`: rules.json schema, protect/warn evaluation, mode handling
- [x] `sleepbot.adapters.interface`: WriteableLeagueAdapter write methods
- [x] `sleepbot.adapters.sleeper`: write client wired to auth (endpoint send stubbed)
- [x] `sleepbot.tools`: propose_trade / propose_waiver_claim / propose_add_drop /
      execute_action / list_pending_actions
- [x] Tests for rules evaluation, pipeline (manual + auto), and audit records

## Remaining before this change can be applied (kept open on purpose)

- [ ] Wire Sleeper's private write endpoints in SleeperWriteClient (currently
      validated/stored/audited but the final send is stubbed)
- [ ] Capture + document a real session token flow (SLEEPER_SESSION_TOKEN)
- [ ] Backfill decision artefacts for the Phase-1 nodes so `cairn change accept`
      passes --strict (currently CAIRN_PROVENANCE_NO_DECISION warnings)

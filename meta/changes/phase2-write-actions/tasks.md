# Tasks: phase2-write-actions

Build order from `cairn frontier`: audit + value → auth → actions → rules → tools.

- [ ] `sleepbot.audit`: Store interface + JSON-file impl + append-only audit log
- [ ] `sleepbot.value`: ValueProvider interface + generic initial implementation
- [ ] `sleepbot.auth`: SessionProvider, expiry detection, refresh, needs-reauth state
- [ ] `sleepbot.actions`: ProposedAction model, pending store, execute pipeline
- [ ] `sleepbot.rules`: rules.json schema, protect/warn evaluation, mode handling
- [ ] `sleepbot.adapters.interface`: WriteableLeagueAdapter write methods
- [ ] `sleepbot.adapters.sleeper`: unofficial write client wired to auth
- [ ] `sleepbot.tools`: propose_trade / propose_waiver_claim / propose_add_drop /
      execute_action / list_pending_actions
- [ ] Tests for rules evaluation, pipeline (manual mode), and audit records

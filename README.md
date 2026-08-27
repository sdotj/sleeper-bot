# SleepBot

An MCP server that connects Claude to fantasy football leagues. **Phase 1**:
read-only tools over Sleeper's public API (no auth required). Built to extend to
write actions, ESPN, and multiple leagues without changing the tool interface.

## Architecture

The core is platform-agnostic. Every tool talks to a `LeagueAdapter` interface,
never to a platform SDK directly:

```
tools ──▶ LeagueAdapter (interface) ◀── SleeperAdapter ──▶ api.sleeper.app
  │                                       (EspnAdapter later)
  └──▶ config (leagues[] registry)
```

Adding a league or a platform is a **config change**, not a code change. The
architecture is mapped with [Cairn](https://github.com/cairn-framework/cairn) in
`cairn.blueprint`; run `cairn scan` to reconcile the map against the code.

## Setup

```bash
npm install
cp config/leagues.example.json config/leagues.json   # then edit with your league
npm run build
```

Find your Sleeper league id in the app URL or via
`https://api.sleeper.app/v1/user/<username>/leagues/nfl/<season>`.

### `config/leagues.json`

```jsonc
{
  "leagues": [
    {
      "id": "my-main-league",        // your own label, passed to every tool
      "platform": "sleeper",         // "sleeper" | "espn"
      "sleeper": { "leagueId": "123456789012345678", "username": "yourusername" }
    }
  ]
}
```

Secrets are never stored inline — a value like `"env:ESPN_S2"` is resolved from
the environment at runtime (see `.env.example`). Phase 1 needs no secrets.

## Run

```bash
npm start          # serves over stdio (built)
npm run dev        # serves over stdio (tsx, no build)
```

### Register with Claude Code

```jsonc
// .mcp.json / claude mcp add
{
  "mcpServers": {
    "sleepbot": { "command": "node", "args": ["dist/index.js"] }
  }
}
```

## Tools (Phase 1 — all read-only)

| Tool | Purpose |
|---|---|
| `list_leagues` | Configured leagues (from config, no API call) |
| `get_league_info` | Settings, scoring, season, roster positions |
| `get_rosters` | Every roster: starters, bench, IR (player names resolved), record |
| `get_my_roster` | Your own roster, identified from the configured `username` |
| `get_matchups` | Weekly matchups + scores (defaults to current week) |
| `get_standings` | Ranked by wins, then points-for |
| `get_transactions` | Trades, waivers, add/drops (defaults to current week) |
| `search_players` | Players by name, filter by position/team |
| `get_trending_players` | Sleeper's most-added / most-dropped |

Every tool takes your `leagueId` label, so multi-league support is just "pass a
different id." Set `sleeper.username` in config and rosters/standings/matchups
are flagged with `isYou`, so SleepBot knows which team is yours without asking.

## Tools (Phase 2 — write actions, confirm-by-default)

| Tool | Purpose |
|---|---|
| `propose_trade` | Draft a trade (runs rules); returns a draft, never sends |
| `propose_waiver_claim` | Draft a waiver claim (add/drop + FAAB); draft only |
| `propose_add_drop` | Draft a free-agent add/drop; draft only |
| `execute_action` | Send a previously-proposed action, by actionId (explicit confirm) |
| `list_pending_actions` | Drafts awaiting confirmation |

Nothing changes your league silently: a `propose_*` tool returns a **draft**;
`execute_action` is the explicit send. Guardrails live in `config/rules.json`
(copy `config/rules.example.json`):

```jsonc
{
  "mode": "manual",                 // "manual" = approve each; "auto" = send anything unblocked
  "protect": [                      // hard blocks
    { "playerName": "Ja'Marr Chase", "actions": ["trade", "drop"] }
  ],
  "warn": [                         // non-blocking flags
    { "type": "trade_value_diff", "thresholdPct": 20 }
  ]
}
```

**Sleeper writes are unofficial.** They use Sleeper's private app API and need a
session token (`SLEEPER_SESSION_TOKEN`) captured from a logged-in session — there
is no password automation. When a session can't be refreshed, writes pause, reads
keep working, and you're notified to supply a fresh token. Executing a real write
also needs the private endpoint integration (a tracked follow-up); proposals,
rules, and the audit log are fully functional today.

Run the tests with `npm test`.

## Roadmap

- **Phase 2 (built)** — write actions (confirm-by-default), rules engine, audit
  log, session handling. Remaining follow-up: wire Sleeper's private write
  endpoints and capture a session token.
- **Phase 3** — local GUI (Vite/React) over the same tools; surfaces the audit
  log ("what SleepBot did while I was away")
- **Phase 4** — `EspnAdapter` against ESPN's cookie-based API, same interface

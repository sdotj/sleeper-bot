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
| `get_auth_status` | Whether writes are authorized (`ok` / `needs-reauth`) + token expiry |

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

### Enabling writes (unofficial Sleeper API)

Sleeper has **no official write API**. Writes go through its private GraphQL
endpoint (`https://sleeper.com/graphql`), authenticated with a session **JWT** —
there is no password automation. To enable them:

1. Log in at [sleeper.com](https://sleeper.com) in a desktop browser.
2. DevTools → Network → filter `graphql` → click any request → copy the full
   `authorization` header value (a long `eyJ...` JWT).
3. Put it in `.env` as `SLEEPER_TOKEN=eyJ...` (never commit it; `.env` is ignored).

The token is a JWT, so SleepBot reads its expiry and reports `needs-reauth`
*before* attempting a doomed write. Check status any time with the
`get_auth_status` tool. When the token expires or is rejected, **writes pause,
reads keep working, and you're notified** to re-capture — no refresh endpoint
exists, so recovery is a manual re-capture by design. Some networks/regions may
need a **VPN** to reach the endpoint.

> Protocol reverse-engineered by the community
> ([cameron-eth/sleeper-sdk](https://github.com/cameron-eth/sleeper-sdk)); it is
> unofficial and may change without notice.

Run the tests with `npm test`.

## GUI (Phase 3)

A local React (Vite) app over a thin HTTP API that reuses the same core
operations as the MCP server. Screens: My Team, Standings, Matchups, the Audit
log, and a Chat panel (server-side Claude with the same tools).

```bash
npm run build && npm run api          # HTTP API on :8787 (reuses the core)
cd web && npm install && npm run dev  # GUI on :5173 (proxies /api -> :8787)
```

Then open http://localhost:5173. Secrets (`SLEEPER_TOKEN`, `ANTHROPIC_API_KEY`)
live on the server only; the browser never sees them. The Chat panel needs
`ANTHROPIC_API_KEY` — without it, chat returns a clear message and everything
else keeps working. In the cloud: run the `api` service, serve the built `web/`
statically, and point the `Store` at a hosted DB.

## Roadmap

- **Phase 2 (built)** — write actions (confirm-by-default) wired to Sleeper's
  private GraphQL API, rules engine, audit log, JWT session handling with
  fail-safe re-auth. Add `SLEEPER_TOKEN` to enable real sends.
- **Phase 3 (built)** — local GUI (Vite/React) + HTTP API + in-app Claude chat,
  all over the shared core. Surfaces the audit log ("what SleepBot did while I
  was away").
- **Phase 4** — `EspnAdapter` against ESPN's cookie-based API, same interface

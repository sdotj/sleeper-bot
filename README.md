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
| `get_rosters` | Every roster: starters, bench, IR, record |
| `get_matchups` | Weekly matchups + scores (defaults to current week) |
| `get_standings` | Ranked by wins, then points-for |
| `get_transactions` | Trades, waivers, add/drops (defaults to current week) |
| `search_players` | Players by name, filter by position/team |
| `get_trending_players` | Sleeper's most-added / most-dropped |

Every tool takes your `leagueId` label, so multi-league support is just "pass a
different id."

## Roadmap

- **Phase 2** — Sleeper write actions (confirm-by-default) + rules engine (`src/rules`, stubbed)
- **Phase 3** — local GUI (Vite/React) over the same tools
- **Phase 4** — `EspnAdapter` against ESPN's cookie-based API, same interface

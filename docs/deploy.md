# Deploying SleepBot

SleepBot ships as **one container**: the Fastify API serves the built React GUI
*and* the JSON API. State lives in **Postgres** (via `DATABASE_URL`); with no
`DATABASE_URL` it falls back to a local JSON file (fine for a laptop, not for
the cloud). Secrets are read from the environment — nothing sensitive is baked
into the image.

## What you provide (environment)

| Var | Required | What |
|---|---|---|
| `SLEEPBOT_CONFIG_JSON` | yes | Your leagues config as inline JSON (same shape as `config/leagues.example.json`). Replaces the `config/leagues.json` file in the cloud. |
| `DATABASE_URL` | yes (cloud) | Postgres connection string. Without it, state is a local JSON file (ephemeral in a container). |
| `ANTHROPIC_API_KEY` | for chat | Enables the chat/assistant. Without it, chat returns a clear message and everything else works. |
| `SLEEPER_TOKEN` | for writes | Session JWT for real trades/waivers/adds. Without it, writes fail safe (`needs-reauth`); reads/drafts work. |
| `ANTHROPIC_MODEL` | no | Defaults to `claude-opus-5`. |
| `SLEEPBOT_KTC_MODE` | no | `sf` (default) or `oqb` for 1‑QB leagues. |
| `HOST` / `PORT` | no | Default `0.0.0.0` / `8787` in the image. |
| `DATABASE_SSL` | no | `true`/`false` to force TLS on/off (default: on for remote hosts, off for localhost). |
| `TELEGRAM_BOT_TOKEN` | for agent | Bot token from @BotFather. Enables autonomous alerts + approve/deny/override. |
| `TELEGRAM_CHAT_ID` | for agent | Your chat id (from @userinfobot). Only taps from this chat are honored. |
| `SLEEPBOT_AGENT_INTERVAL_MIN` | no | Minutes between autonomous sweeps (default 360). |

The **autonomous manager** runs only for leagues with an `agent` block in their
config *and* when `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` + `ANTHROPIC_API_KEY`
are all set — otherwise it stays off and logs why. It needs an **always-on**
instance (`min_machines_running = 1`). `POST /api/agent/sweep` triggers a sweep
on demand.

The `SLEEPER_TOKEN` is a JWT and **expires** — a 24/7 deploy will periodically
hit `needs-reauth` and pause writes (reads keep working). Re-supply a fresh
token via a secret update. (The upcoming Telegram integration will notify you
when this happens.)

## Build & run locally (dry run)

```bash
docker build -t sleepbot .
docker run --rm -p 8787:8787 \
  -e SLEEPBOT_CONFIG_JSON="$(cat config/leagues.json)" \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  sleepbot
# open http://localhost:8787  (GUI + API from one process)
```

(No `DATABASE_URL` here means state is in-container and lost on exit — fine for a
smoke test.)

## Deploy to Fly.io (concrete path)

```bash
fly launch --no-deploy            # creates a fly.toml (see snippet below)
fly postgres create               # managed Postgres
fly postgres attach <pg-app>      # sets DATABASE_URL as a secret automatically
fly secrets set \
  ANTHROPIC_API_KEY=sk-ant-... \
  SLEEPER_TOKEN=eyJ... \
  SLEEPBOT_KTC_MODE=oqb \
  SLEEPBOT_CONFIG_JSON='{"leagues":[{"id":"my-main-league","platform":"sleeper","sleeper":{"leagueId":"...","username":"..."}}]}'
fly deploy
```

Minimal `fly.toml`:

```toml
app = "sleepbot"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8787
  force_https = true
  auto_stop_machines = false   # keep it always-on for the (coming) autonomous loop
  auto_start_machines = true
  min_machines_running = 1

[[http_service.checks]]
  path = "/api/health"
  interval = "15s"
  timeout = "2s"
```

## Any other Docker host

Build and push the image to your registry, provision a managed Postgres
(Neon / Supabase / RDS / …), and run the container with the env vars above. The
only hard requirements are a reachable Postgres and the container's port exposed.

## Notes

- **Always-on:** keep at least one instance running (`min_machines_running = 1`)
  — the autonomous manager (next feature) needs a persistent process.
- **Scaling:** the API is stateless beyond Postgres, so you can run multiple
  instances behind the load balancer; the JSON-file store is single-instance only.
- **Health check:** `GET /api/health` returns `{ "ok": true }`.

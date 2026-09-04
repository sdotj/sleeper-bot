# Deploying SleepBot

SleepBot ships as **one container**: the Fastify API serves the built React GUI
*and* the JSON API. State lives in **Postgres** (via `DATABASE_URL`); with no
`DATABASE_URL` it falls back to a local JSON file (fine for a laptop, not for
the cloud). Secrets are read from the environment — nothing sensitive is baked
into the image.

## What you provide (environment)

| Var | Required | What |
|---|---|---|
| `SLEEPBOT_CONFIG_JSON` | yes (first boot) | Your leagues config as inline JSON (same shape as `config/leagues.example.json`). **Seed only:** on first boot it's copied into the DB, after which the DB is authoritative and the Settings panel edits it — a later change to this var is ignored unless you hit "Reset to env config". |
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
| `SLEEPBOT_AUTH_USER` | **for public deploy** | Login username. The login gate is enforced only when this + the two below are all set. |
| `SLEEPBOT_AUTH_PASSWORD_HASH` | **for public deploy** | scrypt hash of the password — run `npm run hash-password -- '<pw>'`. The raw password is never stored. |
| `SLEEPBOT_JWT_SECRET` | **for public deploy** | Long random string signing login tokens. Rotating it logs everyone out. |
| `SLEEPBOT_AUTH_TTL` | no | Login lifetime, jsonwebtoken format (default `7d`). |
| `SLEEPBOT_SECRET_KEY` | for UI secrets | 32-byte key (`npm run gen-secret-key`) that encrypts the Sleeper token when you set it from the Settings panel. Unset ⇒ that field is read-only and `SLEEPER_TOKEN` (env) is used. |

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

## Google Cloud Run (scale-to-zero, ~$0)

Cloud Run scales to zero, so run the agent in **webhook + external-cron** mode
(no always-on instance, no CPU-always-allocated bill):

- Telegram taps POST to `/internal/telegram` (waking the service from zero).
- **Cloud Scheduler** (free tier: 3 jobs) POSTs `/internal/sweep` on a cron.

Both `/internal/*` routes require `SLEEPBOT_INTERNAL_SECRET`. The service must be
`--allow-unauthenticated` (Telegram webhooks can't send Google OIDC), so those
routes are protected by that app secret instead. The GUI + `/api/*` are protected
by the **login gate** — set `SLEEPBOT_AUTH_USER` / `SLEEPBOT_AUTH_PASSWORD_HASH` /
`SLEEPBOT_JWT_SECRET` (below) before you expose the service.

```bash
# 1. Put secrets in Secret Manager (incl. SLEEPBOT_CONFIG_JSON — avoids
#    comma-escaping in --set-env-vars, and DATABASE_URL from Cloud SQL/Neon):
printf '%s' "$ANTHROPIC_API_KEY" | gcloud secrets create anthropic-key --data-file=-
# ...repeat for sleeper-token, tg-bot-token, database-url, internal-secret, config-json
# Login gate: hash the password locally, then store the hash + JWT secret.
# NOTE: use `npm run --silent` when piping — a bare `npm run` prepends its own
# banner lines to the pipe, which would corrupt the stored value.
npm run --silent hash-password -- 'your-password' | tr -d '\n' | gcloud secrets create auth-hash --data-file=-
printf '%s' "$(openssl rand -hex 32)" | gcloud secrets create jwt-secret --data-file=-
# Secret-storage key (lets the Settings panel store your Sleeper token encrypted).
# openssl avoids any npm-banner noise; the value must be exactly 64 hex chars.
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create secret-key --data-file=-

# 2. First deploy (URL is only known after this):
gcloud run deploy sleepbot --source . --region us-central1 --allow-unauthenticated \
  --set-secrets ANTHROPIC_API_KEY=anthropic-key:latest,TELEGRAM_BOT_TOKEN=tg-bot-token:latest,DATABASE_URL=database-url:latest,SLEEPBOT_INTERNAL_SECRET=internal-secret:latest,SLEEPBOT_CONFIG_JSON=config-json:latest,SLEEPBOT_AUTH_PASSWORD_HASH=auth-hash:latest,SLEEPBOT_JWT_SECRET=jwt-secret:latest,SLEEPBOT_SECRET_KEY=secret-key:latest \
  --set-env-vars TELEGRAM_CHAT_ID=123456789,SLEEPBOT_KTC_MODE=oqb,SLEEPBOT_AUTH_USER=sam

# 3. Re-deploy with the now-known URL so the agent registers its webhook:
gcloud run services update sleepbot --region us-central1 \
  --update-env-vars SLEEPBOT_PUBLIC_URL=https://sleepbot-xxxx.run.app

# 4. Cron the sweep (every 6h) — Bearer secret matches SLEEPBOT_INTERNAL_SECRET:
gcloud scheduler jobs create http sleepbot-sweep --location us-central1 \
  --schedule="0 */6 * * *" --http-method=POST \
  --uri="https://sleepbot-xxxx.run.app/internal/sweep" \
  --headers="Authorization=Bearer <SLEEPBOT_INTERNAL_SECRET>"
```

Leave `min-instances` at 0 and CPU throttling on (the defaults) — the webhook
and cron wake the service on demand. `SLEEPER_TOKEN` (writes) can be added as a
secret whenever you're ready.

> ⚠️ `--allow-unauthenticated` makes the service reachable by anyone with the
> URL. The **login gate** closes this: with `SLEEPBOT_AUTH_USER` /
> `SLEEPBOT_AUTH_PASSWORD_HASH` / `SLEEPBOT_JWT_SECRET` set, every `/api/*` route
> and the GUI require a login token, so the chat endpoint (which spends your
> Anthropic budget) is protected. Verify after deploy: `curl <URL>/api/leagues`
> should return `401 {"code":"auth_required"}`. (`/internal/*` stay gated by
> `SLEEPBOT_INTERNAL_SECRET`, a separate secret.) IAP is still an option if you'd
> rather not expose a login page at all.

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

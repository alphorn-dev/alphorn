<div align="center">

# Alphorn

**Self-hostable notification router for developers and ops teams.**

Receive webhooks, route messages to 20+ channels, filter with a powerful rule DSL.

[![License: AGPL-3.0-or-later](https://img.shields.io/badge/License-AGPL--3.0--or--later-teal.svg)](./LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![PostgreSQL 18](https://img.shields.io/badge/PostgreSQL-18-336791.svg)](https://www.postgresql.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org)

</div>

---

Alphorn is an open source notification router. Point any service that can send a webhook at Alphorn, and it will fan the message out to Slack, Discord, Telegram, Email, PagerDuty, Opsgenie, and multiple other destinations — with filtering, retries, rate limits, and delivery history built in.

Think of it as a self-hosted alternative to commercial notification hubs, built on a boring, scalable stack (PostgreSQL + Next.js + pg-boss) that you can run yourself.

## Features

- **20+ delivery channels** — Slack, Discord, Microsoft Teams, Telegram, Mattermost, Rocket.Chat, Google Chat, Zulip, Matrix, ntfy, Gotify, Pushover, PagerDuty, Opsgenie, Twilio SMS, Vonage SMS, SMTP, SendGrid, Mailgun, generic Webhook, SSE, and more.
- **Powerful filter DSL** — route messages by priority, tags, title, body, or payload fields. Regex supported (safely).
- **Reliable delivery** — pg-boss queue with retries (5 attempts, exponential backoff), permanent vs. transient error handling, 7-day job retention.
- **Real-time streaming** — SSE endpoint for live event feeds. Dedicated SSE server for horizontally scaled deployments.
- **Multi-tenant** — Better Auth with organizations, invitations, roles, and two-factor (TOTP).
- **Optional billing** — Paddle integration with plan gating if you want to run Alphorn as a service.
- **Horizontally scalable**: stateless web, standalone workers, all shared state in Postgres. No local state.
- **Observable** — structured Pino logs and Sentry integration out of the box.
- **Self-hostable first** — one `docker compose up` away. No cloud lock-in, no mandatory external services.

## Quick start

### Docker Compose (recommended)

```bash
git clone https://github.com/alphorn-dev/alphorn.git
cd alphorn
cp .env.example .env
# edit .env — at minimum set BETTER_AUTH_SECRET
docker compose up -d
```

Open <http://localhost:3000> and create your first account.

### Local development

Requirements: Node.js 22.12+, pnpm, PostgreSQL 18.

```bash
pnpm install
cp .env.example .env
pnpm db:deploy
pnpm dev
```

optional: you can run one or multiple workers via:

```bash
pnpm dev:worker

# or build and run worker with defined concurrency
# pnpm build:worker && WORKER_CONCURRENCY=50 node --env-file=.env worker.mjs
```

## Architecture

```
┌────────────┐       ┌──────────────┐       ┌────────────────┐
│  Webhook   │─────▶│   Alphorn    │─────▶│  pg-boss queue │
│  producer  │       │ (Next.js 16) │       │  (PostgreSQL)  │
└────────────┘       └──────────────┘       └────────┬───────┘
                                                     │
                                             ┌───────▼────────┐
                                             │ Delivery worker│
                                             └───────┬────────┘
                                                     │
                ┌────────────┬────────────┬──────────┼──────────┬────────────┐
                ▼            ▼            ▼          ▼          ▼            ▼
             Slack       Discord      Telegram    Email    PagerDuty    ... 19 more
```

- **`src/proxy.ts`** — auth routing.
- **`src/channels/`** — plugin registry. Each channel is a `ChannelHandler` with a Zod config schema and `send()` method.
- **`src/worker/`** — pg-boss-backed delivery worker. Runs embedded (`MODE=all`) or standalone (`MODE=worker`).
- **`src/lib/filter/`** — Zod discriminated-union filter DSL with safe regex.
- **`src/lib/sse/`** — in-memory SSE registry. For multi-instance deployments, use the standalone `pnpm sse-server`.

See [`AGENTS.md`](./AGENTS.md) for the full architecture and conventions reference.

## Runtime modes

`MODE` environment variable controls what each process runs:

| Mode            | Description                                                              |
| --------------- | ------------------------------------------------------------------------ |
| `all` (default) | Web server + embedded worker. Good for single-instance deployments.      |
| `web`           | Web server only. Use when running workers separately.                    |
| `worker`        | Standalone delivery worker. Scale horizontally behind a shared Postgres. |

For horizontally scaled SSE, run `pnpm sse-server` with `SSE_MODE=standalone` and a shared `SSE_INTERNAL_SECRET`.

## Configuration

All configuration is via environment variables. Copy `.env.example` to `.env`: it is the source of truth and documents every option, including optional integrations (OAuth, SMTP, Sentry).

**Minimum required:**

| Variable             | Description                                             |
| -------------------- | ------------------------------------------------------- |
| `DATABASE_URL`       | PostgreSQL connection string                            |
| `BETTER_AUTH_SECRET` | Random secret — generate with `openssl rand -base64 32` |
| `BETTER_AUTH_URL`    | Public URL of your instance                             |

## Testing

```bash
pnpm test             # all tests
pnpm test:unit        # pure logic
pnpm test:integration # hits a real Postgres
```

Unit tests cover the filter DSL, billing math, and channel config parsing. Integration tests exercise Prisma, pg-boss, and route handlers against a real database.

## Contributing

Contributions are welcome. Before opening a PR:

1. Read [`AGENTS.md`](./AGENTS.md) — it documents the stack, conventions, and design principles.
2. Run `pnpm lint` and `pnpm test`.
3. Keep changes focused; new business logic (channels, filters, billing, routing) should come with tests.

For new channels, implement the `ChannelHandler` interface in `src/channels/` and register it in `registry.ts`. Throw on failure so pg-boss can retry — distinguish permanent vs. transient errors.

## License

Alphorn is **dual-licensed**: free under
[AGPL-3.0-or-later](./LICENSE) for the community, and available under a
commercial license for companies that cannot comply with AGPL terms.

**AGPL-3.0-or-later (free):**

- Self-host Alphorn for free — personal, internal business, non-profit,
  or commercial use.
- Read, modify, and redistribute the source code.
- If you run a modified version as a network service, you must publish
  your modifications under AGPL-3.0-or-later.
- AGPL-3.0 is [OSI-approved open source](https://opensource.org/license/agpl-v3).

**Commercial license (paid):**

If your organization cannot accept AGPL terms — for example, you need to
integrate Alphorn into a proprietary product or your legal policy prohibits
AGPL — a commercial license is available. Contact
<hello@alphorn.dev>.

The AGPL and commercial licenses cover copyright in the source code. They
do not grant rights to use the Alphorn name, logo, or confusingly similar
branding for unofficial products or hosted services. See
[`NOTICE`](./NOTICE) for the project license notice,
[`TRADEMARK.md`](./TRADEMARK.md) for the trademark policy, and
[`CONTRIBUTING.md`](./CONTRIBUTING.md) for contributor license terms.

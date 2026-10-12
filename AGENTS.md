# Alphorn

Self-hostable notification router. Receives webhooks, routes messages to 21+ channels (Slack, Discord, Email, Telegram, etc.) with filtering rules.

## Stack

- **Runtime**: Node.js 20.9+ (Next.js 16 requirement, CI uses Node 22). Package manager: **pnpm** only. Do not use npm or yarn, the lockfile is `pnpm-lock.yaml`.
- **Framework**: Next.js 16 (App Router), React 19, TypeScript 5
- **UI**: shadcn/ui (base-nova style), Tailwind CSS 4, Lucide icons
- **Auth**: Better Auth with organization + two-factor plugins. Social/OIDC login providers (GitHub, Google, Microsoft, generic OIDC) are env-driven in `src/lib/auth/providers.ts`.
- **Database**: PostgreSQL 18 with Prisma 7. The client is generated to `src/generated/prisma`: import `prisma` from `@/lib/db` (or types from `@/generated/prisma/client`), **never from `@prisma/client`**.
- **Jobs**: pg-boss (PostgreSQL-backed queue) for delivery retries. Policy in `src/worker/index.ts`: 5 retries, 30s delay with backoff, 5min timeout, completed jobs purged after 7 days, unstarted jobs dropped after 14 days. `src/worker/sweep.ts` re-enqueues stuck or undelivered deliveries; keep its thresholds consistent with the pg-boss timings.
- **Streaming**: Custom SSE implementation for real-time updates
- **Billing**: Paddle (`@paddle/paddle-node-sdk`). Plans in `src/lib/billing/plans.ts`, Zod-validated env in `src/lib/billing/env.ts`.
- **Email**: Nodemailer (SMTP) for verification, password reset, invites. SMTP is optional: if unconfigured, users can sign up unverified.
- **Observability**: Pino + Sentry (`@sentry/nextjs`) with custom `onRequestError`. See the logger convention below.
- **Testing**: Vitest with three projects: `unit` (`tests/unit/`, plus co-located `__tests__/`), `integration` (`tests/integration/*.test.ts`), and `integration-db` (`tests/integration/db/*.test.ts`, hits real Postgres, runs serially, refuses any database whose name doesn't contain `test` or `integration`). Scripts: `pnpm test`, `test:unit`, `test:integration`, `test:integration-db`, `test:watch`. **Unit tests** for pure logic (filter DSL, billing math, channel config parsing): mock external I/O freely. **Integration tests** for anything touching Prisma, pg-boss, or route handlers: hit a real test database, do not mock Prisma. Never mock Paddle, SMTP, or channel HTTP targets at the unit level; test the adapter boundary instead. New business logic (filters, billing, channels, webhook routing) requires tests; UI and one-off scripts do not.
- **Charts**: Recharts. Do not add chart.js / visx / victory.
- **Dates**: date-fns v4. Do not add dayjs / moment / luxon.
- **2FA**: `qrcode.react` for TOTP QR display.

## Design Principles

- **Scalable**: Multiple web instances and worker instances can run in parallel behind a load balancer. All shared state lives in PostgreSQL or S3-compatible storage, never local filesystem or in-process memory that can't be shared across instances.
- **Self-hostable**: Must remain easy to self-host. Minimize external dependencies. Use standard, well-supported infrastructure (Postgres, S3-compatible storage) that users can run themselves (e.g., MinIO for S3).
- **Hosted vs self-hosted**: `isHostedAlphorn()` (`src/lib/is-hosted.ts`) distinguishes app.alphorn.dev from self-hosted installs. Billing, plan limits, and per-plan retention only apply when hosted; self-hosted installs have no billing and the retention sweep is disabled. Gate SaaS-only behavior on this check.

## Security boundaries handled outside the app

- **SSRF on outbound channel URLs** (generic webhook, Mattermost, Rocket.Chat, Matrix, Zulip, Gotify, ntfy, Google Chat, Teams, etc.) is handled by a [smokescreen](https://github.com/stripe/smokescreen) egress proxy at the infrastructure layer. The app does not (and should not) add DNS resolution / RFC1918 filtering in channel `send()`. Do not re-flag this in reviews.
- The proxy is wired via `EGRESS_PROXY_URL`, which installs a global undici dispatcher (`src/lib/http/egress.ts`). **Do not create custom HTTP agents/dispatchers in channels**: they would bypass the proxy.

## Architecture

- `src/proxy.ts` is used **instead of** `middleware.ts` for auth routing. Public paths and matcher exclusions are defined there.
- `src/channels/`: plugin-based channel registry. Each channel is two files: `<name>.ts` implements `ChannelHandler` (Zod config schema + `send()`) and is registered in `registry.ts`; `<name>.meta.ts` holds client-safe metadata and is registered in `meta.ts`. **A new channel needs both.**
- **Channel error contract**: `send()` must `throw` on failure so pg-boss retries the job; never swallow errors and return success. Throw `PermanentChannelError` (`src/channels/errors.ts`) for *permanent* failures (invalid config, 4xx auth) to short-circuit retries; plain errors are treated as *transient* (5xx, timeouts). Use `throwIfNotOk()` for HTTP responses.
- `src/worker/`: background delivery worker. Runs separately via `MODE=worker` or together with web (`MODE=all`).
- `src/lib/sse/`: in-memory SSE connection registry for real-time streaming.
- `src/app/api/auth/[...all]`: Better Auth catch-all handler.
- `src/app/n/[publicId]`: public webhook receiver endpoint.
- `src/lib/filter/`: filter DSL. Zod discriminated unions over conditions (priority, tags, title, message, payload) with regex support via `safe-regex2`.
- `src/lib/webhook-extract/`: heuristic + template extraction of title/message/priority from arbitrary webhook payloads.
- `src/lib/webhook-loop/`: loop detection (same-host hop counting) to prevent webhook cycles.
- `src/lib/webhook-cache.ts`: per-instance cache of webhook configs for the hot receiver path. Kept coherent across instances by Postgres triggers that `NOTIFY alphorn_cache_invalidate` (defined in migration SQL), with a 30s TTL as fallback. Writes to cached tables invalidate automatically; do not add a parallel invalidation mechanism.
- **Runtime modes**: `MODE=all|web|worker` selects embedded worker vs. standalone. For horizontally scaled SSE, run a dedicated SSE server (`pnpm sse-server`, `src/sse-server/`) with `SSE_MODE=standalone` and `SSE_INTERNAL_SECRET` shared across instances.
- **Worker build**: bundled with esbuild to `worker.mjs` (`pnpm build:worker`), dev via `pnpm dev:worker`.
- **next.config.ts**: `output: "standalone"`, security headers (nosniff, DENY frame, HSTS), `serverExternalPackages` for `pg-boss`, `pg`, `nodemailer`, Paddle. Sentry source maps disabled in production.

## Public URLs

Hosted at **alphorn.dev**. Legal docs and user-facing marketing/docs content live there, not in-repo. Reference these from the app (sign-in/sign-up link to `/terms` and `/privacy` on alphorn.dev).

- `https://alphorn.dev`: marketing site
- `https://app.alphorn.dev`: hosted app
- `https://docs.alphorn.dev`: user documentation
- `https://github.com/alphorn-dev/alphorn`: source repo (GitHub org: `alphorn-dev`)
- `https://alphorn.dev/terms`: Terms of Service
- `https://alphorn.dev/privacy`: Privacy Policy
- `https://alphorn.dev/dpa`: Data Processing Agreement
- `https://alphorn.dev/imprint`: legal imprint

## Conventions

- **Always use shadcn/ui components** from `@/components/ui/`. Add new ones via `npx shadcn@latest add <component>`.
- **Icons**: Use Lucide (`lucide-react`). Do not add other icon libraries.
- **Styling**: Tailwind utility classes only. No CSS modules, no styled-components.
- **Colors**: Primary/ring/sidebar-primary is teal: `oklch(0.55 0.14 175)` light / `oklch(0.72 0.14 175)` dark (OKLCH hue 175). Semantic colors: `success`, `warning`, `info`, `destructive`. Use CSS variables, not hardcoded values.
- **Fonts**: Inter (sans), JetBrains Mono (mono). Loaded via `next/font/google`.
- **Dark mode**: Supported via `next-themes`. Use Tailwind `dark:` variant. Colors are defined as CSS variables in `globals.css`.
- **Brand**: Always write "Alphorn" (never "ALPHORN", "AlpHorn", or lowercase in prose). See `docs/brand.md`.
- **Server Actions**: Co-located in app directories with `"use server"`. **Always start with an auth helper** from `src/lib/auth/server.ts`, the strictest that applies: `requireAdminOrOwner()` for mutations of org-scoped data (webhooks, channels, settings, billing), `requireOrgSession()` for reads of org data, `requireSession()` for user-only actions (profile, invitations). Never use `getSession()` for access checks: `requireSession()` also enforces the 2FA policy.
- **Client Components**: Use `"use client"` only when needed (interactivity, hooks). Default to Server Components.
- **State**: React hooks + Next.js patterns. No external state library (no Redux/Zustand).
- **Toasts**: Use Sonner (`toast` from `sonner`). For error toasts use `showError(err, fallback)` from `@/lib/toast-error`.
- **Date display**: Use the helpers in `@/lib/format-date` (`formatDateTime`, `formatDate`, `formatShortDate`, `formatChartDate`). Do not call date-fns `format` directly in components.
- **Untrusted payload paths**: Resolve dotted paths into webhook payloads with `resolvePath` from `@/lib/safe-path` (blocks prototype keys). Do not hand-roll path walking.
- **Forms**: React hooks with controlled inputs. Zod for validation.
- **Path alias**: `@/*` maps to `src/*`.
- **Linting**: ESLint 9 flat config (`eslint.config.mjs`) extending `eslint-config-next` core-web-vitals + TypeScript.
- **Before reporting done**: run `pnpm lint && pnpm typecheck` and the relevant test project(s). CI runs all of them.
- **Logging**: Use `logger` from `@/lib/logger`, never `console.log`/`console.error` in app code. It forwards structured context to Pino + Sentry. **Never log secrets or PII**: no channel credentials, webhook tokens, Paddle API keys, SMTP passwords, session tokens, raw webhook payloads, email addresses, or message bodies. Log identifiers (user id, org id, channel id, public id) instead. When in doubt, log less.
- **Error handling**: Validate strictly at I/O boundaries (webhook receivers, server actions, channel `send()` inputs, env parsing) using Zod. Inside those boundaries, trust your types; do not add defensive `try/catch` or null checks for states TypeScript already rules out.
- **i18n**: UI is English-only for now. Do not introduce an i18n framework or translation files without discussion.
- **Environment variables**: Any new env var must be added to `.env.example` with a sensible default or placeholder and a short comment. Self-hosters rely on this file as the source of truth for configuration. **Exception**: hosted-only billing vars (`PADDLE_*`) are intentionally kept out of `.env.example`; do not add them.
- **DB scripts**: `pnpm db:generate | db:push | db:migrate | db:deploy | db:studio | db:reset | db:seed`. Retention runs inside the worker (`src/worker/retention.ts`); there is no standalone retention script. **Use `db:migrate` in development** to create a new migration from schema changes (writes a SQL file under `prisma/migrations/`). **Use `db:deploy` in production / CI / Docker entrypoint** to apply existing migrations without generating new ones. **Never run `db:push`** against shared or production databases: it skips migration history. Always commit the generated migration folder alongside the `schema.prisma` change. If `main` gained migrations meanwhile, pull them and run `db:migrate` again so yours is ordered after them; never edit an already-merged migration.
- **Migration drift**: CI runs `scripts/check-migration-drift.sh`. Anything Prisma can express (including GIN/trgm indexes via `ops: raw(...)`) must be declared in `schema.prisma`, or the next `migrate dev` emits a DROP for it. Indexes Prisma can't express (e.g. partial indexes) live only in migration SQL **and** must be added to the script's allow-list. Triggers/functions are invisible to Prisma and need no allow-list entry.
- **Deployment**: Docker with standalone output. `docker-entrypoint.sh` runs migrations on startup.

# Basic Behaviour

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Don'ts

- No em dashes (—) in anything you write. Use a hyphen (-), comma, colon, or parentheses instead.
- No filler or pleasantries ("Great question!", "You're absolutely right"). Keep answers short and precise.
- No git commands or commits unless explicitly asked. The user handles git.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

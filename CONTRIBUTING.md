# Contributing to Alphorn

Thanks for your interest in contributing! This document covers the basics.

## Before you start

- Read [`AGENTS.md`](./AGENTS.md) — it documents the stack, architecture,
  conventions, and design principles.
- For non-trivial changes, open an issue first to discuss the approach.

## Contribution policy

Contributions are welcome, but Alphorn is currently maintained with limited
review capacity. To keep the project focused and maintainable, we may decline
or close pull requests that are large, speculative, outside the project roadmap,
or not discussed in advance.

Before opening a non-trivial pull request, please open an issue describing the
problem, the proposed approach, and the expected user impact. Small fixes such
as typo corrections, documentation improvements, focused bug fixes, and clearly
scoped tests are welcome without prior discussion.

Please do not submit AI-generated or bulk mechanical changes unless you have
personally reviewed, tested, and are prepared to maintain the result. The author
of a pull request is responsible for the quality, correctness, licensing, and
long-term maintainability of the contribution.

## Development setup

Requirements: Node.js 20.9+, pnpm, PostgreSQL 18.

```bash
pnpm install
cp .env.example .env
pnpm db:deploy
pnpm dev
```

## Before submitting a PR

1. `pnpm lint` — must pass.
2. `pnpm test` — must pass.
3. New business logic (channels, filters, billing, webhook routing) should
   come with tests. UI and one-off scripts don't require tests.
4. Keep changes focused. Don't bundle unrelated refactors into a feature PR.
5. Match existing code style and conventions.

## Contributor License Agreement (CLA)

Alphorn is dual-licensed: AGPL-3.0-or-later for the community and a
commercial license for companies that cannot accept AGPL terms. For this
model to work, Armin Reiter needs the right to offer your contribution under
both licenses.

By submitting a pull request, you agree that:

1. You wrote the contribution yourself, or you have the right to submit it
   under the project's license.
2. You grant Armin Reiter a perpetual, worldwide, non-exclusive, royalty-free,
   irrevocable license to use, reproduce, modify, distribute, sublicense, and
   **relicense** your contribution under any license he chooses — including
   AGPL-3.0-or-later, a commercial license, or any future license the project
   adopts.
3. You retain copyright of your contribution.

We may add an automated CLA bot in the future. Until then, opening a pull
request against this repository constitutes your agreement to the terms
above.

## Reporting security issues

Please do **not** open public issues for security vulnerabilities. Email
<hello@alphorn.dev> with details. See [`SECURITY.md`](./SECURITY.md) once
published for the full disclosure policy.

## License

Contributions are submitted under the [AGPL-3.0-or-later](./LICENSE)
license that covers the rest of the project, plus the additional relicensing
grant described in the CLA section above.

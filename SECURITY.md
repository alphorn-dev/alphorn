# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Alphorn, please report it
privately. **Do not open a public GitHub issue.**

Email **<hello@alphorn.dev>** with:

- A description of the issue and its impact.
- Steps to reproduce, or a proof-of-concept.
- The affected version(s) and/or commit hash.
- Any suggested mitigation, if you have one.

You can expect an initial acknowledgement within 5 business days. We will
keep you informed about progress toward a fix and coordinate disclosure
timing with you.

## Supported Versions

Alphorn is under active development. Security fixes are applied to the
`main` branch and the latest tagged release. Older releases are not
maintained — please upgrade to receive security fixes.

## Scope

In scope:

- The Alphorn web application, worker, and SSE server in this repository.
- Default Docker images published from this repository.

Out of scope:

- Vulnerabilities in third-party channel providers (Slack, Discord,
  Telegram, etc.). Report those to the respective vendors.
- Issues that require a misconfigured self-hosted deployment (e.g.
  exposing the database directly to the internet).
- Denial-of-service via unrealistic traffic volumes against a
  self-hosted instance.

## Safe Harbor

We will not pursue legal action against researchers who:

- Make a good-faith effort to avoid privacy violations, data destruction,
  and service disruption.
- Report vulnerabilities promptly and privately.
- Give us reasonable time to fix the issue before public disclosure.

Thank you for helping keep Alphorn and its users safe.

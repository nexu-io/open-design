# Tasks: Fix Docker Environment Documentation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 80–150 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Fix env template, update README with auth/proxy/troubleshooting, verify | PR 1 | Single PR; docs-only, no code changed |

## Phase 1: Fix `.env.example`

- [x] 1.1 Rename `OD_API_TOKEN` → `OD_ACCESS_TOKEN` on lines 16, 22, 29. Add deprecation note: "`OD_API_TOKEN` is still accepted as a deprecated fallback on the server."
- [x] 1.2 Add `OD_TRUSTED_PROXY=` with a doc comment: set to `cloudflare` for Cloudflare Access JWT validation, or appropriate value for other trusted reverse proxies ahead of the daemon.
- [x] 1.3 Uncomment `OD_CF_ACCESS_TEAM_DOMAIN=` and `OD_CF_ACCESS_AUD=` so they are active in the template, not hidden behind `#`. Clarify mutual exclusivity with the token option.

## Phase 2: Update `deploy/README.md`

- [x] 2.1 Replace every `OD_API_TOKEN` reference with `OD_ACCESS_TOKEN` (lines 23, 146, 148). Update the Docker Desktop troubleshooting error message to match the canonical name.
- [x] 2.2 Add an "Authentication modes" section before the local-compose steps. Explain token mode (simplest, loopback-exempt), trusted-proxy mode (`OD_TRUSTED_PROXY`), and Cloudflare Access mode (JWT, loopback NOT exempt). State mutual exclusivity.
- [x] 2.3 Add a "Reverse proxy" section with nginx and Caddy examples showing required forwarded headers (`X-Forwarded-For`, `X-Forwarded-Proto`, `X-Forwarded-Host`). Include `OPEN_DESIGN_ALLOWED_ORIGINS` configuration. Note that CSP is handled by the daemon, not the proxy.
- [x] 2.4 Add a "Troubleshooting" section: (a) Missing access token — verify `OD_ACCESS_TOKEN` set + `Authorization: Bearer <token>` header; (b) `Origin: null` — expected from sandboxed iframes, not a Docker regression; (c) Docker Desktop macOS networking — host networking workaround with `network_mode: host`.

## Phase 3: Verify

- [x] 3.1 Search `deploy/` for stale `OD_API_TOKEN` references; confirm only the intentional deprecation note remains.
- [x] 3.2 Cross-check `.env.example` and `README.md` against acceptance criteria in `spec.md`: canonical token, Cloudflare vars, trusted proxy, auth overview, proxy examples, troubleshooting entries.
- [x] 3.3 Read `deploy/README.md` end-to-end as a first-time Docker user; verify the flow is copy-pasteable and no deprecated variable confuses the reader.

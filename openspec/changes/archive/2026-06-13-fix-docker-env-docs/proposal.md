# Proposal: Fix Docker Environment Documentation

## Intent

Docker deployment docs currently point users at stale or incomplete environment guidance. A user who copies `deploy/.env.example` sees deprecated `OD_API_TOKEN`, cannot discover the required Cloudflare Access variables, and has no clear reverse-proxy or troubleshooting path. This change makes Docker deployment understandable, copy-pasteable, and production-safe without changing runtime behavior.

## Scope

### In Scope
- Replace documented `OD_API_TOKEN` usage with canonical `OD_ACCESS_TOKEN` while noting deprecated fallback compatibility where useful.
- Add missing proxy/auth variables: `OD_TRUSTED_PROXY`, `OD_CF_ACCESS_TEAM_DOMAIN`, and `OD_CF_ACCESS_AUD`.
- Document reverse-proxy setup, Cloudflare Access mode, allowed origins, and common Docker troubleshooting.
- Optionally split longer proxy guidance into `deploy/REVERSE-PROXY.md` if `deploy/README.md` becomes too dense.

### Out of Scope
- Code, auth middleware, CSP, cookie bridge, sandbox, Composio, Dockerfile, or `docker-compose.yml` behavior changes.
- Removing deprecated `OD_API_TOKEN` fallback support from code.
- New deployment modes beyond the existing Docker Compose setup.

## Capabilities

### New Capabilities
- None: documentation-only cleanup; no new product/runtime capability.

### Modified Capabilities
- None: no existing OpenSpec capability specs are present, and no runtime requirements change.

## Approach

Update `deploy/.env.example` so it is the canonical source users can copy, fill, and run. Update `deploy/README.md` to explain auth modes, reverse-proxy expectations, Cloudflare Access requirements, trusted proxy handling, and troubleshooting for token, origin, proxy, and Docker Desktop networking issues. Keep guidance explicit about secure defaults: Compose stays bound to localhost unless protected by an authenticated proxy, SSH tunnel, or VPN.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `deploy/.env.example` | Modified | Canonical env var names and missing proxy/Cloudflare variables. |
| `deploy/README.md` | Modified | Setup flow, reverse-proxy guidance, env var reference, troubleshooting. |
| `deploy/REVERSE-PROXY.md` | New/Optional | Longer proxy recipes if README clarity benefits from a split. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Users with old `.env` files think `OD_API_TOKEN` stopped working. | Medium | State that code still accepts it as a deprecated fallback, while new docs prefer `OD_ACCESS_TOKEN`. |
| Over-documenting proxy details creates confusion. | Low | Keep README task-oriented; split advanced details only if needed. |

## Rollback Plan

Revert the documentation/env-template commit. Since no runtime code changes are planned, rollback only restores previous docs and sample env content.

## Dependencies

- Existing Docker deployment behavior and already-fixed auth/CSP/Composio code on `main`.

## Success Criteria

- [ ] A user can copy `deploy/.env.example` to `.env`, fill values, and deploy without deprecated variable confusion.
- [ ] Cloudflare Access and reverse-proxy setups list every required variable and when to use it.
- [ ] Troubleshooting covers token, origin, proxy, and Docker Desktop networking failure modes.
- [ ] No application code, Dockerfile, or Compose behavior changes are required.

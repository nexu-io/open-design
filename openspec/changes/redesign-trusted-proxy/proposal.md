# Proposal: Redesign Trusted Proxy & Rename API Token

**Status:** draft
**Created:** 2026-06-11

## Problem Statement

The current proxy/auth environment variable design has three usability issues:

### 1. `OD_BEHIND_PROXY` is stringly-typed and Cloudflare-specific

```bash
OD_BEHIND_PROXY=cloudflare  # ← the ONLY valid value
```

This is misleading — it looks like an enum but only accepts one value. Any other value (e.g. `nginx`, `traefik`, `1`, `true`) is silently ignored and the daemon falls through to the bearer-token or none path. An operator who sets `OD_BEHIND_PROXY=nginx` gets no error and no protection.

The name `OD_BEHIND_PROXY` also suggests it's a boolean ("are we behind a proxy?"), not a Cloudflare-specific mode selector.

### 2. `OD_API_TOKEN` is an unclear name

The name `OD_API_TOKEN` doesn't communicate what the token protects. Is it for the API? For the daemon? For external integrations? The user has to read docs to understand that this is the **bearer token that gates all `/api/*` access**.

### 3. The two modes are orthogonal but expressed as mutually exclusive branches

Currently `OD_BEHIND_PROXY=cloudflare` (CF Access mode) and `OD_API_TOKEN` (bearer mode) are mutually exclusive — you're either behind Cloudflare OR using a token. But conceptually they answer different questions:

- **"Is there a trusted reverse proxy in front?"** → yes/no (polarized)
- **"If not, what token protects the daemon?"** → the token value

The user's mental model is: "I'm behind Cloudflare → trusted proxy = 1 → no token needed." This doesn't map cleanly to the current env var design.

## Proposed Solution

### Replace `OD_BEHIND_PROXY` with `OD_TRUSTED_PROXY`

```bash
# Before (current)
OD_BEHIND_PROXY=cloudflare

# After (proposed)
OD_TRUSTED_PROXY=1
```

`OD_TRUSTED_PROXY` is a boolean flag:
- `1` / `true` → A trusted reverse proxy (Cloudflare Access, nginx, Traefik, etc.) handles authentication. The daemon trusts `X-Forwarded-*` headers from the proxy. No bearer token required for `/api/*` access.
- `0` / `false` / unset / any other value → No trusted proxy. The daemon must be protected by an access token.

When `OD_TRUSTED_PROXY=1`, the daemon may still validate Cloudflare Access JWT if `OD_CF_ACCESS_TEAM_DOMAIN` and `OD_CF_ACCESS_AUD` are configured. This is additive, not mutually exclusive — the trusted proxy flag enables proxy trust, and the CF config enables JWT validation on top.

### Rename `OD_API_TOKEN` to `OD_ACCESS_TOKEN`

```bash
# Before (current)
OD_API_TOKEN=abc123

# After (proposed)
OD_ACCESS_TOKEN=abc123
```

`OD_ACCESS_TOKEN` is more descriptive: it's the token that grants access to the daemon's API. This follows industry conventions (GitHub uses `GITHUB_TOKEN`, many services use `ACCESS_TOKEN`).

### Auth Mode Resolution (new logic)

```
OD_TRUSTED_PROXY=1  →  "trusted-proxy" mode
                         + CF JWT validation if OD_CF_ACCESS_* are set
OD_ACCESS_TOKEN set  →  "access-token" mode (formerly bearer-token)
neither              →  "none" (only loopback allowed)
```

When BOTH `OD_TRUSTED_PROXY=1` AND `OD_ACCESS_TOKEN` are set, trusted-proxy wins (the proxy is the auth layer; the token is redundant and ignored with a warning).

### Migration Path

Both old env var names continue to work with a deprecation warning for one release cycle:

| Old var | New var | Behavior |
|---|---|---|
| `OD_BEHIND_PROXY=cloudflare` | `OD_TRUSTED_PROXY=1` | Recognized, prints deprecation warning, sets trusted-proxy mode |
| `OD_API_TOKEN=<value>` | `OD_ACCESS_TOKEN=<value>` | Recognized, prints deprecation warning, sets access-token mode |

When both old and new are set, the new var wins.

## Scope

**In scope:**
- Daemon: replace `OD_BEHIND_PROXY` → `OD_TRUSTED_PROXY` in `resolveAuthMode()` and all references
- Daemon: rename `OD_API_TOKEN` → `OD_ACCESS_TOKEN` in all references
- Daemon: add backward-compat aliases with deprecation warnings
- Contracts: update `AuthMode` type (`"cf-access"` → `"trusted-proxy"`)
- Tests: update all test env var references
- Deploy: update `docker-compose.yml`, `Dockerfile`, Helm chart, Azure pipeline, install script
- Docs: update `README.md`, `QUICKSTART.md`, `CHANGELOG.md`, `deploy/README.md`

**Out of scope:**
- Changing the CF Access JWT validation logic itself
- Adding support for non-Cloudflare proxy auth methods (e.g., nginx basic auth validation)
- Changing the loopback bypass behavior
- Adding a web UI for token/proxy configuration

## Risks

- **Breaking existing deployments**: Mitigated by backward-compat aliases with deprecation warnings. Operators have one release cycle to migrate.
- **`OD_TRUSTED_PROXY` ambiguity with Cloudflare config**: When `OD_TRUSTED_PROXY=1` is set WITHOUT CF config, the daemon trusts the proxy but doesn't validate JWTs. This is a valid use case (e.g., internal nginx with basic auth) but operators must ensure their proxy is correctly configured. The startup log makes this explicit.
- **Helm chart / Azure pipeline breakage**: These reference `OD_API_TOKEN` directly. Must be updated atomically.

## Non-Goals

- Removing Cloudflare Access support
- Adding a web-based configuration UI
- Changing the token validation logic (only renaming)
- Supporting multiple simultaneous proxy types

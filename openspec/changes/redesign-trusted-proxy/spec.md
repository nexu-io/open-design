# Spec: Redesign Trusted Proxy & Rename API Token

**Status:** draft
**Parent:** proposal.md

## Acceptance Criteria

### AC-1: `OD_TRUSTED_PROXY=1` enables trusted-proxy mode

**Given** the daemon is started with `OD_TRUSTED_PROXY=1` and `OD_BIND_HOST=0.0.0.0`
**When** the daemon initializes
**Then** it starts successfully without requiring `OD_ACCESS_TOKEN`
**And** logs `[auth] Trusted-proxy mode ENABLED`
**And** does NOT require `Authorization: Bearer <token>` on `/api/*` requests

### AC-2: `OD_TRUSTED_PROXY=1` with Cloudflare config enables JWT validation

**Given** the daemon is started with `OD_TRUSTED_PROXY=1`, `OD_CF_ACCESS_TEAM_DOMAIN=example.cloudflareaccess.com`, and `OD_CF_ACCESS_AUD=abc123`
**When** the daemon initializes
**Then** it enables Cloudflare Access JWT validation on `/api/*`
**And** logs `[cf-access] Cloudflare Access JWT validation ENABLED`
**And** rejects requests without a valid `Cf-Access-Jwt-Assertion` header with 401

### AC-3: `OD_TRUSTED_PROXY=1` without Cloudflare config trusts the proxy

**Given** the daemon is started with `OD_TRUSTED_PROXY=1` but NO `OD_CF_ACCESS_TEAM_DOMAIN`
**When** the daemon initializes
**Then** it starts in trusted-proxy mode without JWT validation
**And** logs `[auth] Trusted-proxy mode ENABLED (no JWT validation configured)`
**And** accepts all `/api/*` requests without bearer tokens

### AC-4: `OD_ACCESS_TOKEN` enables access-token mode

**Given** the daemon is started with `OD_ACCESS_TOKEN=secret123` and `OD_BIND_HOST=0.0.0.0`
**When** an HTTP client sends `GET /api/projects` without `Authorization: Bearer secret123` from a non-loopback address
**Then** the daemon returns 401 with `{ "error": { "code": "ACCESS_TOKEN_REQUIRED", "message": "Authorization: Bearer <OD_ACCESS_TOKEN> required" } }`

### AC-5: `OD_TRUSTED_PROXY=1` takes precedence over `OD_ACCESS_TOKEN`

**Given** the daemon is started with BOTH `OD_TRUSTED_PROXY=1` AND `OD_ACCESS_TOKEN=secret123`
**When** an HTTP client sends requests
**Then** trusted-proxy mode is active (no bearer token required)
**And** the daemon logs a warning: `[auth] OD_ACCESS_TOKEN is set but OD_TRUSTED_PROXY=1 takes precedence; OD_ACCESS_TOKEN is ignored`

### AC-6: Old env vars still work with deprecation warning

**Given** the daemon is started with `OD_BEHIND_PROXY=cloudflare` (old var)
**When** the daemon initializes
**Then** it treats it as `OD_TRUSTED_PROXY=1`
**And** logs `[auth] DEPRECATED: OD_BEHIND_PROXY is deprecated, use OD_TRUSTED_PROXY=1 instead`

**Given** the daemon is started with `OD_API_TOKEN=secret123` (old var)
**When** the daemon initializes
**Then** it treats it as `OD_ACCESS_TOKEN=secret123`
**And** logs `[auth] DEPRECATED: OD_API_TOKEN is deprecated, use OD_ACCESS_TOKEN instead`

### AC-7: New vars win over old vars when both are set

**Given** the daemon is started with BOTH `OD_TRUSTED_PROXY=1` AND `OD_BEHIND_PROXY=cloudflare`
**When** the daemon initializes
**Then** `OD_TRUSTED_PROXY=1` takes effect (new wins)
**And** `OD_BEHIND_PROXY` is ignored with a deprecation warning

### AC-8: Startup guard uses new var names

**Given** the daemon is started with `OD_BIND_HOST=0.0.0.0` and NEITHER `OD_TRUSTED_PROXY=1` NOR `OD_ACCESS_TOKEN` set
**When** the daemon initializes
**Then** it throws an error mentioning `OD_TRUSTED_PROXY` and `OD_ACCESS_TOKEN` (not the old names)

### AC-9: All existing deployments reference new vars

**Given** the deployment manifests (`docker-compose.yml`, Helm chart, Azure pipeline, install script) are updated
**When** a fresh deployment uses the new manifests
**Then** the daemon starts with the new env var names
**And** no deprecation warnings appear

### AC-10: Existing tests pass with updated env var names

**Given** the code changes are applied
**When** `pnpm --filter @open-design/daemon test` runs
**Then** all tests that reference `OD_API_TOKEN` or `OD_BEHIND_PROXY` pass with the new names

### AC-11: Type system reflects new names

**Given** the `AuthMode` type is updated
**When** `pnpm typecheck` runs
**Then** no type errors in daemon, contracts, or dependent packages

## Non-Functional Requirements

- **NFR-1:** Deprecation warnings use `console.warn()` and are printed exactly once at startup (not per-request).
- **NFR-2:** The `resolveAuthMode()` function remains the single source of truth for auth mode resolution.
- **NFR-3:** All user-facing error messages and log lines use the new env var names.
- **NFR-4:** The `dist/` declaration files reflect the updated types and docstrings.

## Out of Scope

- Changing the CF Access JWT validation logic
- Adding support for non-Cloudflare proxy auth validation
- Changing the loopback bypass behavior
- Adding a web UI for proxy/token configuration
- The `/api/agents` open-probe-path change (already done in fix-cli-detection)

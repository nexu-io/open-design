# Design: Redesign Trusted Proxy & Rename API Token

**Status:** draft
**Parent:** spec.md

## Architecture Overview

The change refactors the auth mode resolution layer. The middleware pipeline itself (CF Access JWT validation, bearer token check) remains unchanged — only the *decision* of which middleware to activate and which env vars trigger it changes.

```
┌──────────────────────────────────────────────────────┐
│  resolveAuthMode(env)                                │
│  ┌────────────────────────────────────────────────┐  │
│  │ 1. OD_TRUSTED_PROXY=1?   → "trusted-proxy"     │  │
│  │    ├─ CF config valid?   → JWT middleware       │  │
│  │    └─ CF config absent?  → no extra validation  │  │
│  │                                                 │  │
│  │ 2. OD_BEHIND_PROXY (deprecated)?                │  │
│  │    └─ =cloudflare?       → "trusted-proxy"      │  │
│  │       └─ CF config MUST be valid (throws if not)│  │
│  │                                                 │  │
│  │ 3. OD_ACCESS_TOKEN set?  → "access-token"       │  │
│  │                                                 │  │
│  │ 4. OD_API_TOKEN (deprecated)?                   │  │
│  │    └─ set?               → "access-token"       │  │
│  │                                                 │  │
│  │ 5. Neither               → "none"               │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  server.ts consumes AuthMode:                         │
│  ┌────────────────────────────────────────────────┐  │
│  │ "trusted-proxy" → CF JWT middleware if configured│  │
│  │ "access-token"  → Bearer token middleware        │  │
│  │ "none"          → No middleware (loopback only)  │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. AuthMode type rename

```typescript
// Before
export type AuthMode = "none" | "cf-access" | "bearer-token";

// After
export type AuthMode = "none" | "trusted-proxy" | "access-token";
```

**Rationale:** `"cf-access"` was Cloudflare-specific. `"trusted-proxy"` is generic — it means "the daemon is behind a trusted reverse proxy." Whether that proxy is Cloudflare, nginx, or Traefik is an implementation detail of the middleware, not the mode name.

`"bearer-token"` → `"access-token"` aligns with the env var rename and is more descriptive of what the token *does* (grants access) rather than *how* it's transmitted (bearer header).

### 2. Resolution priority

```
OD_TRUSTED_PROXY=1  >  OD_ACCESS_TOKEN  >  none
```

When both are set, trusted-proxy wins. Rationale: if an operator has configured a trusted proxy, they don't want bearer token auth. The `OD_ACCESS_TOKEN` might be a leftover from a previous config. The daemon logs a warning so the operator can clean up.

### 3. Backward compatibility strategy

Two env var pairs with deprecation:

| Deprecated | Replacement | Detection order |
|---|---|---|
| `OD_BEHIND_PROXY=cloudflare` | `OD_TRUSTED_PROXY=1` | Checked AFTER new var. Only takes effect if new var is unset. |
| `OD_API_TOKEN=<value>` | `OD_ACCESS_TOKEN=<value>` | Checked AFTER new var. Only takes effect if new var is unset. |

**Deprecation warnings** use `console.warn()` exactly once at startup in `resolveAuthMode()`. Example:

```
[auth] DEPRECATED: OD_BEHIND_PROXY is deprecated, use OD_TRUSTED_PROXY=1 instead
[auth] DEPRECATED: OD_API_TOKEN is deprecated, use OD_ACCESS_TOKEN instead
```

### 4. Cloudflare Access behavior change

| Scenario | Old behavior | New behavior |
|---|---|---|
| `OD_BEHIND_PROXY=cloudflare` + valid CF config | CF JWT enabled | ✅ Same (with deprecation warning) |
| `OD_BEHIND_PROXY=cloudflare` + missing CF config | **THROW at startup** | ✅ Same (strict backward compat) |
| `OD_TRUSTED_PROXY=1` + valid CF config | N/A | CF JWT enabled |
| `OD_TRUSTED_PROXY=1` + missing CF config | N/A | Trusted proxy, no JWT (new capability!) |

The key innovation: `OD_TRUSTED_PROXY=1` without CF config is NOW VALID. Previously, the only proxy mode was Cloudflare-specific. Now an operator behind nginx with its own auth can set `OD_TRUSTED_PROXY=1` and the daemon trusts the proxy without requiring Cloudflare.

### 5. Server.ts middleware wiring

Currently `server.ts` has two middleware branches:

```typescript
if (authMode === 'cf-access') { ... }       // CF JWT middleware
else if (authMode === 'bearer-token') { ... } // Bearer token middleware
```

New structure:

```typescript
if (authMode === 'trusted-proxy') {
  const cfConfig = resolveCloudflareAccessConfig();
  if (cfConfig) {
    // CF JWT middleware (same as before)
    app.use('/api', createCloudflareAccessMiddleware(cfConfig));
  }
  // If no CF config: no middleware needed. The proxy handles auth.
  // The startup guard already verified the bind is safe.
} else if (authMode === 'access-token') {
  // Bearer token middleware (same as before, renamed vars)
}
```

**Why not add middleware for non-CF trusted proxies?** The daemon doesn't know what auth mechanism the proxy uses (basic auth, OAuth2, mTLS, IP whitelist). Adding validation would require the daemon to understand every proxy's auth format, which is unbounded scope. The operator's responsibility is to ensure their proxy is correctly configured — `OD_TRUSTED_PROXY=1` is the operator's assertion that this is the case.

### 6. Startup guard message

```typescript
// Before
throw new Error(
  `OD_BIND_HOST=${host} requires OD_API_TOKEN to be set, ` +
  `or OD_BEHIND_PROXY=cloudflare with OD_CF_ACCESS_TEAM_DOMAIN ` +
  `and OD_CF_ACCESS_AUD configured.`
);

// After
throw new Error(
  `OD_BIND_HOST=${host} requires authentication. ` +
  `Set OD_ACCESS_TOKEN=<token> (generate with \`openssl rand -hex 32\`) ` +
  `or set OD_TRUSTED_PROXY=1 if the daemon is behind a trusted reverse proxy.`
);
```

### 7. token / access-token API response code

```typescript
// Before
error: { code: 'API_TOKEN_REQUIRED', message: 'Authorization: Bearer <OD_API_TOKEN> required' }

// After
error: { code: 'ACCESS_TOKEN_REQUIRED', message: 'Authorization: Bearer <OD_ACCESS_TOKEN> required' }
```

Note: `ACCESS_TOKEN_REQUIRED` is a new error code. Clients checking for `API_TOKEN_REQUIRED` need to also check for the new code. However, this error is only returned by the daemon to browsers/CLI — there are no known external clients parsing this specific code.

## Implementation Plan

### Phase 1: Core logic (`cf-access-middleware.ts`)

1. Rename `AuthMode` type: `"cf-access"` → `"trusted-proxy"`, `"bearer-token"` → `"access-token"`
2. Rewrite `resolveAuthMode()` with new priority order + backward compat
3. Update JSDoc

### Phase 2: Server wiring (`server.ts`)

1. Rename auth mode branches: `'cf-access'` → `'trusted-proxy'`, `'bearer-token'` → `'access-token'`
2. Update startup guard error message
3. Update bearer middleware: `OD_API_TOKEN` → `OD_ACCESS_TOKEN`, error code `API_TOKEN_REQUIRED` → `ACCESS_TOKEN_REQUIRED`
4. Update all comments referencing old env var names
5. In trusted-proxy branch: only enable CF middleware when CF config is valid

### Phase 3: Tests

1. `api-token-guard.test.ts`: rename all `OD_API_TOKEN` → `OD_ACCESS_TOKEN`
2. Add new tests: AC-1 through AC-8
3. `project-preview-containment.test.ts`: update env var references

### Phase 4: Deploy & Docs

1. `deploy/docker-compose.yml`: update env vars
2. `tools/pack/docker-compose.yml`: update env vars
3. `tools/pack/helm/open-design/`: update templates + values
4. `deploy/azure/azure-pipelines.yml`: update env vars
5. `deploy/scripts/install.sh`: update env var
6. `README.md`, `QUICKSTART.md`, `CHANGELOG.md`, `deploy/README.md`: update docs

## Files Changed (estimate)

| File | Change type | Est. lines |
|---|---|---|
| `apps/daemon/src/cf-access-middleware.ts` | Core refactor | ~40 |
| `apps/daemon/src/server.ts` | Wiring + messages | ~30 |
| `apps/daemon/tests/api-token-guard.test.ts` | Rename + new tests | ~60 |
| `apps/daemon/tests/project-preview-containment.test.ts` | Rename | ~5 |
| `deploy/docker-compose.yml` | Env vars | ~5 |
| `tools/pack/docker-compose.yml` | Env vars | ~5 |
| `tools/pack/helm/open-design/templates/secret.yaml` | Env vars | ~2 |
| `tools/pack/helm/open-design/values.yaml` | Env vars | ~2 |
| `deploy/azure/azure-pipelines.yml` | Env vars | ~5 |
| `deploy/scripts/install.sh` | Env var | ~2 |
| `README.md` | Docs | ~5 |
| `QUICKSTART.md` | Docs | ~5 |
| `CHANGELOG.md` | Docs | ~3 |
| `deploy/README.md` | Docs | ~5 |
| **Total** | | **~175 lines** |

Under the 600-line review budget. Single PR.

## Rollback Plan

1. Revert `cf-access-middleware.ts` and `server.ts` changes
2. Deploy with old env var names
3. No data migration needed — env vars are stateless

The backward compat layer means a rollback is a simple git revert — old env vars continue to work during and after the transition.

# Design: Simplify Docker Deployment

## 1. Architecture summary

The daemon auth resolver becomes a three-state machine: `none | trusted-proxy | access-token`. Docker Compose keeps only two persistent volumes: app data plus one writable home directory for all agent CLI credentials. `dokploy-compose.yml` is a strict mirror of the primary compose file except `ports` becomes `expose`. All Cloudflare Access JWT runtime, env defaults, docs, and compatibility tests are removed; Cloudflare can still sit in front as a generic trusted proxy via `OD_TRUSTED_PROXY`.

## 2. Auth resolver redesign

New module, chosen to minimize churn while deleting CF code: `apps/daemon/src/auth/auth-mode.ts`.

```ts
export type AuthMode = 'none' | 'trusted-proxy' | 'access-token';
export function resolveAuthMode(env = process.env): AuthMode {
  if ((env.OD_TRUSTED_PROXY ?? '').trim()) return 'trusted-proxy';
  if ((env.OD_ACCESS_TOKEN ?? env.OD_API_TOKEN ?? '').trim()) return 'access-token';
  return 'none';
}
```

`apps/daemon/src/cf-access-middleware.ts` is deleted, not stubbed. Grep shows only `apps/daemon/src/server.ts` imports its exported symbols, so relocation is safe.

Middleware shape stays in `server.ts` to avoid wider route extraction:

```ts
if (authMode === 'trusted-proxy') {
  console.log('[auth] Trusted-proxy mode ENABLED');
  if (accessToken) console.warn('[auth] OD_ACCESS_TOKEN ignored; OD_TRUSTED_PROXY takes precedence');
} else if (authMode === 'access-token') {
  app.use('/api', accessTokenGuard);
}
```

Patch surface: replace imports from `./cf-access-middleware.js` with `./auth/auth-mode.js`; remove `resolveCloudflareAccessConfig()` startup branch, `createCloudflareAccessMiddleware()` mount, CF comments/logs, and CF warning text. Existing `apps/daemon/tests/api-token-guard.test.ts` remains the main auth test surface.

## 3. Deploy artifact design

### Volume consolidation plan

```diff
 volumes:
   - open_design_data:/app/.od
-  - open_design_claude:/home/open-design/.claude
-  ... delete all 20 CLI named mounts ...
-  - open_design_hermes:/home/open-design/.hermes
+  - open_design_home:/home/open-design
 read_only: true
 tmpfs:
   - /tmp
   - /home/open-design/.npm:uid=1001,gid=1001
@@
 volumes:
   open_design_data:
-  open_design_claude:
-  ... delete all 20 CLI volume declarations ...
-  open_design_hermes:
+  open_design_home:
```

`read_only: true` remains valid because the writable named volume overrides the read-only rootfs at `/home/open-design`. The `/home/open-design/.npm` tmpfs remains nested under the home mount and shadows that subpath, preserving ephemeral npm cache. `deploy/scripts/uninstall.sh` removes `open_design_home` plus best-effort legacy `open_design_*` CLI volumes when `--keep-data` is false.

### Dokploy mirror design

Transform rule:

```diff
-ports:
-  - "127.0.0.1:${OPEN_DESIGN_PORT:-7456}:7456"
+expose:
+  - "7456"
```

Everything else stays identical: `name`, `image`, `build`, `container_name`, `restart`, `environment`, `volumes`, `tmpfs`, `read_only`, `security_opt`, `mem_limit`, `pids_limit`, `healthcheck`, and top-level `volumes`. Dokploy does not need `container_name` or top-level `name`, but strict mirror wins.

### Env cleanup

```diff
 environment:
   NODE_ENV: production
   NODE_OPTIONS: ${NODE_OPTIONS:---max-old-space-size=192}
   OD_BIND_HOST: 0.0.0.0
   OD_ALLOWED_ORIGINS: ${OPEN_DESIGN_ALLOWED_ORIGINS:-}
   OD_PORT: 7456
   OD_WEB_PORT: ${OPEN_DESIGN_PORT:-7456}
   OD_ACCESS_TOKEN: ${OD_ACCESS_TOKEN:-}
   OD_CODEX_SANDBOX: ${OD_CODEX_SANDBOX:-}
-  # Trusted reverse proxy ... Cloudflare Access ...
+  # Trusted reverse proxy (set when an authenticated proxy gates access)
   OD_TRUSTED_PROXY: ${OD_TRUSTED_PROXY:-}
-  OD_CF_ACCESS_TEAM_DOMAIN: ${OD_CF_ACCESS_TEAM_DOMAIN:-}
-  OD_CF_ACCESS_AUD: ${OD_CF_ACCESS_AUD:-}
```

Also remove `OD_BEHIND_PROXY` if present. `.env.example`: delete Option B Cloudflare block, keep bearer token and trusted proxy, update header to two modes. `deploy/README.md`: auth table, Cloudflare subsection, troubleshooting, and add Dokploy/migration notes. `CHANGELOG.md`: replace CF Access added/changed entries with removal + home-volume consolidation note.

## 4. Test strategy (strict TDD)

1. Red CF removal tests first in `apps/daemon/tests/api-token-guard.test.ts` or `apps/daemon/tests/cf-access-removed.test.ts`:
   - deprecated CF env vars never call JWT validation/fetch;
   - `Cf-Access-Jwt-Assertion` without bearer/trusted-proxy is rejected for non-loopback;
   - `resolveAuthMode()` only returns `none | trusted-proxy | access-token`.
2. Compose parsing tests in `deploy/tests/docker-compose.test.ts` using `node:test`. `yaml@2.9.0` is pinned in root overrides/lock, but not a direct devDependency; add a direct devDependency if importing `yaml` from the test. Assert no deprecated env vars, exact persistent volumes, tmpfs, `ports` vs `expose`, and normalized mirror equality.
3. Keep existing green tests: `apps/daemon/tests/api-token-guard.test.ts`, `deploy/tests/install.test.ts`, `deploy/tests/prepare-colima-build-swap.test.ts`, and deploy-relevant guard checks.
4. Manual validation: `docker compose -f deploy/docker-compose.yml config`, `docker compose -f deploy/dokploy-compose.yml config`, `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/daemon test`.

## 5. Implementation order (strict TDD)

1. Add failing CF Access removal tests. Verify: auth tests fail on current CF path.
2. Add failing compose YAML invariant tests. Verify: missing Dokploy and old volumes fail.
3. Delete `cf-access-middleware.ts`; add `auth/auth-mode.ts`. Verify: resolver tests compile/fail only on expected imports.
4. Simplify auth dispatcher. Verify: token/trusted-proxy tests pass.
5. Patch `server.ts` CF wiring. Verify: no CF imports/logs.
6. Update `deploy/docker-compose.yml`. Verify: compose tests for env/volumes pass.
7. Add `deploy/dokploy-compose.yml`. Verify: mirror test passes.
8. Update `.env.example`, `deploy/README.md`, `CHANGELOG.md`. Verify: text grep has no CF Access setup.
9. Update `tools/pack/docker-compose.yml` line 33 comment if it mentions Cloudflare Access. Verify: no stale hosted-auth wording.
10. Update `uninstall.sh` for `open_design_home` and legacy volumes. Verify: script test/manual dry run.
11. Run full validation: guard, typecheck, daemon/web tests, and both compose config commands.

## 6. Files-touched inventory

| Path | Change type | Approx. delta |
|---|---:|---:|
| `apps/daemon/src/cf-access-middleware.ts` | DELETE | -638 |
| `apps/daemon/src/server.ts` | EDIT | -40 |
| `apps/daemon/src/auth/auth-mode.ts` | NEW | +20 |
| `apps/daemon/tests/cf-access-removed.test.ts` | NEW | +60 |
| `deploy/docker-compose.yml` | EDIT | -25 |
| `deploy/dokploy-compose.yml` | NEW | +75 |
| `deploy/tests/docker-compose.test.ts` | NEW | +90 |
| `deploy/.env.example` | EDIT | -15 |
| `deploy/README.md` | EDIT | -30 |
| `CHANGELOG.md` | EDIT | -10 |
| `deploy/scripts/uninstall.sh` | EDIT | +5 |
| `tools/pack/docker-compose.yml` | EDIT | -1 |

Estimated review delta: ~1,009 changed lines by raw add/delete count. Recommend chained PRs: runtime removal, compose/Dokploy, docs/scripts.

## 7. Risks and mitigations

- Deleted module import risk: grep currently shows only `server.ts`; re-run before deletion.
- Dokploy healthcheck loopback is safe because it runs inside the container network namespace.
- Upgraders keep orphaned legacy volumes; document backup/restore and prune in migration + uninstall.
- Dokploy mirror drift; enforce normalized YAML mirror tests.

## 8. Out-of-scope but adjacent

- Bearer-token UX improvements.
- New proxy integrations beyond generic `OD_TRUSTED_PROXY`.
- Dokploy automated templates beyond the compose file.

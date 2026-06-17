# Proposal: Simplify Docker Deployment

## Intent

Simplify Docker deployment by hard-removing Cloudflare Access JWT support, replacing 20 per-CLI named volumes with one writable home volume, and adding a Dokploy compose variant that relies on proxy networking instead of host port publishing. This supersedes the Cloudflare-auth assumptions left by `redesign-trusted-proxy`: Option B (`OD_BEHIND_PROXY=cloudflare` + `OD_CF_ACCESS_*`) ceases to exist; only bearer token (`OD_ACCESS_TOKEN`) and trusted proxy (`OD_TRUSTED_PROXY`) remain.

## Capabilities

### New Capabilities
- `docker-deployment`: Compose, Dokploy, volume, and Docker deployment documentation behavior.
- `daemon-auth`: Runtime auth mode selection after removing Cloudflare Access JWT validation.

### Modified Capabilities
- None; `openspec/specs/` has no existing capability specs.

## Scope (in)

### Auth runtime removal
- `apps/daemon/src/cf-access-middleware.ts`: delete the CF Access validation module or reduce it to non-CF auth resolution only if imports require it. Remove JWT decode/claim/JWKS logic; `resolveCloudflareAccessConfig`; `createCloudflareAccessMiddleware`; `OD_BEHIND_PROXY=cloudflare`; `OD_CF_ACCESS_TEAM_DOMAIN`; `OD_CF_ACCESS_AUD`; `OD_CF_ACCESS_UNSAFE_DOMAIN`; `Cf-Access-Jwt-Assertion` handling.
- `apps/daemon/src/server.ts:37-41,4663-4667,4700-4724`: remove CF imports, comments, startup wiring, and middleware branch. Keep `trusted-proxy` mode as proxy-trust only.
- `apps/daemon/tests/api-token-guard.test.ts:22,40-41,193-227`: replace deprecated CF Access compatibility tests with red/green tests proving `OD_BEHIND_PROXY=cloudflare` and `OD_CF_ACCESS_*` no longer activate auth.

### Deploy defaults
- `deploy/docker-compose.yml:20-24`: remove CF wording and env passthroughs; keep `OD_TRUSTED_PROXY`.
- `deploy/.env.example:13-55`: remove Option B block and CF vars; renumber to Option A token + Option C trusted proxy.
- `deploy/README.md:75-101,151-159`: remove CF Access mode and troubleshooting; add migration note for former CF Access users.
- `CHANGELOG.md:12-22`: remove or supersede old CF Access release guidance with a removal note.

### Volume consolidation
- `deploy/docker-compose.yml:27-50,74-97`: remove `open_design_claude`, `open_design_codex`, `open_design_gemini`, `open_design_devin`, `open_design_copilot`, `open_design_cursor`, `open_design_opencode`, `open_design_openclaw`, `open_design_deepseek`, `open_design_qoder`, `open_design_pi`, `open_design_kiro`, `open_design_kilo`, `open_design_vibe`, `open_design_trae`, `open_design_kimi`, `open_design_qwen`, `open_design_aider`, `open_design_grok`, `open_design_reasonix`, `open_design_hermes`.
- Replace them with `open_design_home:/home/open-design`; keep `open_design_data:/app/.od` and tmpfs `/home/open-design/.npm`.

### Dokploy variant
- Add `deploy/dokploy-compose.yml` as a strict mirror of `deploy/docker-compose.yml` after simplification, except use `expose: ["7456"]` instead of `ports:`.
- Preserve image/build, env, volumes, read-only rootfs, tmpfs, healthcheck, restart, security, memory, and PID settings.

### Tests/docs/contracts
- Add strict TDD coverage before implementation: daemon auth tests for removed CF env/header behavior and deploy artifact tests for compose env/volume/dokploy invariants.
- `packages/contracts/src/api/`: no CF Access DTO matches found; no contract change expected.
- `deploy/scripts/install.sh`, `install-clis.sh`, `uninstall.sh`, `update.sh`: no CF Access references found; only minimal volume-summary/uninstall text changes if needed.

## Scope (out)

- Do not change `OD_ACCESS_TOKEN` bearer-token behavior or loopback exemption.
- Do not add non-Cloudflare proxy auth validation; `OD_TRUSTED_PROXY` remains operator assertion only.
- Do not rewrite unrelated Cloudflare Pages deploy features or plugin Cloudflare Stream media URLs.
- Do not write spec/design/tasks in this phase.
- Do not preserve the old 20-volume layout as an active compose alternative unless the user rejects hard-cut.

## Approach

1. Write failing tests in `apps/daemon/tests/api-token-guard.test.ts` proving `OD_BEHIND_PROXY=cloudflare`, `OD_CF_ACCESS_*`, and `Cf-Access-Jwt-Assertion` no longer enable/request JWT validation.
2. Add deploy artifact tests that parse `deploy/docker-compose.yml` and future `deploy/dokploy-compose.yml`: no `OD_CF_ACCESS_*`, no `OD_BEHIND_PROXY`, exactly `open_design_data` + `open_design_home`, Dokploy uses `expose`, not `ports`.
3. Remove CF Access runtime from `apps/daemon/src/cf-access-middleware.ts`; keep/relocate `AuthMode` + `resolveAuthMode()` for `none | trusted-proxy | access-token` only.
4. Update `apps/daemon/src/server.ts` imports and `trusted-proxy` branch so it never calls CF middleware.
5. Update compose/env/docs listed above; add Dokploy file as a mirror.
6. Re-run prior `redesign-trusted-proxy` verification assumptions against the new auth model and call out supersession in verify.

## Grep audit

Cleanup targets: `deploy/docker-compose.yml:21,23,24`; `deploy/README.md:83,91-93,157-158`; `CHANGELOG.md:12,15-16,20,22`; `apps/daemon/src/cf-access-middleware.ts:1-33,43,90-110,131-145,202-206,305-312,320-378,389-408,431-458,469,496,504,532,556-561,579-618`; `apps/daemon/src/server.ts:37-41,4665-4666,4701-4724`; `apps/daemon/tests/api-token-guard.test.ts:22,40-41,193-227`; `tools/pack/docker-compose.yml:33` comment.

Historical/spec references to review as superseded: `openspec/changes/redesign-trusted-proxy/{proposal.md,design.md,spec.md,tasks.md,verify-report.md}` CF Access assumptions; `openspec/changes/archive/2026-06-13-fix-docker-env-docs/*`; `openspec/changes/token-bridge-for-docker/proposal.md:36,119,138`; current `explore.md` notes.

Non-target generic `cloudflare` matches: Cloudflare Pages deploy code/tests/contracts, daemon deploy routes, R2/plugin preview comments, and plugin media CDN URLs. These are not CF Access auth and should remain.

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Orphaned Docker volumes after migration | Document cleanup: old `open_design_*` volumes are no longer mounted; users can prune after backup. |
| CF Access users break on upgrade | Add explicit migration note: use `OD_TRUSTED_PROXY` behind Cloudflare, but JWT validation is removed. |
| `dokploy-compose.yml` drifts | Keep it a mirror and add a test comparing normalized service shape. |
| Regression against archived `redesign-trusted-proxy` verification | Treat this change as superseding those CF assumptions and re-run auth tests. |

## Decision points

- Confirm supersession: proceed with Option A, superseding `redesign-trusted-proxy` CF Access assumptions? Recommended: yes.
- Should `dokploy-compose.yml` be a strict mirror of `docker-compose.yml`? Recommended: yes, only `ports` → `expose`.
- Hard-cut the 20 named CLI volumes or keep them as opt-in migration alternative? Recommended: hard-cut.
- Consolidated home volume name: `open_design_home` or reuse an old name? Recommended: `open_design_home`.

## Review workload forecast

Medium diff, likely 300-600 changed lines including tests/docs/new Dokploy file. Review budget is 800 lines. Because chained PR strategy is ask-always: recommend a single PR unless generated compose duplication pushes the diff above budget; ask before splitting.

## Summary
status: complete
executive_summary: Simplifies Docker deployment by removing Cloudflare Access JWT runtime/docs/envs, consolidating CLI credential mounts into one home volume, and adding a Dokploy mirror compose that exposes the internal port without publishing localhost. This intentionally supersedes the CF Access compatibility assumptions from `redesign-trusted-proxy` while preserving bearer-token and generic trusted-proxy modes.
artifacts:
  - openspec/changes/simplify-docker-deployment/proposal.md
next_recommended: sdd-spec
risks:
  - Orphaned Docker volumes after migration
  - Breaking existing CF Access JWT users
  - Dokploy compose drift from main compose
  - Residual historical CF Access references causing confusion
skill_resolution: none

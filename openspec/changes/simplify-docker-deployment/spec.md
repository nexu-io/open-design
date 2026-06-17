# Delta for Simplify Docker Deployment

## Purpose

This change simplifies Docker deployment by removing Cloudflare Access JWT auth entirely, preserving only bearer-token and trusted-proxy auth, consolidating many CLI credential volumes into one writable home volume, and adding a Dokploy compose mirror that exposes the daemon only to the proxy network.

## ADDED Requirements

### Requirement: Cloudflare Access JWT auth is removed

The daemon SHALL NOT treat `Cf-Access-Jwt-Assertion`, `OD_BEHIND_PROXY=cloudflare`, `OD_CF_ACCESS_TEAM_DOMAIN`, `OD_CF_ACCESS_AUD`, or `OD_CF_ACCESS_UNSAFE_DOMAIN` as an auth signal.

#### Scenario: Unauthenticated non-loopback request stays rejected

- GIVEN a non-loopback client and no bearer token or trusted proxy
- WHEN it requests `/api/*` without Cloudflare headers
- THEN the daemon rejects the request

#### Scenario: Deprecated Cloudflare inputs do not unlock access

- GIVEN the same request with `Cf-Access-Jwt-Assertion` and any combination of deprecated Cloudflare env vars
- WHEN it requests `/api/*`
- THEN the daemon still rejects the request without bearer-token or trusted-proxy auth

### Requirement: Bearer token auth remains unchanged

The daemon SHALL continue to require `Authorization: Bearer <OD_ACCESS_TOKEN>` for non-loopback `/api/*` requests unless another allowed auth mode applies, and SHALL keep loopback requests exempt.

#### Scenario: Correct bearer token is accepted

- GIVEN `OD_ACCESS_TOKEN` is configured and the client is not loopback
- WHEN the client sends the matching bearer token to `/api/*`
- THEN the daemon accepts the request

#### Scenario: Loopback remains exempt

- GIVEN `OD_ACCESS_TOKEN` is configured and the client address is `127.0.0.1`
- WHEN the client requests `/api/*` without a bearer token
- THEN the daemon accepts the request

### Requirement: Trusted proxy auth remains unchanged

The daemon SHALL continue to honor forwarded auth headers only when `OD_TRUSTED_PROXY=<proxy-name>` is configured, and SHALL NOT honor those forwarded headers when trusted-proxy mode is disabled.

#### Scenario: Configured trusted proxy is honored

- GIVEN `OD_TRUSTED_PROXY` is configured and the request arrives through that proxy
- WHEN the proxy forwards the expected auth headers to `/api/*`
- THEN the daemon accepts the proxied request without requiring a bearer token

#### Scenario: Unconfigured proxy headers are ignored

- GIVEN `OD_TRUSTED_PROXY` is not configured
- WHEN a non-loopback request sends the same forwarded headers to `/api/*`
- THEN the daemon rejects the request unless bearer-token or loopback rules allow it

### Requirement: Auth mode resolution excludes Cloudflare

`resolveAuthMode()` SHALL return exactly one of `'none'`, `'trusted-proxy'`, or `'access-token'`, and MUST NOT return `'cloudflare'` or any Cloudflare-derived mode.

#### Scenario: Supported auth modes resolve predictably

- GIVEN supported runtime env combinations for access token, trusted proxy, or neither
- WHEN `resolveAuthMode()` is invoked by a test
- THEN it returns only `access-token`, `trusted-proxy`, or `none` for those cases

#### Scenario: Deprecated Cloudflare env does not resolve a mode

- GIVEN only deprecated Cloudflare env vars are configured
- WHEN `resolveAuthMode()` is invoked by a test
- THEN it returns `none` and never `cloudflare`

### Requirement: Compose uses one persistent home volume

`deploy/docker-compose.yml` SHALL declare exactly two persistent volumes: `open_design_data:/app/.od` and `open_design_home:/home/open-design`. It SHALL NOT declare any other persistent CLI config volumes, and SHALL keep tmpfs at `/home/open-design/.npm`.

#### Scenario: Persistent volume list is exact

- GIVEN `deploy/docker-compose.yml` is parsed as YAML
- WHEN the service volumes are inspected
- THEN the persistent mounts are exactly `open_design_data` and `open_design_home`

#### Scenario: Writable npm cache remains ephemeral

- GIVEN the same parsed compose service
- WHEN tmpfs mounts are inspected
- THEN `/home/open-design/.npm` is still present and no extra persistent CLI volume is declared

### Requirement: Dokploy compose mirrors Docker compose except publishing

`deploy/dokploy-compose.yml` SHALL exist as a strict mirror of `deploy/docker-compose.yml`, differing only by using `expose: ["7456"]` instead of `ports:`.

#### Scenario: Dokploy uses expose and not ports

- GIVEN `deploy/dokploy-compose.yml` is parsed as YAML
- WHEN its network publishing fields are inspected
- THEN it declares `expose: ["7456"]` and does not declare `ports:`

#### Scenario: All other service settings stay mirrored

- GIVEN both compose files are parsed and normalized to ignore only `ports` versus `expose`
- WHEN image, environment, volumes, healthcheck, read-only, tmpfs, security, memory, PID, and restart settings are compared
- THEN the service definitions match exactly

### Requirement: Compose artifacts omit Cloudflare env vars

Neither `deploy/docker-compose.yml` nor `deploy/dokploy-compose.yml` SHALL declare `OD_BEHIND_PROXY`, `OD_CF_ACCESS_TEAM_DOMAIN`, `OD_CF_ACCESS_AUD`, or `OD_CF_ACCESS_UNSAFE_DOMAIN`.

#### Scenario: Main compose omits deprecated env vars

- GIVEN `deploy/docker-compose.yml` is parsed as YAML
- WHEN its service environment entries are inspected
- THEN none of the deprecated Cloudflare env vars are declared

#### Scenario: Dokploy compose omits deprecated env vars

- GIVEN `deploy/dokploy-compose.yml` is parsed as YAML
- WHEN its service environment entries are inspected
- THEN none of the deprecated Cloudflare env vars are declared

### Requirement: Docker docs describe exactly two auth modes

`deploy/.env.example`, `deploy/README.md`, and `CHANGELOG.md` SHALL describe exactly two Docker auth modes: bearer token and trusted proxy. They SHALL NOT reference Cloudflare Access, `OD_BEHIND_PROXY=cloudflare`, or `OD_CF_ACCESS_*`.

#### Scenario: Deploy docs keep only supported auth configuration

- GIVEN `deploy/.env.example` and `deploy/README.md` are reviewed
- WHEN their auth setup sections are inspected
- THEN they document only bearer-token and trusted-proxy modes and omit all Cloudflare Access knobs

#### Scenario: Changelog communicates the removal

- GIVEN `CHANGELOG.md` is reviewed
- WHEN Docker auth guidance is inspected
- THEN it contains no Cloudflare Access setup guidance and reflects the two-mode model

### Requirement: Compose artifacts remain programmatically testable

Automated tests SHALL be able to parse both compose files as YAML and assert the auth-env, volume, and Dokploy mirror invariants without shelling out to Docker.

#### Scenario: YAML parsing succeeds for both compose files

- GIVEN automated tests load both compose files from disk
- WHEN they parse the files as YAML
- THEN parsing succeeds and exposes the service fields needed for assertions

#### Scenario: Parsed assertions detect drift

- GIVEN the parsed compose objects
- WHEN tests assert required env omissions, exact volumes, and `ports` versus `expose`
- THEN the tests fail if either compose file drifts from this spec

## MODIFIED Requirements

None — `openspec/specs/` is empty.

## REMOVED Requirements

None — `openspec/specs/` is empty.

## RENAMED Requirements

None.

## Migration

1. Remove deprecated env from your Docker `.env`: delete `OD_BEHIND_PROXY=cloudflare`, `OD_CF_ACCESS_TEAM_DOMAIN`, `OD_CF_ACCESS_AUD`, and `OD_CF_ACCESS_UNSAFE_DOMAIN`.
2. Choose one supported auth mode only:
   - Bearer token: set `OD_ACCESS_TOKEN=<strong-token>`.
   - Trusted proxy: set `OD_TRUSTED_PROXY=<proxy-name>` and keep identity enforcement at the proxy layer.
3. Upgrade compose artifacts, then recreate the service: `docker compose -f deploy/docker-compose.yml up -d --force-recreate`.
4. If you need data from an old CLI volume, back it up before cleanup, for example: `docker run --rm -v open_design_claude:/from -v "$PWD/od-backup/claude":/to alpine sh -c 'cp -a /from/. /to/'`.
5. Restore any kept dotfiles into the consolidated home volume: `docker run --rm -v open_design_home:/to -v "$PWD/od-backup":/from alpine sh -c 'cp -a /from/. /to/'`.
6. After verification, remove orphaned legacy CLI volumes: `docker volume rm open_design_claude open_design_codex open_design_gemini open_design_devin open_design_copilot open_design_cursor open_design_opencode open_design_openclaw open_design_deepseek open_design_qoder open_design_pi open_design_kiro open_design_kilo open_design_vibe open_design_trae open_design_kimi open_design_qwen open_design_aider open_design_grok open_design_reasonix open_design_hermes`.

# Delta for Docker Deployment Documentation

## Purpose

This change SHALL clarify Docker deployment docs without changing runtime behavior.

## ADDED Requirements

### Requirement: Canonical env var names in `.env.example`

`deploy/.env.example` MUST present current authentication and proxy variables as the copy-paste source of truth.

#### Scenario: First-time token setup

- GIVEN a user copies `.env.example` for first-time setup
- WHEN they review the bearer-token option
- THEN they see `OD_ACCESS_TOKEN=` as the documented token variable
- AND `OD_API_TOKEN=` is not shown as the primary setup variable

#### Scenario: Cloudflare Access setup

- GIVEN a user needs Cloudflare Access in front of Docker
- WHEN they read the auth-related comments
- THEN they find `OD_CF_ACCESS_TEAM_DOMAIN=` and `OD_CF_ACCESS_AUD=`
- AND each variable includes when and why it is required

#### Scenario: Trusted proxy setup

- GIVEN a user deploys behind a trusted reverse proxy
- WHEN they inspect proxy-related comments
- THEN they find `OD_TRUSTED_PROXY=` documented
- AND the comments explain its intended use

### Requirement: Consistent env var references in README

`deploy/README.md` MUST use canonical variable names consistently and SHALL explain the supported authentication modes.

#### Scenario: Canonical token references

- GIVEN a user reads `deploy/README.md`
- WHEN they follow token-based setup steps
- THEN every setup reference uses `OD_ACCESS_TOKEN`
- AND deprecated `OD_API_TOKEN` is not presented as the active name

#### Scenario: Authentication mode overview

- GIVEN a user wants to choose a deployment auth mode
- WHEN they read the Docker setup guidance
- THEN the docs explain token, trusted-proxy, and Cloudflare Access modes
- AND the docs state when each mode applies

### Requirement: Reverse proxy guidance

Docker deployment docs MUST describe supported reverse-proxy integration and SHOULD prevent users from misdiagnosing origin or CSP behavior.

#### Scenario: nginx or Caddy deployment

- GIVEN a user deploys behind nginx or Caddy
- WHEN they read the proxy guidance
- THEN they see an example with the required forwarded headers
- AND the example is sufficient to reproduce the documented setup

#### Scenario: CSP and origin expectations

- GIVEN a user needs to understand browser restrictions in Docker mode
- WHEN they read the proxy or security guidance
- THEN the docs explain that CSP is handled by the daemon
- AND the docs separate proxy/header issues from CSP behavior

### Requirement: Troubleshooting section

Docker deployment docs MUST include a troubleshooting section for the known setup errors covered by this change.

#### Scenario: Missing access token error

- GIVEN a user sees `ACCESS_TOKEN_REQUIRED`
- WHEN they open troubleshooting
- THEN the docs explain how to configure token-based auth correctly

#### Scenario: Sandboxed iframe origin error

- GIVEN a user sees `Origin: null not allowed`
- WHEN they check troubleshooting
- THEN the docs explain this is expected from sandboxed iframes
- AND they do not frame it as a Docker runtime regression

#### Scenario: Docker Desktop macOS networking

- GIVEN a macOS user hits Docker Desktop networking issues
- WHEN they read troubleshooting
- THEN the docs provide the documented workaround

## Acceptance Criteria

- `.env.example` documents `OD_ACCESS_TOKEN`, `OD_TRUSTED_PROXY`, `OD_CF_ACCESS_TEAM_DOMAIN`, and `OD_CF_ACCESS_AUD`.
- `deploy/README.md` uses canonical auth variable names and explains auth mode selection.
- Docker docs include reverse-proxy examples with header forwarding guidance.
- Troubleshooting covers token, origin, and macOS Docker Desktop networking failures.

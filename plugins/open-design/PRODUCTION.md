# ChatGPT production handoff

The repository now contains the ChatGPT plugin package, MCP Apps UI, and a Streamable HTTP endpoint at `POST /mcp`. This document separates what can be validated in a developer environment from the hosted infrastructure and external registration required for a real Open Design Cloud release.

## Target topology

```text
ChatGPT plugin
  -> .app.json (ChatGPT-assigned asdk_app id)
  -> https://<Open Design MCP host>/mcp
  -> Open Design user OAuth + managed tenant routing
  -> user-owned project/run storage
  -> Open Design Cloud (AMR) model execution and wallet
```

The checked-in daemon can run either as a single Open Design instance or as a managed ChatGPT Cloud gateway. Managed mode exchanges the verified Vela OAuth token for short-lived user control/runtime credentials and starts one isolated child daemon per OAuth subject. Each child receives a data root derived from the gateway's resolved `RUNTIME_DATA_DIR`; raw subjects are hashed before they become directory names.

## Required external work

### 1. Deploy Open Design Cloud OAuth

The Vela API now contains the Better Auth OAuth 2.1 Provider implementation for
this flow. It is feature-gated by `OPENDESIGN_CHATGPT_MCP_RESOURCE_URL`; apply
Vela's OAuth schema migration and set that value to the exact public MCP URL.
Set Vela's `OPENDESIGN_CHATGPT_GATEWAY_SECRET` to the same backend secret as
the Open Design gateway and `OPENDESIGN_CHATGPT_LINK_URL` to a model endpoint
reachable from the managed tenant daemons.
The implementation provides:

- `GET /.well-known/oauth-protected-resource` on the MCP resource host.
- OAuth or OIDC discovery on the Open Design authorization issuer.
- Authorization code flow with PKCE `S256`.
- Unauthenticated dynamic client registration for ChatGPT's public client.
- The `resource` parameter echoed through authorization and token exchange and enforced as token audience.
- User scopes for account read, project read/write, run creation, version restore, and export.
- Short-lived JWT access tokens, refresh, revocation, and per-request audience/scope verification.

Vela also serves the RFC 8414 discovery aliases, preserves the signed OAuth
request through email or social sign-in, and presents an explicit consent page.
The remaining OAuth work is deployment configuration and end-to-end validation
against the public HTTPS MCP endpoint.

The current AMR control key and runtime key are not substitutes for this browser authorization flow. Control keys may be used by trusted Open Design backend services to read the wallet; runtime keys remain execution-only.

### 2. Deploy user-scoped Open Design execution

The repository now includes a single-node managed tenant runner. Set
`OD_CHATGPT_TENANT_MODE=managed` on the public gateway. For each verified OAuth
subject, it calls Vela's `/api/v1/open-design/tenant-credentials` exchange,
starts or reuses a loopback-only child daemon, and injects short-lived personal
control/runtime credentials. Credential expiry never exceeds the OAuth access
token expiry; an expiring credential causes only that tenant daemon to restart,
while its persisted project data remains in the same isolated data root.

Completed raw artifacts are exposed through the gateway's signed-equivalent
capability route at `/chatgpt/preview/<opaque-token>/api/projects/.../raw/...`.
The random 256-bit token is scoped to one active tenant, contains no user id,
permits only read-only raw project assets, and is revoked when that tenant is
restarted or reaped. This keeps iframe previews public enough for ChatGPT
without exposing the child daemon, wallet, run logs, or general REST API.

An external orchestrator remains supported through
`OD_CHATGPT_MCP_TENANT_URL_TEMPLATE`. Configure either managed mode or the
external `{sub}` route. The resource server fails closed rather than falling
back to the gateway's own data root. Vela remains the identity, wallet, and
model gateway; each tenant daemon owns project, run, version, preview, and
export state.

Complex editing needs a tenant-aware Studio deployment. Configure
`OD_CHATGPT_STUDIO_URL_TEMPLATE` only after that deployment can route the
authenticated Open Design user to the same tenant storage. Until then the
managed MCP response deliberately omits `studioUrl` instead of linking to the
gateway's shared root. Preview, polling, versions, restore, and source export
continue to work inside ChatGPT.

### 3. ChatGPT app registration

After the production HTTPS endpoint and OAuth metadata are live:

1. Enable ChatGPT Developer Mode.
2. Create an app pointing to `https://<Open Design MCP host>/mcp`.
3. Complete OAuth configuration and add the ChatGPT callback URL to the authorization server allowlist.
4. Validate tools, resources, and the Artifact card in MCP Inspector and ChatGPT.
5. Copy the assigned `asdk_app_...` id into `.app.json`:

```json
{
  "apps": {
    "open-design": {
      "id": "asdk_app_REPLACE_WITH_ASSIGNED_ID",
      "required": true
    }
  }
}
```

6. Bump the plugin version, refresh the marketplace snapshot, and reinstall the plugin.

## Current endpoint safety

`POST /mcp` uses the following development/self-hosted policy:

- Loopback requests are accepted for local inspection.
- Remote requests are rejected by default.
- `OD_CHATGPT_MCP_TOKEN` (falling back to `OD_API_TOKEN`) enables a static bearer boundary for a trusted single-tenant deployment.
- `OD_CHATGPT_MCP_ALLOW_UNAUTHENTICATED=1` exists only for a short-lived, access-controlled developer tunnel.

Static bearer mode is not the public marketplace identity model. The production edge must verify user OAuth and provide tenant isolation before forwarding to Open Design execution.

## Resource-server configuration

The daemon can act as the OAuth-protected MCP resource server using Vela's JWKS.
RFC 7662 introspection remains available as a compatibility fallback:

| Environment variable | Production meaning |
| --- | --- |
| `OD_PUBLIC_BASE_URL` | Public HTTPS origin of the MCP deployment. |
| `OD_CHATGPT_MCP_RESOURCE_URL` | Exact MCP audience, for example `https://mcp.open-design.ai/mcp`. |
| `OD_CHATGPT_OAUTH_ISSUER` | Vela OAuth issuer, including its Better Auth base path. |
| `OD_CHATGPT_OAUTH_JWKS_URL` | Optional Vela JWT key-set override. By default the daemon uses `<issuer>/jwks`. |
| `OD_CHATGPT_OAUTH_INTROSPECTION_URL` | Optional RFC 7662 fallback when JWKS is not configured. |
| `OD_CHATGPT_OAUTH_CLIENT_ID` | Resource-server introspection client id; used only by the fallback. |
| `OD_CHATGPT_OAUTH_CLIENT_SECRET` | Resource-server introspection client secret; used only by the fallback. |
| `OD_CHATGPT_TENANT_MODE` | Set to `managed` to run isolated per-subject child daemons on the gateway host. |
| `OD_CHATGPT_TENANT_CREDENTIAL_URL` | Optional Vela credential-exchange override; normally derived from the OAuth issuer origin. |
| `OD_CHATGPT_TENANT_GATEWAY_SECRET` | Long random backend secret shared only with Vela's `OPENDESIGN_CHATGPT_GATEWAY_SECRET`. |
| `OD_CHATGPT_TENANT_DAEMON_ENTRY` | Optional daemon CLI entrypoint override for packaged/container deployments. |
| `OD_CHATGPT_TENANT_MAX_ACTIVE` | Maximum concurrently resident tenant daemons on one gateway host; defaults to `8` and fails closed at capacity. |
| `OD_CHATGPT_STUDIO_URL_TEMPLATE` | Tenant-aware HTTPS Studio deep link. Supports `{sub}`, `{projectId}`, `{conversationId}`, and `{entryFile}` placeholders. Omit until Studio routes to the same tenant daemon. |
| `OD_CHATGPT_MCP_TENANT_URL_TEMPLATE` | Alternative external per-user backend URL containing `{sub}`, for example `https://{sub}.tenant.open-design.internal`. |
| `OD_CHATGPT_WIDGET_FRAME_DOMAINS` | Comma-separated HTTPS origins allowed to render hosted Artifact previews inside the card. |

For the Vela deployment, set `OD_CHATGPT_OAUTH_ISSUER` to its Better Auth issuer (for example `https://<vela-api>/api/auth`) and set `OD_CHATGPT_MCP_RESOURCE_URL` to the same exact public MCP URL used by Vela's `OPENDESIGN_CHATGPT_MCP_RESOURCE_URL`. The protected-resource document is served at both `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`. JWT validation checks the Vela issuer, signature, expiry, exact MCP audience, required per-tool scope, and a non-empty subject. OAuth mode refuses to use shared storage: it requires either managed tenant mode or the external tenant URL template.

Each published tool also declares its minimum OAuth scope in its descriptor. The server emits both the current top-level `securitySchemes` form and the `_meta.securitySchemes` compatibility form because the repository's MCP SDK currently preserves extension metadata while older MCP clients may strip unknown top-level fields. Runtime authorization reuses the same tool-to-scope mapping, so the consent description and enforcement cannot drift independently.

The ChatGPT V1 server exposes only account, catalog, project creation, Cloud generation/progress, version, and export operations. Local active-context, local-agent execution, arbitrary file mutation, plugin execution, and deletion tools are not published with the ChatGPT plugin. When Cloud balance is insufficient, the card offers recharge first and explains that local Code Agent/BYOK modes remain available inside Open Design.

## Release acceptance

- A new ChatGPT user is sent through Open Design sign-in and consent.
- The account card shows that user's identity and wallet, never a shared service account.
- Website, prototype, presentation, and design-system runs write only to that user's tenant.
- The server maps the four supported artifact types to `frontend-design`, `frontend-design`, `slides`, and `design-md`; unsupported artifact types are rejected.
- A generation run cannot start until the five-field working brief is marked confirmed.
- Tool descriptors expose the minimum OAuth scope for every V1 operation, and a token missing that scope receives an OAuth challenge.
- Insufficient balance offers recharge first and local Code Agent/BYOK as a handoff, without exposing credentials.
- Progress survives repeated polling and a ChatGPT conversation restart.
- The completed Artifact card shows a real preview.
- A managed preview capability cannot read wallet, run, or non-raw project APIs and stops working after tenant reap.
- `studioUrl` is exposed only when its configured tenant-aware route opens the same user's project.
- Version list/restore works against the correct artifact.
- Project source exports as a ZIP directly in ChatGPT. Rendered PDF/image/PPTX formats are not claimed by V1 unless a hosted Open Design renderer is added and separately accepted.
- Revoked or expired tokens return an OAuth challenge and never fall back to another user.

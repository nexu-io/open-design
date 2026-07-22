# ChatGPT production handoff

The repository now contains the ChatGPT plugin package, MCP Apps UI, and a Streamable HTTP endpoint at `POST /mcp`. This document separates what can be validated in a developer environment from the hosted infrastructure and external registration required for a real Open Design Cloud release.

## Target topology

```text
ChatGPT plugin
  -> open-design-basics + one of eight artifact skills
  -> request-specific knownAnswers + QuestionForm discovery
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

An external orchestrator remains supported through
`OD_CHATGPT_MCP_TENANT_URL_TEMPLATE`. Configure either managed mode or the
external `{sub}` route. The resource server fails closed rather than falling
back to the gateway's own data root. Vela remains the identity, wallet, and
model gateway; each tenant daemon owns project, run, version, preview, and
export state.

### 3. ChatGPT app registration

After the production HTTPS endpoint and OAuth metadata are live:

1. Enable ChatGPT Developer Mode.
2. Create an app pointing to `https://<Open Design MCP host>/mcp`.
3. Complete OAuth configuration and add the ChatGPT callback URL to the authorization server allowlist.
4. Validate the nine V1 tools, all eight artifact types, resources, and Artifact Card v10 in MCP Inspector and ChatGPT.
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
| `OD_CHATGPT_CAPABILITY_SIGNING_SECRET` | Optional independent 32+ byte HMAC secret for expiring preview and Studio links. Defaults to the tenant gateway secret. |
| `OD_CHATGPT_CAPABILITY_TTL_SECONDS` | Lifetime of signed preview/Studio capabilities; defaults to one hour and is capped at 24 hours. |
| `OD_CHATGPT_TENANT_DAEMON_ENTRY` | Optional daemon CLI entrypoint override for packaged/container deployments. |
| `OD_CHATGPT_TENANT_MAX_ACTIVE` | Maximum concurrently resident tenant daemons on one gateway host; defaults to `8` and fails closed at capacity. |
| `OD_CHATGPT_MCP_TENANT_URL_TEMPLATE` | Alternative external per-user backend URL containing `{sub}`, for example `https://{sub}.tenant.open-design.internal`. |
| `OD_CHATGPT_WIDGET_FRAME_DOMAINS` | Comma-separated HTTPS origins allowed to render hosted Artifact previews inside the card. |

For the Vela deployment, set `OD_CHATGPT_OAUTH_ISSUER` to its Better Auth issuer (for example `https://<vela-api>/api/auth`) and set `OD_CHATGPT_MCP_RESOURCE_URL` to the same exact public MCP URL used by Vela's `OPENDESIGN_CHATGPT_MCP_RESOURCE_URL`. The protected-resource document is served at both `/.well-known/oauth-protected-resource` and `/.well-known/oauth-protected-resource/mcp`. JWT validation checks the Vela issuer, signature, expiry, exact MCP audience, required per-tool scope, and a non-empty subject. OAuth mode refuses to use shared storage: it requires either managed tenant mode or the external tenant URL template.

Managed mode rewrites every child-daemon loopback preview and Studio URL before
it reaches ChatGPT. Preview iframes use a signed, project-scoped capability path;
Studio links exchange a signed capability for an HttpOnly, SameSite session and
route all web API calls to that OAuth subject's daemon. The public reverse proxy
must preserve the original public `Host`, expose the signed ChatGPT paths plus
the static Studio and `/api/*`, and leave `OD_API_TOKEN` enabled. Requests with
neither the private daemon bearer nor a valid Studio cookie must receive 401.

Each published tool declares its authentication policy in its descriptor. `collect_brief` and its exact widget resources are public so ChatGPT can render the brief before sign-in; account, project, run, version, and export operations remain OAuth-protected. The server emits both the current top-level `securitySchemes` form and the `_meta.securitySchemes` compatibility form because the repository's MCP SDK currently preserves extension metadata while older MCP clients may strip unknown top-level fields. Runtime authorization reuses the same tool-to-scope mapping, so the consent description and enforcement cannot drift independently.

Dynamic discovery stays on the host-model side of that public boundary. The
active Basics plus artifact skill reads the current user request, extracts
settled decisions into `knownAnswers`, and constructs a request-specific
`questionForm` using the shared Open Design QuestionForm contract. The public
`collect_brief` tool validates and renders those supplied values; it does not
launch an anonymous Open Design agent run or choose questions from a universal
preset. This keeps pre-sign-in rendering narrow while matching the Open Design
client's dynamic decision policy.

The ChatGPT V1 server exposes only nine operations: choice-only brief collection, account status, project creation, Cloud generation/progress/cancel, version list/restore, and export. Local active-context, local-agent execution, arbitrary file mutation, generic plugin execution, and deletion tools are not published with the ChatGPT plugin. When Cloud balance is insufficient, the card offers recharge first and explains that local Code Agent/BYOK modes remain available inside Open Design.

The package contributes nine skills: shared `open-design-basics` plus focused
website, product-prototype, presentation, design-system, image, video, audio,
and document skills. The retired catch-all `create-with-open-design` skill must
not ship. The three typed calls—`collect_brief`, `create_project`, and
`start_run`—must carry the same explicit `artifactType`; in particular,
`create_project` requires it so the server initializes the matching project
kind before generation.

Artifact Card v10 renders the `questionForm` supplied by the active skill. A
normal incomplete brief asks 2–3 unknown, outcome-changing decisions and no
generated form exceeds 5 questions. Known decisions are removed; remaining
questions are localized, use stable English ids and values, and are prefilled
with recommended defaults. Only radio, checkbox, select, switch, and
direction-card controls are allowed. The card does not repeat the host's Open
Design identity with an internal header, logo, or subtitle.

## Release acceptance

After the public gateway and Vela OAuth provider are deployed, run the
production verifier before registering the app:

```bash
pnpm exec tsx plugins/open-design/scripts/verify-production.ts \
  --mcp-url https://mcp.open-design.ai/mcp \
  --issuer https://<vela-api>/api/auth
```

It checks HTTPS protected-resource metadata, the exact audience and issuer,
OAuth authorization/refresh grants, PKCE S256, public dynamic registration,
JWKS, V1 scopes, and the unauthenticated Bearer challenge. To test a real
personal account and wallet without putting a token in shell history:

```bash
OD_CHATGPT_TEST_ACCESS_TOKEN=<short-lived-user-token> \
pnpm exec tsx plugins/open-design/scripts/verify-production.ts \
  --mcp-url https://mcp.open-design.ai/mcp \
  --issuer https://<vela-api>/api/auth
```

For the final marketplace gate, add `--require-app-id` after ChatGPT Developer
Mode registration. `--json` is available for CI or deployment automation. The
verifier is read-only: it lists tools and reads the signed-in user's account and
wallet, but does not create a project or spend balance.

- A new ChatGPT user is sent through Open Design sign-in and consent.
- The account card shows that user's identity and wallet, never a shared service account.
- Website, product-prototype, presentation, design-system, image, video, audio, and document runs write only to that user's tenant.
- The server accepts exactly those eight artifact types. Website and product prototype map to `frontend-design`, presentation to `slides`, design system to `design-md`, image/video/audio to `od-media-generation`, and Document V1 to the web-first document contract on `frontend-design`; unsupported artifact types are rejected.
- Image, video, and audio runs produce readable media binaries in the project. A prompt, plan, storyboard, placeholder, or metadata-only response fails acceptance.
- Document V1 produces an editable `document.md` and polished print-ready `index.html` browser preview suitable for later PDF export. It must not claim native DOCX output.
- `create_project` rejects descriptors that omit `artifactType`, and all later calls preserve the same type.
- A generation run cannot start until the request-specific high-impact decisions are either known, inferred under an explicit “just build” instruction, or confirmed through the dynamic brief.
- Tool descriptors expose the minimum OAuth scope for every V1 operation, and a token missing that scope receives an OAuth challenge.
- Insufficient balance offers recharge first and local Code Agent/BYOK as a handoff, without exposing credentials.
- Progress survives repeated polling and a ChatGPT conversation restart.
- Two materially different requests for the same artifact type produce decision questions and options tailored to each request, not an identical generic questionnaire.
- Decisions already supplied by the user appear in `knownAnswers` and are absent from `questionForm.questions`; a normal form asks 2–3 questions and every form stays within the hard maximum of 5.
- Every dynamic question is localized to the chat language, has a valid recommended `defaultValue`, uses only radio, checkbox, select, switch, or direction cards, and exposes no editable text surface.
- Submitting the Custom UI returns `[form answers — <questionForm.id>]` with stable `[value: ...]` values; the next turn consumes those values and does not ask the same decision again.
- Artifact Card v10 has no internal OpenDesign header, logo, or subtitle.
- The completed Artifact card shows a real preview for websites, prototypes, presentations, media, and documents. Design systems instead show a real generated `DESIGN.md` in Studio.
- Preview and Studio URLs contain no loopback host, raw OAuth subject, OAuth token, or Vela runtime credential; tampered and expired capabilities fail closed.
- Opening Studio routes API reads and writes to the same subject and project that produced the ChatGPT result.
- Version list/restore works against the correct artifact.
- Source ZIP downloads in ChatGPT; rendered PDF/image/PPTX export opens or downloads from the hosted Open Design renderer.
- Revoked or expired tokens return an OAuth challenge and never fall back to another user.

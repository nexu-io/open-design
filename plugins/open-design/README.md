# Open Design for ChatGPT

This is the first-party ChatGPT plugin package for Open Design. It uses the official plugin layout from day one. The product connection is exclusively the hosted ChatGPT app in `.app.json`; the first version does not register or fall back to a local stdio MCP server.

## First version

- Create websites, product prototypes, and presentations.
- Extract or apply a reusable design system.
- Confirm audience, outcome, content/flows, visual direction, and output format in chat; `start_run` requires that structured brief with `confirmed: true`.
- Show generation progress and render the result card through the MCP Apps UI resource; the card polls in place through the standard MCP Apps bridge instead of remounting on every status check.
- Preview the Artifact, list or restore versions, and export project source directly from the ChatGPT card.
- Continue complete, complex editing in Open Design studio when the tenant-aware handoff is available.
- Use the signed-in Open Design Cloud balance by default, with recharge and local Code Agent/BYOK fallback guidance.

## Developer validation

1. Start a single-tenant Open Design test deployment and sign in to Open Design Cloud.
2. Point MCP Inspector or ChatGPT Developer Mode directly at that deployment's `POST /mcp` endpoint.
3. Validate the hosted V1 tools and Artifact card through Streamable HTTP.
4. Add this repository marketplace in Codex developer settings to validate the official plugin package shape and skill discovery.
5. Restart the desktop app after changing plugin manifests.

The ChatGPT Apps path uses Streamable HTTP at `POST /mcp`; remote access is denied by default unless a trusted deployment configures its OAuth boundary. Loopback acceptance exists only to inspect the same hosted V1 contract locally—it does not register a local MCP capability in the published plugin.

The hosted `POST /mcp` surface is intentionally narrower than the engineering MCP surface: it exposes only the Cloud V1 website/prototype/presentation/Design System workflow plus account status, progress, versions, and export. It does not expose arbitrary file writes, project deletion, local active context, local-agent execution, or generic plugin execution.

## Hosted app handoff

The checked-in `.app.json` intentionally has an empty `apps` object. ChatGPT assigns the real `asdk_app_...` id only after the HTTPS MCP endpoint is registered in developer mode; add that assigned id before publishing the marketplace release.

Production user linking uses the OAuth 2.1 provider implemented in Vela: discovery, dynamic public-client registration, authorization code + PKCE, consent, refresh tokens, and audience-bound JWT access tokens. The public MCP gateway includes managed tenant mode, which maps the verified subject to isolated Open Design execution storage and short-lived personal Vela credentials. A real release still requires deploying that gateway behind public HTTPS and registering the assigned ChatGPT App ID.

Managed mode rewrites loopback artifact URLs to an opaque, tenant-scoped,
read-only preview capability on the public MCP origin. Full editing links are
published only when `OD_CHATGPT_STUDIO_URL_TEMPLATE` points at a tenant-aware
Studio deployment; the gateway never sends users to shared Studio storage.

See [PRODUCTION.md](./PRODUCTION.md) for the exact OAuth, tenant-isolation, App ID, and release acceptance handoff.

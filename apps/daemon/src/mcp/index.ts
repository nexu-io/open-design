/**
 * @module mcp
 * Public barrel for the MCP (Model Context Protocol) domain. External daemon
 * code imports MCP capabilities only from here — never from a subdirectory — so
 * the internal split (`core` kernel + `client` / `agent-install` /
 * `live-artifacts` concerns) can move without touching consumers. The
 * `check-barrel-imports` guard enforces that boundary.
 *
 * Re-exports are explicit and named (no `export *`) so the public surface is
 * visible here and name collisions surface at build time. Deliberately omitted:
 * the `_`-prefixed test seams in `client` (`_createMcpIdleExitController`,
 * `_resetWebBaseUrlCache`), which tests white-box through the `client` barrel.
 */

// ── core: config schema + IO ────────────────────────────────────────────────
export {
  inferMcpAuthModeForUrl,
  sanitizeMcpServer,
  sanitizeMcpConfig,
  readMcpConfig,
  writeMcpConfig,
  isManagedProjectCwd,
  buildClaudeMcpJson,
  buildAcpMcpServers,
  buildOpenCodeMcpConfigContent,
  MCP_TEMPLATES,
} from './core/index.js';
export type {
  McpTransport,
  McpAuthMode,
  McpServerConfig,
  McpConfig,
  McpTemplateField,
  McpTemplateCategory,
  McpTemplate,
  AcpMcpServer,
  OpenCodeConfigBuildOptions,
} from './core/index.js';

// ── core: OAuth 2.1 / PKCE flow ─────────────────────────────────────────────
export {
  generateCodeVerifier,
  deriveCodeChallenge,
  generateState,
  discoverProtectedResource,
  discoverAuthServer,
  registerClient,
  getOrRegisterClient,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  PendingAuthCache,
  beginAuth,
} from './core/index.js';
export type {
  ProtectedResourceMetadata,
  AuthorizationServerMetadata,
  RegisteredClient,
  OAuthTokenResponse,
  PendingAuthState,
  AuthorizeUrlInput,
  ExchangeCodeInput,
  RefreshTokenInput,
  BeginAuthInput,
  BeginAuthResult,
} from './core/index.js';

// ── core: token store ───────────────────────────────────────────────────────
export {
  sanitizeTokensFile,
  readTokensFile,
  getToken,
  setToken,
  clearToken,
  readAllTokens,
  isTokenExpired,
} from './core/index.js';
export type { StoredMcpToken, McpTokensFile } from './core/index.js';

// ── core: install-info payload ──────────────────────────────────────────────
export { buildMcpInstallPayload } from './core/index.js';
export type { BuildMcpInstallPayloadInputs, McpInstallPayload } from './core/index.js';

// ── client: stdio MCP server + tool handlers ────────────────────────────────
export {
  runMcpStdio,
  extractRelativeRefs,
  resolveProjectId,
  resolveProjectArg,
  withActiveEcho,
  fetchProjectFile,
  getArtifact,
  getFile,
  createArtifact,
  handleMcpToolCall,
} from './client/index.js';

// ── agent-install: register OD MCP into external agents ─────────────────────
export {
  AGENT_SLUGS,
  isAgentSlug,
  planAgentInstall,
  applyJsonInstall,
  removeJsonInstall,
} from './agent-install/index.js';
export type {
  AgentSlug,
  McpLaunchSpec,
  PlanContext,
  CliInstallPlan,
  JsonInstallPlan,
  ManualInstallPlan,
  InstallPlan,
} from './agent-install/index.js';

// ── live-artifacts: per-run artifact MCP surface ────────────────────────────
export {
  createLiveArtifactsMcpTools,
  handleLiveArtifactsMcpRequest,
  runLiveArtifactsMcpServer,
} from './live-artifacts/index.js';

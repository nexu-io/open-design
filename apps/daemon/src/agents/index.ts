/**
 * @module agents
 *
 * Capability barrel for the agent-interaction domain: connection testing,
 * bring-your-own-key media tools, session resume, and user-facing presentation
 * of a running agent, over a shared SSRF asset-URL guard in `core/`.
 *
 * Import conventions (enforced by `scripts/check-barrel-imports.ts`):
 *   - External daemon code imports agent-interaction symbols only from THIS
 *     root barrel, never from a subdir file.
 *   - Subdirs reach `core/` freely; there are no cross-sibling edges
 *     (`allowedEdges: []`, a pure star).
 *
 * Deliberately NOT in this domain (kept flat as shared kernel — see README.md):
 * `acp.ts`, `pi-rpc.ts` (protocol adapters the runtime layer builds on), and
 * `agents.ts` (a re-export facade over `runtimes/*`). Pulling them in would
 * create a `runtimes → agents → runtimes` import cycle via the agent-def
 * registry.
 */

// --- core/ : SSRF asset-URL guard ---------------------------------------------
export {
  validateBaseUrl,
  validateBaseUrlResolved,
  assertExternalAssetUrl,
  assertAndFetchExternalAsset,
} from './core/index.js';
export type { DnsLookupAddress, DnsLookupFn } from './core/index.js';

// --- connection/ : connection testing, probing, streaming, diagnostics --------
export {
  createAgentSink,
  isSmokeOkReply,
  mergeNoProxyWithLoopbackDefaults,
  proxyDispatcherRequestInit,
  redactSecrets,
  resolveConnectionTestTimeoutMs,
  testAgentConnection,
  testProviderConnection,
  createCopilotStreamHandler,
  diagnoseClaudeCliFailure,
} from './connection/index.js';
export type { ClaudeCliDiagnostic, ClaudeCliDiagnosticInput } from './connection/index.js';

// --- byok/ : bring-your-own-key provider media tools --------------------------
export {
  BYOK_AIHUBMIX_DEFAULT_IMAGE_MODEL,
  BYOK_AIHUBMIX_DEFAULT_SPEECH_MODEL,
  BYOK_AIHUBMIX_DEFAULT_VIDEO_MODEL,
  BYOK_AIHUBMIX_IMAGE_MODELS,
  BYOK_AIHUBMIX_TOOLS,
  BYOK_SENSEAUDIO_DEFAULT_IMAGE_MODEL,
  BYOK_SENSEAUDIO_IMAGE_MODELS,
  BYOK_SENSEAUDIO_TOOLS,
  executeAIHubMixGenerateImage,
  executeAIHubMixGenerateSpeech,
  executeAIHubMixGenerateVideo,
  executeGenerateImage,
  executeGenerateSpeech,
  executeGenerateVideo,
  isAIHubMixImageModel,
  isAIHubMixSpeechModel,
  isAIHubMixVideoModel,
  isSenseAudioImageModel,
} from './byok/index.js';
export type { BYOKToolContext, ImageToolResult } from './byok/index.js';

// --- session/ : agent session capture + resume invalidation -------------------
export {
  computeIncludeStable,
  evaluateResumeInvalidation,
  hashStableInstructions,
  isAgentResumeFailure,
  isAmrResumeFailure,
  isClaudeResumeFailure,
  isCodexResumeFailure,
  isOpencodeResumeFailure,
  persistCapturedAgentSession,
  resolveAgentResumeContext,
} from './session/index.js';
export type {
  AgentResumeContext,
  CapturedAgentSessionResult,
  ResumeInvalidationReason,
} from './session/index.js';

// --- presentation/ : user-facing label + stderr visibility --------------------
export {
  userFacingAgentLabel,
  createAgentStderrVisibilityFilter,
} from './presentation/index.js';

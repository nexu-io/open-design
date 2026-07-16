/**
 * @module analytics/events/mappers
 * Enum mapping helpers (code <-> CSV wire format).
 */
import type { AnalyticsConfigureGlobals, TrackingConfigureAvailability, TrackingConfigureType, TrackingRuntimeType } from '../public-params.js';
import type { TrackingArtifactKind, TrackingByokProviderId, TrackingCliProviderId, TrackingExecutionMode, TrackingFeedbackProviderId, TrackingFidelity, TrackingFileSizeBucket, TrackingFileType, TrackingNewProjectTab, TrackingProjectKind } from './shared-enums.js';
import type { TrackingSessionMode, TrackingSettingsArea } from './ui-click.js';
// ---- Enum mapping helpers (code ↔ CSV wire format) -----------------------

// Map the wire `ChatSessionMode` ('design' | 'chat' | 'plan') to the analytics enum.
// The composer's "Ask" mode is `chat` on the wire; analytics uses `ask` so
// the dashboards read in the product's own language. Anything unrecognized
// buckets into `ask` (the lighter default).
export function sessionModeToTracking(
  mode: string | null | undefined,
): TrackingSessionMode {
  if (mode === 'design') return 'design';
  if (mode === 'plan') return 'plan';
  return 'ask';
}

// Code `ProjectKind` from packages/contracts/src/api/projects.ts:
//   'prototype' | 'deck' | 'template' | 'other' | 'brand' | 'image' | 'video' | 'audio'
// Discriminates HyperFrames from generic AI video. A HyperFrames project is
// stored as `kind: 'video'` with `metadata.videoModel === 'hyperframes-html'`
// (the local HTML→MP4 renderer); callers pass that videoModel through so the
// analytics layer can split it out into its own `project_kind`. See the
// `'hyperframes'` member docblock on `TrackingProjectKind`.
const HYPERFRAMES_VIDEO_MODEL = 'hyperframes-html';

// Discriminators read off a project's persisted `metadata` to split the coarse
// product `kind` into the finer analytics `project_kind` (so a created
// project's kind matches the Home task_chip the user picked). All optional —
// when none are supplied the function behaves exactly as the legacy
// `(kind, videoModel)` mapping.
export interface ProjectKindTrackingHints {
  fidelity?: string | null | undefined;
  intent?: string | null | undefined;
  platform?: string | null | undefined;
  platformTargets?: readonly string[] | null | undefined;
}

function isMobileSurface(hints: ProjectKindTrackingHints | undefined): boolean {
  const mobile = (target: string | null | undefined): boolean =>
    target === 'mobile-ios' || target === 'mobile-android';
  if (mobile(hints?.platform)) return true;
  return (hints?.platformTargets ?? []).some(mobile);
}

export function projectKindToTracking(
  kind: string | null | undefined,
  videoModel?: string | null,
  hints?: ProjectKindTrackingHints,
): TrackingProjectKind | null {
  switch (kind) {
    case 'prototype':
      // Prototype subtypes share `kind: 'prototype'` but carry a distinguishing
      // metadata field. Precedence (a prototype matching several): web_clone >
      // live_artifact > wireframe > mobile, then plain prototype.
      if (hints?.intent === 'web-clone') return 'web_clone';
      if (hints?.intent === 'live-artifact') return 'live_artifact';
      if (hints?.fidelity === 'wireframe') return 'wireframe';
      if (isMobileSurface(hints)) return 'mobile';
      return 'prototype';
    case 'deck':
      return 'slide_deck';
    case 'template':
      return 'template';
    case 'other':
      // Documents (resumes / reports / PDFs) ride the generic `other` kind but
      // tag `intent: 'document'` so they split out of catch-all `other`.
      return hints?.intent === 'document' ? 'document' : 'other';
    case 'image':
      return 'image';
    case 'video':
      // HyperFrames rides on the `video` kind; the local-render engine is the
      // only thing that distinguishes it, so route on videoModel here.
      return videoModel === HYPERFRAMES_VIDEO_MODEL ? 'hyperframes' : 'video';
    case 'audio':
      return 'audio';
    case 'brand':
      return 'brand';
    case 'live-artifact':
    case 'live_artifact':
      return 'live_artifact';
    case 'web-clone':
    case 'web_clone':
      return 'web_clone';
    default:
      return null;
  }
}

// Convenience wrapper: derive the analytics `project_kind` straight from a
// project's persisted metadata, forwarding the subtype discriminators
// (fidelity / intent / platform) so prototype/other projects resolve to their
// finer kind. Prefer this at every call site that has the full metadata object.
export function projectKindFromMetadataToTracking(
  metadata:
    | {
        kind?: string | null;
        videoModel?: string | null;
        fidelity?: string | null;
        intent?: string | null;
        platform?: string | null;
        platformTargets?: readonly string[] | null;
      }
    | null
    | undefined,
): TrackingProjectKind | null {
  return projectKindToTracking(metadata?.kind, metadata?.videoModel, {
    fidelity: metadata?.fidelity,
    intent: metadata?.intent,
    platform: metadata?.platform,
    platformTargets: metadata?.platformTargets,
  });
}

// Code `CreateTab` from apps/web/src/components/NewProjectPanel.tsx:
//   'prototype' | 'live-artifact' | 'deck' | 'template' | 'image' | 'video' | 'audio' | 'other'
export function createTabToTracking(tab: string): TrackingNewProjectTab {
  switch (tab) {
    case 'prototype':
      return 'prototype';
    case 'deck':
      return 'slide_deck';
    case 'template':
      return 'from_template';
    case 'live-artifact':
      return 'live_artifact';
    case 'image':
    case 'video':
    case 'audio':
      return 'media';
    case 'other':
      return 'other';
    default:
      return 'prototype';
  }
}

// Code `fidelity` is 'wireframe' | 'high-fidelity'; the CSV uses underscore.
export function fidelityToTracking(
  fidelity: string | null | undefined,
): TrackingFidelity {
  if (fidelity === 'wireframe') return 'wireframe';
  if (fidelity === 'high-fidelity') return 'high_fidelity';
  return 'not_applicable';
}

// Code `mode` ('daemon' | 'api') → CSV execution_mode.
export function executionModeToTracking(
  mode: string | null | undefined,
): TrackingExecutionMode {
  return mode === 'daemon' ? 'local_cli' : 'byok';
}

// Model id bucket for analytics. `'default'` represents "user did not pick
// a specific model — went with the agent's own default". This is a real,
// analysable bucket, distinct from `null/unknown` which previously masked
// both "no selection" and "join failed". Callers that have a non-empty
// model string pass it through unchanged.
export function modelIdForTracking(model: string | null | undefined): string {
  const trimmed = typeof model === 'string' ? model.trim() : '';
  return trimmed.length > 0 ? trimmed : 'default';
}

// Daemon agent id (apps/daemon/src/agents.ts) → CSV cli_provider_id.
export function agentIdToTracking(agentId: string | null | undefined): TrackingCliProviderId {
  switch (agentId) {
    case 'claude':
      return 'claude_code';
    case 'codex':
      return 'codex_cli';
    case 'devin':
      return 'devin_for_terminal';
    case 'gemini':
      return 'gemini_cli';
    case 'opencode':
      return 'opencode';
    case 'hermes':
      return 'hermes';
    case 'kimi':
      return 'kimi_cli';
    case 'cursor-agent':
      return 'cursor_agent';
    case 'qwen':
      return 'qwen_code';
    case 'qoder':
      return 'qoder_cli';
    case 'copilot':
      return 'github_copilot_cli';
    case 'pi':
      return 'pi';
    case 'kilo':
      return 'kilo';
    case 'amr':
      return 'amr';
    default:
      return 'other';
  }
}

export function feedbackAgentProviderIdToTracking(
  agentId: string | null | undefined,
): TrackingFeedbackProviderId {
  switch (agentId) {
    case 'anthropic-api':
      return byokProtocolToTracking('anthropic') ?? 'other';
    case 'openai-api':
      return byokProtocolToTracking('openai') ?? 'other';
    case 'azure-openai-api':
      return byokProtocolToTracking('azure') ?? 'other';
    case 'google-gemini-api':
      return byokProtocolToTracking('google') ?? 'other';
    case 'ollama-cloud-api':
      return byokProtocolToTracking('ollama') ?? 'other';
    case 'senseaudio-api':
      return byokProtocolToTracking('senseaudio') ?? 'other';
    default:
      return agentIdToTracking(agentId);
  }
}

// Code `apiProtocol` → v2 BYOK provider_id. The v1 wire values
// (azure / ollama / google) get the v2 spelling here.
export function byokProtocolToTracking(
  protocol: string | null | undefined,
): TrackingByokProviderId | null {
  switch (protocol) {
    case 'anthropic':
      return 'anthropic';
    case 'openai':
      return 'openai';
    case 'azure':
    case 'azure_openai':
      return 'azure_openai';
    case 'google':
    case 'google_gemini':
      return 'google_gemini';
    case 'ollama':
    case 'ollama_cloud':
      return 'ollama_cloud';
    case 'senseaudio':
      return 'senseaudio';
    case 'aihubmix':
      return 'aihubmix';
    case 'bedrock':
      return null;
    default:
      return null;
  }
}

// Code `SettingsSection` from apps/web/src/components/SettingsDialog.tsx
// (the v0.8 settings sidebar). Sections that have no CSV counterpart still
// get emitted under the same event so dashboards can group them.
export function settingsSectionToTracking(
  section: string,
): TrackingSettingsArea {
  switch (section) {
    case 'execution':
      return 'configure_execution_mode';
    case 'instructions':
      return 'instructions';
    case 'media':
      return 'media_providers';
    case 'language':
      return 'language';
    case 'appearance':
      return 'appearance';
    case 'pet':
      return 'pets';
    case 'about':
      return 'about';
    case 'composio':
    case 'integrations':
    case 'connectors':
      return 'connectors';
    case 'mcpClient':
      return 'external_mcp';
    case 'mcp_server':
      return 'mcp_server';
    case 'orbit':
      return 'orbit';
    case 'skills':
      return 'skills';
    case 'designSystems':
      return 'design_systems';
    case 'critiqueTheater':
      return 'design_review';
    case 'projectLocations':
      return 'project_locations';
    case 'memory':
      return 'memory';
    case 'privacy':
      return 'privacy';
    case 'notifications':
      return 'notifications';
    case 'externalMcp':
      return 'external_mcp';
    default:
      return 'configure_execution_mode';
  }
}

// FileViewer renderer.id / file.kind → CSV artifact_kind.
export function artifactKindToTracking(args: {
  rendererId?: string | null;
  fileKind?: string | null;
}): TrackingArtifactKind {
  const { rendererId, fileKind } = args;
  if (rendererId === 'html' || rendererId === 'deck-html' || rendererId === 'react-component') {
    return 'html';
  }
  if (rendererId === 'markdown') return 'markdown';
  if (rendererId === 'svg') return 'image';
  if (fileKind === 'image' || fileKind === 'sketch') return 'image';
  if (fileKind === 'video') return 'video';
  if (fileKind === 'audio') return 'audio';
  if (
    fileKind === 'pdf' ||
    fileKind === 'document' ||
    fileKind === 'presentation' ||
    fileKind === 'spreadsheet'
  ) {
    return 'doc';
  }
  return 'unknown';
}

// Bytes → CSV file_size_bucket (CSV row 48). 1 MB == 1024 * 1024 bytes.
export function fileSizeBucketToTracking(bytes: number): TrackingFileSizeBucket {
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return '0_1mb';
  if (mb < 10) return '1_10mb';
  if (mb < 100) return '10_100mb';
  return '100mb_plus';
}

// MIME / extension → CSV file_type.
export function fileTypeToTracking(args: {
  mime?: string | null;
  isFolder?: boolean;
  isZip?: boolean;
}): TrackingFileType {
  if (args.isFolder) return 'folder';
  if (args.isZip) return 'zip';
  const m = args.mime ?? '';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  return 'other';
}

// Pure helper deriving the v2 configure-state triplet from the execution
// config + detected agent list. Used both by the web client (to re-register
// the PostHog globals when the user switches mode / agent / BYOK
// credentials) and by the daemon `/api/runs` handler (so the
// authoritative run_created/finished captures carry consistent values).
//
// Inputs are intentionally narrow — caller passes only the bits that
// matter for analytics — so the helper has no coupling to the web's
// `AppConfig` shape or the daemon's `detectAgents` return type.
export interface DeriveConfigureGlobalsInput {
  // 'daemon' = Local CLI execution mode; 'api' = BYOK execution mode.
  // Anything else is treated as unknown.
  mode?: string | null;
  // Currently selected CLI agent id, if any.
  agentId?: string | null;
  // Available CLI agents detected on the user's machine. Only the
  // `available` flag is read; the helper does not care about ids.
  agents?: ReadonlyArray<{ id: string; available?: boolean }>;
  // Whether a BYOK key/url has been saved (web client only — daemon
  // can leave this undefined).
  byokConfigured?: boolean;
  // Whether the user has completed AMR (vela) sign-in. AMR ships with the
  // app, so authorization — not installation — is its "configured" signal.
  amrAuthorized?: boolean;
}

export function deriveConfigureGlobals(
  input: DeriveConfigureGlobalsInput,
): AnalyticsConfigureGlobals {
  const agents = input.agents ?? [];
  // The AMR runtime is bundled with the app, so its agent row must not
  // count as a user-configured local CLI: with it included every install
  // reports 'local_cli' and the 'amr'/'none' buckets can never appear.
  // AMR's configured signal is `amrAuthorized` (sign-in), not detection.
  const cliAgents = agents.filter((a) => a.id !== 'amr');
  const hasAvailableCli = cliAgents.some((a) => a.available === true);
  const selectedAgent = input.agentId
    ? agents.find((a) => a.id === input.agentId)
    : undefined;
  const selectedAgentAvailable = selectedAgent?.available === true;
  const byokConfigured = input.byokConfigured === true;
  const amrAuthorized = input.amrAuthorized === true;

  // 'api' mode means BYOK is the active execution path, so treat it as a
  // configured BYOK signal even when the caller cannot see the saved key
  // (the daemon never can). 'daemon' mode used to hardcode 'local_cli',
  // which made 'none' unreachable on desktop; the type now follows what
  // is actually configured, with mode only steering availability below.
  const byokSignal = byokConfigured || input.mode === 'api';
  let configureType: TrackingConfigureType;
  if (hasAvailableCli && byokSignal) {
    configureType = 'both';
  } else if (hasAvailableCli) {
    configureType = 'local_cli';
  } else if (byokSignal) {
    configureType = 'byok';
  } else if (amrAuthorized) {
    configureType = 'amr';
  } else {
    configureType = 'none';
  }

  let configureAvailability: TrackingConfigureAvailability;
  if (input.mode === 'daemon') {
    configureAvailability = selectedAgentAvailable
      ? 'available'
      : 'unavailable';
  } else if (input.mode === 'api') {
    configureAvailability = byokConfigured ? 'available' : 'unavailable';
  } else if (hasAvailableCli || byokConfigured || amrAuthorized) {
    configureAvailability = 'available';
  } else {
    configureAvailability = 'unknown';
  }

  // The single active runtime — NOT the configure cascade, so there is no
  // 'both'. The active execution path is steered by `mode` (the user's
  // selected execution mode) first, then the selected agent: the bundled
  // `amr` agent id means AMR cloud; otherwise local CLI when one is the
  // selected/available runtime. BYOK only surfaces when `mode === 'api'` or a
  // saved key is visible — the daemon never sees a key (mode is pinned to
  // 'daemon' there), so daemon-side run events rely on the web client's
  // run-request override to report 'byok'. Falls back through the same
  // capability signals as configure_type for the ambient (no-mode) case.
  let runtimeType: TrackingRuntimeType;
  if (input.mode === 'api') {
    // `api` mode IS the active BYOK execution path. It must win over a
    // remembered `agentId === 'amr'`: switching AMR → BYOK only flips
    // `config.mode` and leaves `config.agentId` as 'amr' (see App.tsx mode
    // switch), so checking agentId first would mislabel live BYOK runs as
    // amr_cloud.
    runtimeType = 'byok';
  } else if (input.agentId === 'amr') {
    runtimeType = 'amr_cloud';
  } else if (input.mode === 'daemon' && selectedAgentAvailable) {
    runtimeType = 'local_cli';
  } else if (hasAvailableCli) {
    runtimeType = 'local_cli';
  } else if (byokSignal) {
    runtimeType = 'byok';
  } else if (amrAuthorized) {
    runtimeType = 'amr_cloud';
  } else {
    runtimeType = 'none';
  }

  return {
    has_available_configure_cli: hasAvailableCli,
    configure_type: configureType,
    configure_availability: configureAvailability,
    runtime_type: runtimeType,
    // Independent per-path runnable flags (no cascade masking — see
    // AnalyticsConfigureGlobals). `cli_runnable` mirrors
    // `has_available_configure_cli`; `byok_runnable` uses the actually-saved
    // key signal (not the `mode === 'api'` fallback, which can be true with no
    // key yet); `amr_runnable` is sign-in.
    cli_runnable: hasAvailableCli,
    byok_runnable: byokConfigured,
    amr_runnable: amrAuthorized,
  };
}

// Normalize the "other" custom-reason free text for transport. Trims
// whitespace and returns empty string when the field is blank or the user
// didn't select the "other" option. Callers should pass the raw text only
// when `has_custom_reason` is true; the helper itself is permissive.
export function normalizeCustomReason(
  text: string | null | undefined,
): string {
  return (text ?? '').trim();
}

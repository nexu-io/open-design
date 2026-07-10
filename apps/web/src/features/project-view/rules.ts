// Pure decision rules for the project-view slice: conversation merges,
// split-panel math, brand-browser URL parsing, workspace-context equality,
// stored-value type guards, BYOK media seeds, daemon-disconnect predicates, and
// the live-artifact event accumulator. Every function here is transport- and
// DOM-global-free (ADR 0002); they move byte-for-byte out of the former
// `ProjectView` god-component so they can be unit-tested without a render.
import type {
  AppConfig,
  ChatAttachment,
  ChatMessage,
  Conversation,
  LiveArtifactEventItem,
  PreviewComment,
  ProjectMetadata,
} from '../../types';
import type {
  BrandStatus,
  ByokMediaDefaults,
  RunContextSelection,
  WorkspaceContextItem,
} from '@open-design/contracts';
import { mediaModelProviderId } from '../../media/models';
import {
  GENERIC_DAEMON_DISCONNECT_CODE,
  GENERIC_DAEMON_DISCONNECT_MESSAGE,
  MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
  MIN_NORMAL_SPLIT_WIDTH,
  MIN_WORKSPACE_PANEL_WIDTH,
  SPLIT_RESIZE_HANDLE_WIDTH,
} from './constants';
import type { BrowserExtractionUrlParts, ProjectSplitStyle } from './types';

// --- Conversation merges -------------------------------------------------

export function mergeSavedPreviewComment(current: PreviewComment[], saved: PreviewComment): PreviewComment[] {
  const existingIndex = current.findIndex((comment) => comment.id === saved.id);
  if (existingIndex < 0) return [...current, saved];
  return current.map((comment, index) => (index === existingIndex ? saved : comment));
}

function mergeServerMessageWithLocal(server: ChatMessage, local?: ChatMessage): ChatMessage {
  if (!local) return server;
  const merged: ChatMessage = { ...server };
  if (local.role === 'assistant' && server.role === 'assistant') {
    if ((local.content?.length ?? 0) > (server.content?.length ?? 0)) {
      merged.content = local.content;
    }
    if ((local.events?.length ?? 0) > (server.events?.length ?? 0)) {
      merged.events = local.events;
    }
  }
  if (!server.producedFiles?.length && local.producedFiles?.length) {
    merged.producedFiles = local.producedFiles;
  }
  if (!server.preTurnFileNames?.length && local.preTurnFileNames?.length) {
    merged.preTurnFileNames = local.preTurnFileNames;
  }
  if (!server.lastRunEventId && local.lastRunEventId) {
    merged.lastRunEventId = local.lastRunEventId;
  }
  if (!server.startedAt && local.startedAt) {
    merged.startedAt = local.startedAt;
  }
  if (!server.endedAt && local.endedAt) {
    merged.endedAt = local.endedAt;
  }
  if (!server.runStatus && local.runStatus) {
    merged.runStatus = local.runStatus;
  }
  return merged;
}

export function mergeServerMessagesIntoConversation(
  current: ChatMessage[],
  serverMessages: ChatMessage[],
): ChatMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const serverIds = new Set(serverMessages.map((message) => message.id));
  const merged = serverMessages.map((message) =>
    mergeServerMessageWithLocal(message, currentById.get(message.id)),
  );
  for (const message of current) {
    if (!serverIds.has(message.id)) merged.push(message);
  }
  return merged;
}

export function ensureConversationPresent(
  conversations: Conversation[],
  conversationId: string,
  projectId: string,
): Conversation[] {
  if (conversations.some((conversation) => conversation.id === conversationId)) {
    return conversations;
  }
  const now = Date.now();
  return [
    {
      id: conversationId,
      projectId,
      title: null,
      createdAt: now,
      updatedAt: now,
    },
    ...conversations,
  ];
}

// --- Split-panel math ----------------------------------------------------

export function workspacePanelMinWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MIN_WORKSPACE_PANEL_WIDTH;
  return splitWidth < MIN_NORMAL_SPLIT_WIDTH ? 0 : MIN_WORKSPACE_PANEL_WIDTH;
}

export function maxChatPanelWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MAX_CHAT_PANEL_WIDTH;
  const workspaceMinWidth = workspacePanelMinWidthForSplit(splitWidth);
  const viewportAwareMax = splitWidth - SPLIT_RESIZE_HANDLE_WIDTH - workspaceMinWidth;
  return Math.max(0, Math.min(MAX_CHAT_PANEL_WIDTH, Math.floor(viewportAwareMax)));
}

export function clampPreferredChatPanelWidth(width: number): number {
  return Math.min(MAX_CHAT_PANEL_WIDTH, Math.max(MIN_CHAT_PANEL_WIDTH, Math.round(width)));
}

export function clampChatPanelWidth(width: number, maxWidth = MAX_CHAT_PANEL_WIDTH): number {
  const effectiveMax = Math.max(0, Math.min(MAX_CHAT_PANEL_WIDTH, Math.floor(maxWidth)));
  const effectiveMin = Math.min(MIN_CHAT_PANEL_WIDTH, effectiveMax);
  return Math.min(effectiveMax, Math.max(effectiveMin, Math.round(width)));
}

export function projectSplitClassName(workspaceFocused: boolean): string {
  return workspaceFocused ? 'split split-focus' : 'split';
}

export function projectSplitStyle(
  workspaceFocused: boolean,
  chatPanelWidth: number,
  workspacePanelTrack: string,
): ProjectSplitStyle | undefined {
  if (workspaceFocused) return undefined;
  return {
    '--project-chat-panel-width': `${chatPanelWidth}px`,
    '--project-workspace-panel-track': workspacePanelTrack,
    gridTemplateColumns: `${chatPanelWidth}px ${SPLIT_RESIZE_HANDLE_WIDTH}px ${workspacePanelTrack}`,
  };
}

export function applySplitChatPanelWidth(
  split: HTMLDivElement | null,
  width: number,
  workspacePanelTrack: string,
): void {
  if (!split) return;
  split.style.setProperty('--project-chat-panel-width', `${width}px`);
  split.style.gridTemplateColumns =
    `${width}px ${SPLIT_RESIZE_HANDLE_WIDTH}px ${workspacePanelTrack}`;
}

// --- Question-form identity ---------------------------------------------

// React key for the on-screen question form. Deliberately does NOT include the
// form's parsed `id`: there is at most one (first) form per assistant message,
// so `${conversation}:${message}` is already a stable, unique identity for the
// occurrence. Folding the parsed id in would remount the panel mid-stream — the
// preview shows the `discovery` fallback until the body `id` streams in, and a
// form that emits answerable questions before its `id` would flip identity
// while the user is mid-answer, dropping their selections. A distinct later
// form lives in a different assistant message, so it still gets its own key
// (and replays the reveal) without relying on the id.
export function buildQuestionFormKey(
  conversationId: string | null,
  assistantMessageId: string | null,
  hasForm: boolean,
): string | null {
  return conversationId && assistantMessageId && hasForm
    ? `${conversationId}:${assistantMessageId}`
    : null;
}

// --- Brand-browser URL parsing ------------------------------------------

function normalizedBrandBrowserHost(parsed: URL): string {
  const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return parsed.port ? `${hostname}:${parsed.port}` : hostname;
}

export function normalizedBrandBrowserPathname(pathname: string): string {
  const withoutTrailingSlash = pathname.replace(/\/+$/, '');
  return withoutTrailingSlash || '/';
}

export function browserExtractionUrlParts(value: string | null | undefined): BrowserExtractionUrlParts | null {
  const url = value?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return {
      host: normalizedBrandBrowserHost(parsed),
      pathname: normalizedBrandBrowserPathname(parsed.pathname),
      search: parsed.search,
    };
  } catch {
    return null;
  }
}

export function isBrandBrowserHomeRedirectPath(pathname: string): boolean {
  if (pathname === '/home') return true;
  return /^\/[a-z]{2}(?:-[a-z]{2})?$/i.test(pathname);
}

export function brandBrowserSnapshotMatchesSource(
  snapshotBaseUrl: string,
  sourceUrl: string | null | undefined,
): boolean {
  const snapshot = browserExtractionUrlParts(snapshotBaseUrl);
  const source = browserExtractionUrlParts(sourceUrl);
  if (!snapshot || !source || snapshot.host !== source.host) return false;
  if (snapshot.pathname === source.pathname && snapshot.search === source.search) return true;
  return (
    source.pathname === '/'
    && source.search === ''
    && snapshot.search === ''
    && isBrandBrowserHomeRedirectPath(snapshot.pathname)
  );
}

// --- Workspace-context equality -----------------------------------------

export function workspaceContextItemEqual(
  a: WorkspaceContextItem | null,
  b: WorkspaceContextItem | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id === b.id &&
    a.kind === b.kind &&
    a.label === b.label &&
    (a.tabId ?? '') === (b.tabId ?? '') &&
    (a.path ?? '') === (b.path ?? '') &&
    (a.absolutePath ?? '') === (b.absolutePath ?? '') &&
    (a.url ?? '') === (b.url ?? '') &&
    (a.title ?? '') === (b.title ?? '')
  );
}

export function workspaceContextItemsEqual(
  a: WorkspaceContextItem[],
  b: WorkspaceContextItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => workspaceContextItemEqual(item, b[index] ?? null));
}

// --- Stored-value type guards -------------------------------------------

export function isDesignSystemWorkspaceMetadata(metadata: ProjectMetadata | undefined): boolean {
  return metadata?.importedFrom === 'design-system';
}

export function isStoredChatAttachment(value: unknown): value is ChatAttachment {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.path === 'string' &&
    record.path.length > 0 &&
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    (record.kind === 'image' || record.kind === 'file') &&
    (record.size === undefined || typeof record.size === 'number') &&
    (record.order === undefined || typeof record.order === 'number')
  );
}

export function isStoredStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isStoredWorkspaceContextItem(value: unknown): value is WorkspaceContextItem {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    record.id.length > 0 &&
    typeof record.kind === 'string' &&
    record.kind.length > 0 &&
    typeof record.label === 'string' &&
    record.label.length > 0 &&
    (record.tabId === undefined || typeof record.tabId === 'string') &&
    (record.path === undefined || typeof record.path === 'string') &&
    (record.absolutePath === undefined || typeof record.absolutePath === 'string') &&
    (record.url === undefined || typeof record.url === 'string') &&
    (record.title === undefined || typeof record.title === 'string')
  );
}

export function isStoredRunContextSelection(value: unknown): value is RunContextSelection {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    (record.skillIds === undefined || isStoredStringArray(record.skillIds)) &&
    (record.pluginIds === undefined || isStoredStringArray(record.pluginIds)) &&
    (record.mcpServerIds === undefined || isStoredStringArray(record.mcpServerIds)) &&
    (record.connectorIds === undefined || isStoredStringArray(record.connectorIds)) &&
    (
      record.workspaceItems === undefined ||
      (Array.isArray(record.workspaceItems) &&
        record.workspaceItems.every(isStoredWorkspaceContextItem))
    )
  );
}

export function isBrandStatusValue(value: unknown): value is BrandStatus {
  return value === 'extracting' || value === 'needs_input' || value === 'ready' || value === 'failed';
}

export function brandExtractionAllowsEditing(status: BrandStatus | null): boolean {
  return status === 'ready' || status === 'failed';
}

// --- BYOK media seeds ----------------------------------------------------

// The media model the user picked in the New Project → Media dialog, keyed by
// surface. For BYOK providers (AIHubMix) media is produced by the generate_*
// chat tools whose default model comes from the per-request byok*Model field —
// NOT the `od media generate` dispatcher — so without this seed the dialog pick
// is dropped and the conversation falls back to the Settings default. Returns
// undefined for non-media projects (and when the field is empty) so callers fall
// back to the Settings default exactly as before. The daemon re-validates the id
// against the active provider's registry, so a mismatched pick is safely ignored.
export function projectMediaModelSeed(
  metadata: ProjectMetadata | null | undefined,
  surface: 'image' | 'video' | 'speech',
): string | undefined {
  if (!metadata) return undefined;
  if (surface === 'image' && metadata.kind === 'image') {
    return metadata.imageModel?.trim() || undefined;
  }
  if (surface === 'video' && metadata.kind === 'video') {
    return metadata.videoModel?.trim() || undefined;
  }
  if (surface === 'speech' && metadata.kind === 'audio' && metadata.audioKind === 'speech') {
    return metadata.audioModel?.trim() || undefined;
  }
  return undefined;
}

export function projectMediaVoiceSeed(
  metadata: ProjectMetadata | null | undefined,
): string | undefined {
  if (metadata?.kind === 'audio' && metadata.audioKind === 'speech') {
    return metadata.voice?.trim() || undefined;
  }
  return undefined;
}

// Carry the creation-time model pick into the conversation ONLY when it belongs
// to the active BYOK provider. Guards against clobbering a user's Settings
// default with a model from a different provider — e.g. a SenseAudio user whose
// image project was created with the dialog's default `gpt-image-2` keeps their
// configured SenseAudio model instead of being forced to the registry default.
// AIHubMix's live (`aihubmix-` prefixed) ids resolve via mediaModelProviderId
// without waiting on the async catalogue, so the AIHubMix path still seeds.
export function byokModelSeedForProtocol(
  metadata: ProjectMetadata | null | undefined,
  surface: 'image' | 'video' | 'speech',
  protocol: string | undefined,
): string | undefined {
  const picked = projectMediaModelSeed(metadata, surface);
  if (!picked) return undefined;
  return mediaModelProviderId(picked) === protocol ? picked : undefined;
}

export function firstNonBlank(...values: Array<string | null | undefined>): string {
  return values.find((value) => value?.trim())?.trim() ?? '';
}

export function byokMediaDefaultsForRun(input: {
  imageModelOverride: string;
  videoModelOverride: string;
  speechModelOverride: string;
  speechVoiceOverride: string;
  config: Pick<AppConfig, 'byokImageModel' | 'byokVideoModel' | 'byokSpeechModel' | 'byokSpeechVoice'>;
  imageModelOptions: readonly { id: string }[];
  videoModelOptions: readonly { id: string }[];
  speechModelOptions: readonly { id: string }[];
}): ByokMediaDefaults {
  const imageModel = firstNonBlank(
    input.imageModelOverride,
    input.config.byokImageModel,
    input.imageModelOptions[0]?.id,
  );
  const videoModel = firstNonBlank(
    input.videoModelOverride,
    input.config.byokVideoModel,
    input.videoModelOptions[0]?.id,
  );
  const speechModel = firstNonBlank(
    input.speechModelOverride,
    input.config.byokSpeechModel,
    input.speechModelOptions[0]?.id,
  );
  const speechVoice = firstNonBlank(
    input.speechVoiceOverride,
    input.config.byokSpeechVoice,
  );
  return {
    ...(imageModel ? { imageModel } : {}),
    ...(videoModel ? { videoModel } : {}),
    ...(speechModel ? { speechModel } : {}),
    ...(speechVoice ? { speechVoice } : {}),
  };
}

// --- Daemon-disconnect predicates ---------------------------------------

// The generic browser-side SSE reconnect-budget exhaustion signal from
// consumeDaemonRun when the daemon status fetch still shows the run as
// queued/running. Both the live-stream onError and the reattach-stream onError
// share this signal; neither constitutes an authoritative terminal failure, so
// generic disconnects stay eligible for attachRecoverableRuns to re-query
// authoritative daemon status on the next tick.
export function isGenericDaemonDisconnect(err: unknown): boolean {
  return err instanceof Error && (
    (err as Error & { code?: string }).code === GENERIC_DAEMON_DISCONNECT_CODE ||
    err.message === GENERIC_DAEMON_DISCONNECT_MESSAGE
  );
}

// A persisted status/error event represents a generic daemon disconnect when
// either its structured `code` matches GENERIC_DAEMON_DISCONNECT_CODE, OR
// (legacy rows persisted before this code was introduced) its `detail`
// equals the canonical GENERIC_DAEMON_DISCONNECT_MESSAGE with no code set.
// Mirrors isGenericDaemonDisconnect() above, which checks the equivalent
// code-or-message pair on live Error objects for the same reason.
export function hasGenericDisconnectFailureEvent(message: ChatMessage): boolean {
  return (message.events ?? []).some(
    (event) =>
      event.kind === 'status' &&
      event.label === 'error' &&
      (event.code === GENERIC_DAEMON_DISCONNECT_CODE ||
        event.detail === GENERIC_DAEMON_DISCONNECT_MESSAGE),
  );
}

// --- Live-artifact event accumulator ------------------------------------

let liveArtifactEventSequence = 0;

export function appendLiveArtifactEventItem(
  prev: LiveArtifactEventItem[],
  event: LiveArtifactEventItem['event'],
): LiveArtifactEventItem[] {
  liveArtifactEventSequence += 1;
  const next = [...prev, { id: liveArtifactEventSequence, event }];
  return next.length > 50 ? next.slice(next.length - 50) : next;
}

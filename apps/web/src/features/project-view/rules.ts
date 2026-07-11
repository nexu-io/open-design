// Pure decision rules for the project-view slice: conversation merges,
// split-panel math, brand-browser URL parsing, workspace-context equality,
// stored-value type guards, BYOK media seeds, daemon-disconnect predicates, and
// the live-artifact event accumulator. Every function here is transport- and
// DOM-global-free (ADR 0002); they move byte-for-byte out of the former
// `ProjectView` god-component so they can be unit-tested without a render.
import type {
  AgentEvent,
  AppConfig,
  Artifact,
  ChatAttachment,
  ChatMessage,
  Conversation,
  LiveArtifactEventItem,
  PreviewComment,
  ProjectFile,
  ProjectMetadata,
} from '../../types';
import type {
  BrandStatus,
  ByokMediaDefaults,
  RunContextSelection,
  WorkspaceContextItem,
} from '@open-design/contracts';
import { mediaModelProviderId } from '../../media/models';
import { resolveHtmlPointerArtifactTarget } from '../../artifacts/pointer';
import { resolvePersistedArtifactHtml, recoverHtmlDocumentFromMarkdownFence, recoverStandaloneHtmlDocument } from '../../artifacts/recover';
import { createArtifactParser } from '../../artifacts/parser';
import { filterImplicitProducedFiles } from '../../produced-files';
import { agentDisplayName } from '../../utils/agentLabels';
import { isProgrammaticBrandExtractionProject } from '../../runtime/brand-enrichment';
import {
  GENERIC_DAEMON_DISCONNECT_CODE,
  GENERIC_DAEMON_DISCONNECT_MESSAGE,
  MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
  MIN_NORMAL_SPLIT_WIDTH,
  MIN_WORKSPACE_PANEL_WIDTH,
  SPLIT_RESIZE_HANDLE_WIDTH,
} from './constants';
import type { ChatSendMeta } from '../../components/ChatComposer';
import type {
  BrowserExtractionUrlParts,
  ProjectChatSendMeta,
  ProjectSplitStyle,
  RetryTarget,
} from './types';

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
  // Lengths are equal (checked above), so `b[index]` is always present for every
  // index `a.every` visits — the non-null assertion states that guarantee.
  return a.every((item, index) => workspaceContextItemEqual(item, b[index]!));
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

// --- Artifact-to-project-file matching / recovery -------------------------

export function artifactExtensionFor(art: Artifact): '.html' | '.jsx' | '.tsx' | '.css' | '.svg' | '.md' {
  const type = (art.artifactType || '').toLowerCase();
  const identifier = (art.identifier || '').toLowerCase();
  if (type.includes('tsx') || identifier.endsWith('.tsx')) return '.tsx';
  if (type.includes('jsx') || type.includes('react') || identifier.endsWith('.jsx')) {
    return '.jsx';
  }
  if (type.includes('css') || identifier.endsWith('.css')) return '.css';
  if (type.includes('svg') || identifier.endsWith('.svg')) return '.svg';
  if (type.includes('markdown') || type === 'md' || identifier.endsWith('.md')) {
    return '.md';
  }
  return '.html';
}

export function conversationHasBrandBrowserAssist(messages: ChatMessage[], brandId: string): boolean {
  const brandNeedle = `"brandId":"${escapeJsonNeedle(brandId)}"`;
  return messages.some((message) =>
    message.role === 'assistant' &&
    message.content.includes('<od-card type="brand-browser-assist"') &&
    message.content.includes(brandNeedle),
  );
}

function escapeJsonNeedle(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function artifactBaseNameFor(art: Artifact): string {
  return (
    (art.identifier || art.title || 'artifact')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'artifact'
  );
}

function artifactFileNamePattern(baseName: string, ext: string): RegExp {
  const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedExt = ext.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escapedBaseName}(?:-\\d+)?${escapedExt}$`);
}

export function findExistingArtifactProjectFile(
  art: Artifact,
  projectFiles: ProjectFile[],
  options: { minMtime?: number } = {},
): ProjectFile | null {
  const ext = artifactExtensionFor(art);
  const baseName = artifactBaseNameFor(art);
  const candidateFileName = `${baseName}${ext}`;
  const currentRunFiles = filterProjectFilesByMinMtime(projectFiles, options.minMtime);

  if (ext === '.html') {
    const pointerTarget = resolveHtmlPointerArtifactTarget({
      content: art.html,
      candidateFileName,
      projectFiles: currentRunFiles,
    });
    const pointerFile = pointerTarget
      ? currentRunFiles.find((file) => file.name === pointerTarget || file.path === pointerTarget)
      : null;
    if (pointerFile) return pointerFile;
  }

  const identifier = art.identifier || '';
  if (identifier) {
    const manifestMatches = currentRunFiles
      .filter((file) => file.artifactManifest?.metadata?.identifier === identifier)
      .sort((a, b) => b.mtime - a.mtime);
    if (manifestMatches[0]) return manifestMatches[0];
  }

  if (ext === '.html') {
    const exactNameMatch = currentRunFiles.find((file) => file.name === candidateFileName);
    if (exactNameMatch) return exactNameMatch;
  }
  return null;
}

export function findExistingNonHtmlArtifactProjectFile(
  art: Artifact,
  projectFiles: ProjectFile[],
  options: { minMtime?: number } = {},
): ProjectFile | null {
  if (artifactExtensionFor(art) === '.html') return null;
  return findExistingArtifactProjectFile(art, projectFiles, options);
}

export async function findSameTurnNonHtmlWriteForRecoveredArtifact({
  artifact,
  producedFiles,
  readProjectText,
}: {
  artifact: Artifact;
  producedFiles: readonly ProjectFile[];
  readProjectText: (name: string) => Promise<string | null>;
}): Promise<ProjectFile | null> {
  const ext = artifactExtensionFor(artifact);
  if (ext === '.html') return null;

  const baseName = artifactBaseNameFor(artifact);
  const candidateFileName = `${baseName}${ext}`;
  const namePattern = artifactFileNamePattern(baseName, ext);
  const identifier = artifact.identifier || '';
  const candidates = producedFiles
    .filter((file) => {
      if (identifier && file.artifactManifest?.metadata?.identifier === identifier) {
        return file.name.toLowerCase().endsWith(ext);
      }
      return file.name === candidateFileName || namePattern.test(file.name);
    })
    .sort((a, b) => b.mtime - a.mtime);

  const expected = normalizeProjectTextForArtifactComparison(artifact.html);
  for (const file of candidates) {
    const text = await readProjectText(file.name);
    if (text === null) continue;
    const actual = normalizeProjectTextForArtifactComparison(text);
    if (actual === expected) return file;
  }
  return null;
}

export async function findSameTurnWriteForRecoveredArtifact({
  artifact,
  sourceText,
  producedFiles,
  readProjectText,
}: {
  artifact: Artifact;
  sourceText: string;
  producedFiles: readonly ProjectFile[];
  readProjectText: (name: string) => Promise<string | null>;
}): Promise<ProjectFile | null> {
  const nonHtmlWrite = await findSameTurnNonHtmlWriteForRecoveredArtifact({
    artifact,
    producedFiles,
    readProjectText,
  });
  if (nonHtmlWrite || artifactExtensionFor(artifact) !== '.html') return nonHtmlWrite;
  return findSameTurnHtmlWriteForRecoveredArtifact({
    artifactHtml: resolvePersistedArtifactHtml({
      artifactHtml: artifact.html,
      identifier: artifact.identifier,
      sourceText,
    }),
    producedFiles,
    readProjectHtml: readProjectText,
  });
}

function normalizeProjectTextForArtifactComparison(value: string | null | undefined): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n');
}

export function filterProjectFilesByMinMtime(
  projectFiles: readonly ProjectFile[],
  minMtime?: number,
): ProjectFile[] {
  return typeof minMtime === 'number' && Number.isFinite(minMtime)
    ? projectFiles.filter((file) => file.mtime >= minMtime)
    : [...projectFiles];
}

export function selectPrimaryProjectFile(files: ProjectFile[]): ProjectFile | null {
  const candidates = files
    .filter((file) => !isProcessArtifactFile(file.name))
    .map((file) => ({ file, rank: primaryProjectFileRank(file) }))
    .filter((candidate) => Number.isFinite(candidate.rank));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.rank - b.rank || b.file.mtime - a.file.mtime);
  return candidates[0]?.file ?? null;
}

function isProcessArtifactFile(name: string): boolean {
  const base = name.split('/').pop()?.toLowerCase() ?? name.toLowerCase();
  return (
    base === 'critique.json'
    || base.endsWith('.log')
    || base.endsWith('.meta.json')
    || base.endsWith('.artifact.json')
    || base.endsWith('.map')
  );
}

function primaryProjectFileRank(file: ProjectFile): number {
  if (manifestDeclaresPrimary(file)) return 0;
  if (file.artifactManifest && file.artifactManifest.metadata?.inferred !== true) return 1;
  if (file.kind === 'html') return 2;
  if (file.kind === 'image') return 3;
  if (file.kind === 'video') return 4;
  if (file.kind === 'sketch') return 5;
  if (file.kind === 'pdf') return 6;
  if (file.kind === 'presentation') return 7;
  if (file.kind === 'document') return 8;
  if (file.kind === 'spreadsheet') return 9;
  return Number.POSITIVE_INFINITY;
}

function manifestDeclaresPrimary(file: ProjectFile): boolean {
  const manifest = file.artifactManifest;
  if (!manifest) return false;
  if (primaryValueTargetsFile(manifest.primary, file.name)) return true;
  const metadata = manifest.metadata;
  if (!metadata || typeof metadata !== 'object') return false;
  if (primaryValueTargetsFile(metadata.primary, file.name)) return true;
  const outputs = metadata.outputs;
  if (outputs && typeof outputs === 'object' && !Array.isArray(outputs)) {
    return primaryValueTargetsFile(
      (outputs as { primary?: unknown }).primary,
      file.name,
    );
  }
  return false;
}

function primaryValueTargetsFile(value: unknown, fileName: string): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  return normalizeProjectFileName(value) === normalizeProjectFileName(fileName);
}

function normalizeProjectFileName(value: string): string {
  return value.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

export function assistantAgentDisplayName(
  agentId: string | null,
  fallbackName?: string,
): string | undefined {
  return agentDisplayName(agentId, fallbackName) ?? undefined;
}

export function isTerminalRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'canceled';
}

export function isActiveRunStatus(status: ChatMessage['runStatus']): boolean {
  return status === 'queued' || status === 'running';
}

export function isProgrammaticBrandExtractionStatusMessage(
  message: ChatMessage,
  metadata: ProjectMetadata | null | undefined,
): boolean {
  if (!isProgrammaticBrandExtractionProject(metadata)) return false;
  if (message.role !== 'assistant' || message.runId) return false;
  if (!isActiveRunStatus(message.runStatus)) return false;
  const text = `${message.content}\n${textContentFromAgentEvents(message.events)}`;
  return (
    text.includes('Programmatic design-system extraction started') ||
    text.includes('程序化设计系统抽取') ||
    text.includes('程式化設計系統抽取')
  );
}

export function hasRecoverableArtifactMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (!message.runId) return false;
  if (!isTerminalRunStatus(message.runStatus)) return false;
  if (message.producedFiles?.length) return false;
  const sourceText = message.content.trim().length > 0
    ? message.content
    : textContentFromAgentEvents(message.events);
  return artifactFromRecoverableSourceText(sourceText) !== null;
}

export function artifactFromRecoverableSourceText(sourceText: string): Artifact | null {
  const parser = createArtifactParser();
  let parsedArtifact: Artifact | null = null;
  let liveHtml = '';
  for (const ev of [...parser.feed(sourceText), ...parser.flush()]) {
    if (ev.type === 'artifact:start') {
      liveHtml = '';
      parsedArtifact = {
        identifier: ev.identifier,
        artifactType: ev.artifactType,
        title: ev.title,
        html: '',
      };
    } else if (ev.type === 'artifact:chunk') {
      liveHtml += ev.delta;
      parsedArtifact = artifactWithHtml(parsedArtifact, ev.identifier, liveHtml);
    } else if (ev.type === 'artifact:end') {
      parsedArtifact = artifactWithHtml(parsedArtifact, ev.identifier, ev.fullContent);
    }
  }
  if (parsedArtifact?.html) return parsedArtifact;

  const html = recoverStandaloneHtmlDocument(sourceText)
    ?? recoverHtmlDocumentFromMarkdownFence(sourceText);
  if (!html) return null;
  return {
    identifier: 'response',
    artifactType: 'text/html',
    title: 'Response',
    html,
  };
}

function artifactWithHtml(
  artifact: Artifact | null,
  fallbackIdentifier: string,
  html: string,
): Artifact {
  return artifact
    ? { ...artifact, html }
    : {
        identifier: fallbackIdentifier,
        title: '',
        html,
      };
}

export function shouldReplayTerminalRunMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (!message.runId) return false;
  if (message.runStatus !== 'succeeded') return false;
  if (message.content.trim().length > 0) return false;
  if (
    message.startedAt == null
    && !message.preTurnFileNames?.length
    && textContentFromAgentEvents(message.events).trim().length === 0
  ) {
    return false;
  }
  return !(message.producedFiles?.length);
}

export function textContentFromAgentEvents(events?: AgentEvent[]): string {
  return (events ?? [])
    .filter((event): event is Extract<AgentEvent, { kind: 'text' }> => event.kind === 'text')
    .map((event) => event.text)
    .join('');
}

export function resolveRetryTarget(
  messages: ChatMessage[],
  failedAssistantId: string,
): RetryTarget | null {
  const failedIndex = messages.findIndex(
    (message) =>
      message.id === failedAssistantId &&
      message.role === 'assistant' &&
      message.runStatus === 'failed',
  );
  if (failedIndex <= 0 || failedIndex !== messages.length - 1) return null;

  let userIndex = failedIndex - 1;
  while (
    userIndex >= 0 &&
    messages[userIndex]?.role === 'assistant' &&
    messages[userIndex]?.runStatus === 'failed'
  ) {
    userIndex -= 1;
  }

  const userMsg = messages[userIndex];
  const failedAssistant = messages[failedIndex];
  if (!userMsg || userMsg.role !== 'user' || !failedAssistant) return null;

  return {
    failedAssistant,
    userMsg,
    priorMessages: messages.slice(0, userIndex),
    preservedAttempts: messages.slice(userIndex + 1, failedIndex + 1),
  };
}

export function latestDesignSystemActivityEvents(messages: ChatMessage[]): AgentEvent[] {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== 'assistant') continue;
    if ((message.events?.length ?? 0) > 0) return message.events ?? [];
    if (isActiveRunStatus(message.runStatus)) return [];
  }
  return [];
}

// A daemon assistant message that is "queued/running" but has no runId yet
// is in-flight on the client: POST /api/runs has not returned. Persisting it
// in this state creates a phantom DB row that the reattach loop can never
// recover (the daemon either never saw the request or the response was lost),
// which is what produced the "Working 24m+" stuck UI. Treat the in-flight
// window as ephemeral and only write to DB once a runId pins the row to a
// real daemon run — or once the run reaches a terminal state.
export function isPhantomDaemonRunMessage(m: ChatMessage): boolean {
  return (
    m.role === 'assistant' &&
    isActiveRunStatus(m.runStatus) &&
    !m.runId
  );
}

export function isStoppableAssistantMessage(message: ChatMessage): boolean {
  if (message.role !== 'assistant') return false;
  if (isActiveRunStatus(message.runStatus)) return true;
  return message.runStatus === undefined && message.endedAt === undefined && message.startedAt !== undefined;
}

export function resolveSucceededRunStatus(status: ChatMessage['runStatus']): ChatMessage['runStatus'] {
  return status === 'failed' || status === 'canceled' ? status : 'succeeded';
}

export function computeProducedFiles(
  beforeNames: ReadonlySet<string> | readonly string[] | undefined,
  next: readonly ProjectFile[],
): ProjectFile[] | undefined {
  if (!beforeNames) return undefined;
  const set = beforeNames instanceof Set ? beforeNames : new Set(beforeNames);
  return filterImplicitProducedFiles(next.filter((f) => !set.has(f.name)));
}

export function computeTraceObjectFiles(
  beforeNames: ReadonlySet<string> | readonly string[] | undefined,
  next: readonly ProjectFile[],
  touchedPaths: Iterable<string> = [],
): ProjectFile[] | undefined {
  if (!beforeNames) return undefined;
  const set = beforeNames instanceof Set ? beforeNames : new Set(beforeNames);
  const byName = new Map<string, ProjectFile>();
  for (const file of filterImplicitProducedFiles(next.filter((f) => !set.has(f.name)))) {
    byName.set(file.name, { ...file, traceObjectReason: 'new' });
  }
  for (const rawPath of touchedPaths) {
    const file = findTouchedProjectFile(rawPath, next);
    if (!file) continue;
    byName.set(file.name, {
      ...file,
      traceObjectReason: set.has(file.name) ? 'modified' : 'new',
    });
  }
  return [...byName.values()];
}

function findTouchedProjectFile(rawPath: string, files: readonly ProjectFile[]): ProjectFile | null {
  const normalized = normalizeComparableFilePath(rawPath);
  if (!normalized) return null;
  const hasPathSeparator = normalized.includes('/');
  const basename = normalized.split('/').pop() ?? normalized;
  const normalizedFiles = files.map((file) => ({
    file,
    candidates: [
      normalizeComparableFilePath(file.path ?? ''),
      normalizeComparableFilePath(file.name),
    ].filter(Boolean),
  }));

  const matches = (predicate: (candidate: string) => boolean): ProjectFile[] => {
    const matched: ProjectFile[] = [];
    for (const { file, candidates } of normalizedFiles) {
      if (candidates.some(predicate)) matched.push(file);
    }
    return matched;
  };

  const exact = matches((candidate) => candidate === normalized);
  if (exact.length === 1) return exact[0]!;
  if (exact.length > 1) return null;

  const suffix = matches((candidate) =>
    candidate.includes('/') &&
    (candidate.endsWith(`/${normalized}`) || normalized.endsWith(`/${candidate}`)),
  );
  if (suffix.length === 1) return suffix[0]!;
  if (suffix.length > 1) return null;

  if (hasPathSeparator) return null;

  const basenameMatches = normalizedFiles.filter(({ candidates }) =>
    candidates.some((candidate) => candidate.split('/').pop() === basename),
  );
  return basenameMatches.length === 1 ? basenameMatches[0]!.file : null;
}

function normalizeComparableFilePath(value: string): string {
  return value
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/');
}

// Reattach with a recovered (on-disk) artifact must still include any
// other files the turn produced before the artifact write — replacing
// the diff with a single file was the regression noted on PR #2383.
export function mergeRecoveredArtifact(
  diff: readonly ProjectFile[],
  recovered: ProjectFile | null,
): ProjectFile[] {
  if (!recovered) return [...diff];
  if (diff.some((f) => f.name === recovered.name)) return [...diff];
  return [...diff, recovered];
}

export async function findSameTurnHtmlWriteForRecoveredArtifact({
  artifactHtml,
  producedFiles,
  readProjectHtml,
}: {
  artifactHtml: string;
  producedFiles: readonly ProjectFile[];
  readProjectHtml: (name: string) => Promise<string | null>;
}): Promise<ProjectFile | null> {
  const recovered = normalizeHtmlForRecoveredArtifactComparison(artifactHtml);
  if (!recovered) return null;
  const candidates = producedFiles.filter(isHtmlProjectFile);
  if (candidates.length === 0) return null;
  const contents = await Promise.all(candidates.map((file) => readProjectHtml(file.name)));
  const normalized = contents.map(normalizeHtmlForRecoveredArtifactComparison);
  // Bind only on an exact normalized-content match. This is inherently
  // agent-agnostic (#4308): whenever a filesystem-backed CLI writes an HTML
  // file and echoes the same document as an artifact, the normalized contents
  // are equal and we suppress the duplicate — no Claude-specific gate needed.
  //
  // We deliberately do NOT bind on a content *mismatch*. A differing same-turn
  // HTML file is a genuinely different document and must persist on its own.
  // A blind single-file bind also mis-fired across queued runs: the pre-turn
  // file snapshot for a queued run can predate the previous run's persist, so
  // computeProducedFiles() reports that earlier artifact as "produced this
  // turn" and we'd bind the echo to the wrong, unrelated file.
  const exact = candidates.find((_file, i) => normalized[i] === recovered);
  return exact ?? null;
}

function isHtmlProjectFile(file: ProjectFile): boolean {
  const name = (file.path || file.name).toLowerCase();
  return file.kind === 'html' || /\.(?:html?|xhtml)$/u.test(name);
}

function normalizeHtmlForRecoveredArtifactComparison(value: string | null | undefined): string {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
}

export function mergeRecoveredTraceObjectFile(
  files: readonly ProjectFile[],
  recovered: ProjectFile | null,
): ProjectFile[] {
  const out = [...files];
  if (!recovered) return out;
  const existing = out.findIndex((file) => file.name === recovered.name);
  const tagged = { ...recovered, traceObjectReason: 'recovered' as const };
  if (existing >= 0) {
    out[existing] = { ...out[existing]!, traceObjectReason: out[existing]!.traceObjectReason ?? 'recovered' };
    return out;
  }
  return [...out, tagged];
}

export function extractTouchedFilePathsFromEvents(events: ChatMessage['events']): string[] {
  if (!Array.isArray(events)) return [];
  const pending = new Map<string, string>();
  const touched: string[] = [];
  for (const event of events) {
    if (!event || typeof event !== 'object') continue;
    const rec = event as Record<string, unknown>;
    if (rec.kind === 'tool_use' && isFileWriteToolName(rec.name)) {
      const filePath = extractFileWriteToolPath(rec.input);
      if (typeof rec.id === 'string' && typeof filePath === 'string' && filePath) {
        pending.set(rec.id, filePath);
      }
    }
    if (rec.kind === 'tool_result') {
      const toolUseId = typeof rec.toolUseId === 'string'
        ? rec.toolUseId
        : typeof rec.tool_use_id === 'string'
          ? rec.tool_use_id
          : '';
      const filePath = pending.get(toolUseId);
      if (!filePath) continue;
      pending.delete(toolUseId);
      if (rec.isError !== true) touched.push(filePath);
    }
  }
  return touched;
}

export function isFileWriteToolName(value: unknown): boolean {
  return (
    value === 'Write'
    || value === 'write'
    || value === 'create_file'
    || value === 'Edit'
    || value === 'str_replace_edit'
    || value === 'MultiEdit'
    || value === 'multi_edit'
  );
}

export function extractFileWriteToolPath(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null;
  const rec = input as Record<string, unknown>;
  const filePath = rec.file_path ?? rec.filePath ?? rec.path;
  return typeof filePath === 'string' && filePath ? filePath : null;
}

export function clearStreamingConversationMarker(
  currentConversationId: string | null,
  completedConversationId?: string | null,
): string | null {
  if (
    completedConversationId !== undefined
    && completedConversationId !== null
    && currentConversationId !== completedConversationId
  ) {
    return currentConversationId;
  }
  return null;
}

export function shouldClearActiveRunRefs(
  currentConversationId: string | null,
  completedConversationId: string,
): boolean {
  return currentConversationId === completedConversationId;
}

export function finalizeActiveAssistantMessagesOnStop(
  messages: ChatMessage[],
  stoppedAt: number,
): { messages: ChatMessage[]; finalized: ChatMessage[] } {
  const finalized: ChatMessage[] = [];
  const next = messages.map((message) => {
    if (!isStoppableAssistantMessage(message)) {
      return message;
    }
    const updated = {
      ...message,
      runStatus: 'canceled' as const,
      endedAt: message.endedAt ?? stoppedAt,
    };
    finalized.push(updated);
    return updated;
  });
  return { messages: next, finalized };
}

// --- Queued chat sends -----------------------------------------------------

export function stripQueueOnlyFromMeta(meta: ChatSendMeta | undefined): ProjectChatSendMeta | undefined {
  if (!meta) return undefined;
  const { queueOnly: _queueOnly, ...rest } = meta;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

// --- Auto-send session storage keys -----------------------------------------

export function autoSendFirstMessageKey(projectId: string): string {
  return `od:auto-send-first:${projectId}`;
}

export function autoSendAttachmentsKey(projectId: string): string {
  return `od:auto-send-attachments:${projectId}`;
}

export function autoSendContextKey(projectId: string): string {
  return `od:auto-send-context:${projectId}`;
}

/** Set by the home create flow when its submit already ran the Open Design
 * Cloud balance gate — the first auto-send must not re-prompt the user. */
export function autoSendAmrGateOkKey(projectId: string): string {
  return `od:auto-send-amr-gate-ok:${projectId}`;
}

export function designSystemAuditAutoRepairKey(projectId: string): string {
  return `od:design-system-audit-auto-repair:${projectId}`;
}

// @vitest-environment jsdom
//
// Pure rules for the project-view slice: conversation merges, split-panel math,
// brand-browser URL parsing, workspace-context equality, stored-value type
// guards, BYOK media seeds, daemon-disconnect predicates, and the live-artifact
// event accumulator. No doubles — every function is transport/DOM-global-free.
import { describe, expect, it } from 'vitest';
import {
  GENERIC_DAEMON_DISCONNECT_CODE as PROVIDER_DISCONNECT_CODE,
  GENERIC_DAEMON_DISCONNECT_MESSAGE as PROVIDER_DISCONNECT_MESSAGE,
} from '../../../src/providers/daemon';
import {
  GENERIC_DAEMON_DISCONNECT_CODE,
  GENERIC_DAEMON_DISCONNECT_MESSAGE,
  MAX_CHAT_PANEL_WIDTH,
  MIN_CHAT_PANEL_WIDTH,
  MIN_NORMAL_SPLIT_WIDTH,
  MIN_WORKSPACE_PANEL_WIDTH,
  SPLIT_RESIZE_HANDLE_WIDTH,
} from '../../../src/features/project-view/constants';
import {
  mergeSavedPreviewComment,
  mergeServerMessagesIntoConversation,
  ensureConversationPresent,
  workspacePanelMinWidthForSplit,
  maxChatPanelWidthForSplit,
  workspacePanelTrackFor,
  clampPreferredChatPanelWidth,
  clampChatPanelWidth,
  projectSplitClassName,
  projectSplitStyle,
  applySplitChatPanelWidth,
  buildQuestionFormKey,
  normalizedBrandBrowserPathname,
  browserExtractionUrlParts,
  isBrandBrowserHomeRedirectPath,
  brandBrowserSnapshotMatchesSource,
  workspaceContextItemEqual,
  workspaceContextItemsEqual,
  isDesignSystemWorkspaceMetadata,
  isStoredChatAttachment,
  isStoredStringArray,
  isStoredWorkspaceContextItem,
  isStoredRunContextSelection,
  isBrandStatusValue,
  brandExtractionAllowsEditing,
  projectMediaModelSeed,
  projectMediaVoiceSeed,
  byokModelSeedForProtocol,
  firstNonBlank,
  byokMediaDefaultsForRun,
  isGenericDaemonDisconnect,
  hasGenericDisconnectFailureEvent,
  appendLiveArtifactEventItem,
  isContinueInCliShortcut,
} from '../../../src/features/project-view/rules';
import type {
  ChatMessage,
  Conversation,
  LiveArtifactEventItem,
  PreviewComment,
  ProjectMetadata,
} from '../../../src/types';
import type { WorkspaceContextItem } from '@open-design/contracts';

function comment(id: string, over: Partial<PreviewComment> = {}): PreviewComment {
  return { id, text: id, ...over } as PreviewComment;
}

function message(id: string, over: Partial<ChatMessage> = {}): ChatMessage {
  return { id, role: 'assistant', content: '', ...over } as ChatMessage;
}

function wsItem(over: Partial<WorkspaceContextItem> = {}): WorkspaceContextItem {
  return { id: 'w1', kind: 'file', label: 'file.ts', ...over } as WorkspaceContextItem;
}

// The slice mirrors the daemon-disconnect identity constants locally because a
// slice file cannot import a provider (ADR 0002). Pin the mirrors here so a
// drift from the authoritative provider values fails the build.
describe('daemon-disconnect constant mirrors', () => {
  it('match the authoritative providers/daemon exports', () => {
    expect(GENERIC_DAEMON_DISCONNECT_CODE).toBe(PROVIDER_DISCONNECT_CODE);
    expect(GENERIC_DAEMON_DISCONNECT_MESSAGE).toBe(PROVIDER_DISCONNECT_MESSAGE);
  });
});

describe('mergeSavedPreviewComment', () => {
  it('appends a comment whose id is not present', () => {
    expect(mergeSavedPreviewComment([comment('a')], comment('b'))).toEqual([comment('a'), comment('b')]);
  });
  it('replaces the existing comment in place', () => {
    const updated = comment('a', { text: 'edited' });
    expect(mergeSavedPreviewComment([comment('a'), comment('b')], updated)).toEqual([updated, comment('b')]);
  });
});

describe('mergeServerMessagesIntoConversation', () => {
  it('keeps the server message when there is no local twin', () => {
    const server = [message('s1', { content: 'x' })];
    expect(mergeServerMessagesIntoConversation([], server)).toEqual(server);
  });

  it('prefers the longer local assistant content and events', () => {
    const local = message('m', {
      content: 'longer local',
      events: [{ kind: 'status' }, { kind: 'status' }] as ChatMessage['events'],
    });
    const server = message('m', { content: 'srv', events: [] });
    const [merged] = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged?.content).toBe('longer local');
    expect(merged?.events).toHaveLength(2);
  });

  it('keeps server content when the server message is longer', () => {
    const local = message('m', { content: 'a' });
    const server = message('m', { content: 'much longer' });
    const [merged] = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged?.content).toBe('much longer');
  });

  it('backfills produced/preTurn/lastRunEventId/timestamps/runStatus from local', () => {
    const local = message('m', {
      producedFiles: [{ name: 'a.html' }],
      preTurnFileNames: ['b.html'],
      lastRunEventId: 'evt-1',
      startedAt: 10,
      endedAt: 20,
      runStatus: 'succeeded',
    } as unknown as Partial<ChatMessage>);
    const server = message('m');
    const [merged] = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged?.producedFiles?.[0]?.name).toBe('a.html');
    expect(merged?.preTurnFileNames).toEqual(['b.html']);
    expect(merged?.lastRunEventId).toBe('evt-1');
    expect(merged?.startedAt).toBe(10);
    expect(merged?.endedAt).toBe(20);
    expect(merged?.runStatus).toBe('succeeded');
  });

  it('treats missing content lengths as zero when comparing', () => {
    const local = message('m', { content: undefined as unknown as string });
    const server = message('m', { content: 'srv' });
    const [merged] = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged?.content).toBe('srv');
  });

  it('keeps local content when the server message has none', () => {
    const local = message('m', { content: 'local text' });
    const server = message('m', { content: undefined as unknown as string });
    const [merged] = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged?.content).toBe('local text');
  });

  it('does not merge assistant fields when roles differ', () => {
    const local = message('m', { role: 'user', content: 'longer user text' });
    const server = message('m', { role: 'assistant', content: 'srv' });
    const [merged] = mergeServerMessagesIntoConversation([local], [server]);
    expect(merged?.content).toBe('srv');
  });

  it('appends local-only messages after the server set', () => {
    const merged = mergeServerMessagesIntoConversation([message('local')], [message('s')]);
    expect(merged.map((m) => m.id)).toEqual(['s', 'local']);
  });
});

describe('ensureConversationPresent', () => {
  const conv: Conversation = { id: 'c1', projectId: 'p', title: null, createdAt: 1, updatedAt: 1 };
  it('returns the same list when the conversation already exists', () => {
    const list = [conv];
    expect(ensureConversationPresent(list, 'c1', 'p')).toBe(list);
  });
  it('prepends a stub conversation when absent', () => {
    const [head, ...rest] = ensureConversationPresent([conv], 'c2', 'p');
    expect(head?.id).toBe('c2');
    expect(head?.projectId).toBe('p');
    expect(head?.title).toBeNull();
    expect(rest).toEqual([conv]);
  });
});

describe('split-panel math', () => {
  it('workspacePanelMinWidthForSplit handles non-finite, tiny, and normal widths', () => {
    expect(workspacePanelMinWidthForSplit(Number.NaN)).toBe(MIN_WORKSPACE_PANEL_WIDTH);
    expect(workspacePanelMinWidthForSplit(0)).toBe(MIN_WORKSPACE_PANEL_WIDTH);
    expect(workspacePanelMinWidthForSplit(MIN_NORMAL_SPLIT_WIDTH - 1)).toBe(0);
    expect(workspacePanelMinWidthForSplit(MIN_NORMAL_SPLIT_WIDTH + 500)).toBe(MIN_WORKSPACE_PANEL_WIDTH);
  });

  it('maxChatPanelWidthForSplit caps at the max and floors the viewport-aware value', () => {
    expect(maxChatPanelWidthForSplit(Number.NaN)).toBe(MAX_CHAT_PANEL_WIDTH);
    expect(maxChatPanelWidthForSplit(10_000)).toBe(MAX_CHAT_PANEL_WIDTH);
    // Below MIN_NORMAL_SPLIT_WIDTH the workspace min is 0, so max = split - handle.
    const tiny = 500;
    expect(maxChatPanelWidthForSplit(tiny)).toBe(tiny - SPLIT_RESIZE_HANDLE_WIDTH);
  });

  it('clampPreferredChatPanelWidth clamps to [MIN, MAX] and rounds', () => {
    expect(clampPreferredChatPanelWidth(10)).toBe(MIN_CHAT_PANEL_WIDTH);
    expect(clampPreferredChatPanelWidth(10_000)).toBe(MAX_CHAT_PANEL_WIDTH);
    expect(clampPreferredChatPanelWidth(400.4)).toBe(400);
  });

  it('clampChatPanelWidth respects a tighter dynamic maxWidth', () => {
    expect(clampChatPanelWidth(700, 500)).toBe(500);
    expect(clampChatPanelWidth(10, 500)).toBe(MIN_CHAT_PANEL_WIDTH);
    // When maxWidth is below MIN, the effective min collapses to that max.
    expect(clampChatPanelWidth(999, 100)).toBe(100);
  });

  it('workspacePanelTrackFor collapses to a bare fr track at zero, else reserves the min', () => {
    expect(workspacePanelTrackFor(0)).toBe('minmax(0, 1fr)');
    expect(workspacePanelTrackFor(MIN_WORKSPACE_PANEL_WIDTH)).toBe(
      `minmax(${MIN_WORKSPACE_PANEL_WIDTH}px, 1fr)`,
    );
  });

  it('projectSplitClassName toggles the focus modifier', () => {
    expect(projectSplitClassName(false)).toBe('split');
    expect(projectSplitClassName(true)).toBe('split split-focus');
  });

  it('projectSplitStyle returns undefined when workspace-focused, else the grid vars', () => {
    expect(projectSplitStyle(true, 400, '1fr')).toBeUndefined();
    const style = projectSplitStyle(false, 400, '1fr');
    expect(style?.['--project-chat-panel-width']).toBe('400px');
    expect(style?.gridTemplateColumns).toBe(`400px ${SPLIT_RESIZE_HANDLE_WIDTH}px 1fr`);
  });

  it('applySplitChatPanelWidth no-ops on null and writes styles on an element', () => {
    expect(() => applySplitChatPanelWidth(null, 400, '1fr')).not.toThrow();
    const el = document.createElement('div');
    applySplitChatPanelWidth(el, 420, '2fr');
    expect(el.style.getPropertyValue('--project-chat-panel-width')).toBe('420px');
    expect(el.style.gridTemplateColumns).toBe(`420px ${SPLIT_RESIZE_HANDLE_WIDTH}px 2fr`);
  });
});

describe('buildQuestionFormKey', () => {
  it('returns null unless all three inputs are truthy', () => {
    expect(buildQuestionFormKey(null, 'm', true)).toBeNull();
    expect(buildQuestionFormKey('c', null, true)).toBeNull();
    expect(buildQuestionFormKey('c', 'm', false)).toBeNull();
  });
  it('composes conversation:message when a form is present', () => {
    expect(buildQuestionFormKey('c', 'm', true)).toBe('c:m');
  });
});

describe('brand-browser URL parsing', () => {
  it('normalizedBrandBrowserPathname strips trailing slashes and defaults to /', () => {
    expect(normalizedBrandBrowserPathname('/a/b/')).toBe('/a/b');
    expect(normalizedBrandBrowserPathname('/')).toBe('/');
    expect(normalizedBrandBrowserPathname('')).toBe('/');
  });

  it('browserExtractionUrlParts parses host/path/search and rejects junk', () => {
    expect(browserExtractionUrlParts(null)).toBeNull();
    expect(browserExtractionUrlParts('   ')).toBeNull();
    expect(browserExtractionUrlParts('not a url')).toBeNull();
    expect(browserExtractionUrlParts('https://www.Example.com:8080/path/?q=1')).toEqual({
      host: 'example.com:8080',
      pathname: '/path',
      search: '?q=1',
    });
  });

  it('isBrandBrowserHomeRedirectPath matches /home and locale roots only', () => {
    expect(isBrandBrowserHomeRedirectPath('/home')).toBe(true);
    expect(isBrandBrowserHomeRedirectPath('/en')).toBe(true);
    expect(isBrandBrowserHomeRedirectPath('/en-us')).toBe(true);
    expect(isBrandBrowserHomeRedirectPath('/pricing')).toBe(false);
  });

  it('brandBrowserSnapshotMatchesSource matches exact, home-redirect, and rejects host/path drift', () => {
    expect(brandBrowserSnapshotMatchesSource('https://x.com/a?q=1', 'https://x.com/a?q=1')).toBe(true);
    expect(brandBrowserSnapshotMatchesSource('https://x.com/en', 'https://x.com/')).toBe(true);
    expect(brandBrowserSnapshotMatchesSource('https://x.com/pricing', 'https://x.com/')).toBe(false);
    expect(brandBrowserSnapshotMatchesSource('https://y.com/a', 'https://x.com/a')).toBe(false);
    expect(brandBrowserSnapshotMatchesSource('bad', 'https://x.com/a')).toBe(false);
  });
});

describe('workspace-context equality', () => {
  it('workspaceContextItemEqual short-circuits identity and null, and compares every field', () => {
    const a = wsItem();
    expect(workspaceContextItemEqual(a, a)).toBe(true);
    expect(workspaceContextItemEqual(a, null)).toBe(false);
    expect(workspaceContextItemEqual(null, null)).toBe(true);
    expect(workspaceContextItemEqual(wsItem({ path: 'x' }), wsItem({ path: 'y' }))).toBe(false);
    expect(workspaceContextItemEqual(wsItem({ url: 'u' }), wsItem({ url: 'u' }))).toBe(true);
  });

  it('workspaceContextItemsEqual compares length, identity, and element-wise', () => {
    const list = [wsItem()];
    expect(workspaceContextItemsEqual(list, list)).toBe(true);
    expect(workspaceContextItemsEqual([wsItem()], [])).toBe(false);
    expect(workspaceContextItemsEqual([wsItem({ id: 'a' })], [wsItem({ id: 'b' })])).toBe(false);
    expect(workspaceContextItemsEqual([wsItem()], [wsItem()])).toBe(true);
  });
});

describe('stored-value type guards', () => {
  it('isDesignSystemWorkspaceMetadata detects the design-system import marker', () => {
    expect(isDesignSystemWorkspaceMetadata({ importedFrom: 'design-system' } as ProjectMetadata)).toBe(true);
    expect(isDesignSystemWorkspaceMetadata({ importedFrom: 'folder' } as ProjectMetadata)).toBe(false);
    expect(isDesignSystemWorkspaceMetadata(undefined)).toBe(false);
  });

  it('isStoredChatAttachment accepts valid records and rejects malformed ones', () => {
    expect(isStoredChatAttachment({ path: 'a', name: 'a', kind: 'image' })).toBe(true);
    expect(isStoredChatAttachment({ path: 'a', name: 'a', kind: 'file', size: 3, order: 1 })).toBe(true);
    expect(isStoredChatAttachment(null)).toBe(false);
    expect(isStoredChatAttachment({ path: '', name: 'a', kind: 'image' })).toBe(false);
    expect(isStoredChatAttachment({ path: 'a', name: 'a', kind: 'video' })).toBe(false);
    expect(isStoredChatAttachment({ path: 'a', name: 'a', kind: 'file', size: 'x' })).toBe(false);
  });

  it('isStoredStringArray requires every element to be a string', () => {
    expect(isStoredStringArray(['a', 'b'])).toBe(true);
    expect(isStoredStringArray([])).toBe(true);
    expect(isStoredStringArray(['a', 1])).toBe(false);
    expect(isStoredStringArray('a')).toBe(false);
  });

  it('isStoredWorkspaceContextItem validates required and optional fields', () => {
    expect(isStoredWorkspaceContextItem({ id: 'a', kind: 'file', label: 'l' })).toBe(true);
    expect(isStoredWorkspaceContextItem({ id: 'a', kind: 'file', label: 'l', tabId: 't', path: 'p', absolutePath: '/p', url: 'u', title: 'T' })).toBe(true);
    expect(isStoredWorkspaceContextItem({ id: 'a', kind: 'file' })).toBe(false);
    expect(isStoredWorkspaceContextItem({ id: 'a', kind: 'file', label: 'l', path: 3 })).toBe(false);
    expect(isStoredWorkspaceContextItem(null)).toBe(false);
  });

  it('isStoredRunContextSelection validates each id array and the workspace items', () => {
    expect(isStoredRunContextSelection({})).toBe(true);
    expect(isStoredRunContextSelection({
      skillIds: ['s'],
      pluginIds: ['p'],
      mcpServerIds: ['m'],
      connectorIds: ['c'],
      workspaceItems: [{ id: 'a', kind: 'file', label: 'l' }],
    })).toBe(true);
    expect(isStoredRunContextSelection({ skillIds: [1] })).toBe(false);
    expect(isStoredRunContextSelection({ workspaceItems: [{ id: 'a' }] })).toBe(false);
    expect(isStoredRunContextSelection([])).toBe(false);
    expect(isStoredRunContextSelection(null)).toBe(false);
  });

  it('isBrandStatusValue and brandExtractionAllowsEditing gate on the status enum', () => {
    expect(isBrandStatusValue('ready')).toBe(true);
    expect(isBrandStatusValue('extracting')).toBe(true);
    expect(isBrandStatusValue('nope')).toBe(false);
    expect(brandExtractionAllowsEditing('ready')).toBe(true);
    expect(brandExtractionAllowsEditing('failed')).toBe(true);
    expect(brandExtractionAllowsEditing('extracting')).toBe(false);
    expect(brandExtractionAllowsEditing(null)).toBe(false);
  });
});

describe('BYOK media seeds', () => {
  it('projectMediaModelSeed returns the trimmed pick per matching surface only', () => {
    expect(projectMediaModelSeed({ kind: 'image', imageModel: ' m ' } as ProjectMetadata, 'image')).toBe('m');
    expect(projectMediaModelSeed({ kind: 'video', videoModel: 'v' } as ProjectMetadata, 'video')).toBe('v');
    expect(projectMediaModelSeed({ kind: 'audio', audioKind: 'speech', audioModel: 's' } as ProjectMetadata, 'speech')).toBe('s');
    expect(projectMediaModelSeed({ kind: 'image', imageModel: '  ' } as ProjectMetadata, 'image')).toBeUndefined();
    expect(projectMediaModelSeed({ kind: 'video', videoModel: '  ' } as ProjectMetadata, 'video')).toBeUndefined();
    expect(projectMediaModelSeed({ kind: 'audio', audioKind: 'speech', audioModel: '  ' } as ProjectMetadata, 'speech')).toBeUndefined();
    expect(projectMediaModelSeed({ kind: 'image' } as ProjectMetadata, 'video')).toBeUndefined();
    expect(projectMediaModelSeed(null, 'image')).toBeUndefined();
  });

  it('projectMediaVoiceSeed returns the voice only for speech-audio projects', () => {
    expect(projectMediaVoiceSeed({ kind: 'audio', audioKind: 'speech', voice: ' vx ' } as ProjectMetadata)).toBe('vx');
    expect(projectMediaVoiceSeed({ kind: 'audio', audioKind: 'speech', voice: '  ' } as ProjectMetadata)).toBeUndefined();
    expect(projectMediaVoiceSeed({ kind: 'audio', audioKind: 'music' } as ProjectMetadata)).toBeUndefined();
    expect(projectMediaVoiceSeed(undefined)).toBeUndefined();
  });

  it('byokModelSeedForProtocol seeds only when the pick belongs to the active protocol', () => {
    // A live aihubmix-prefixed id resolves to the aihubmix protocol synchronously.
    expect(byokModelSeedForProtocol({ kind: 'image', imageModel: 'aihubmix-x' } as ProjectMetadata, 'image', 'aihubmix')).toBe('aihubmix-x');
    expect(byokModelSeedForProtocol({ kind: 'image', imageModel: 'aihubmix-x' } as ProjectMetadata, 'image', 'openai')).toBeUndefined();
    expect(byokModelSeedForProtocol({ kind: 'image' } as ProjectMetadata, 'image', 'aihubmix')).toBeUndefined();
  });

  it('firstNonBlank returns the first trimmed non-empty value or empty string', () => {
    expect(firstNonBlank(undefined, '  ', ' hit ', 'later')).toBe('hit');
    expect(firstNonBlank(null, '   ')).toBe('');
  });

  it('byokMediaDefaultsForRun prefers overrides, then config, then first option', () => {
    const defaults = byokMediaDefaultsForRun({
      imageModelOverride: 'img-override',
      videoModelOverride: '',
      speechModelOverride: '',
      speechVoiceOverride: '',
      config: { byokImageModel: 'cfg-img', byokVideoModel: 'cfg-vid', byokSpeechModel: '', byokSpeechVoice: 'cfg-voice' },
      imageModelOptions: [{ id: 'opt-img' }],
      videoModelOptions: [{ id: 'opt-vid' }],
      speechModelOptions: [{ id: 'opt-speech' }],
    });
    expect(defaults).toEqual({
      imageModel: 'img-override',
      videoModel: 'cfg-vid',
      speechModel: 'opt-speech',
      speechVoice: 'cfg-voice',
    });
  });

  it('byokMediaDefaultsForRun omits fields with no resolvable value', () => {
    const defaults = byokMediaDefaultsForRun({
      imageModelOverride: '',
      videoModelOverride: '',
      speechModelOverride: '',
      speechVoiceOverride: '',
      config: { byokImageModel: '', byokVideoModel: '', byokSpeechModel: '', byokSpeechVoice: '' },
      imageModelOptions: [],
      videoModelOptions: [],
      speechModelOptions: [],
    });
    expect(defaults).toEqual({});
  });
});

describe('daemon-disconnect predicates', () => {
  it('isGenericDaemonDisconnect matches the code or the message on Error objects', () => {
    const byCode = Object.assign(new Error('other'), { code: GENERIC_DAEMON_DISCONNECT_CODE });
    expect(isGenericDaemonDisconnect(byCode)).toBe(true);
    expect(isGenericDaemonDisconnect(new Error(GENERIC_DAEMON_DISCONNECT_MESSAGE))).toBe(true);
    expect(isGenericDaemonDisconnect(new Error('nope'))).toBe(false);
    expect(isGenericDaemonDisconnect('not an error')).toBe(false);
  });

  it('hasGenericDisconnectFailureEvent detects code- and legacy detail-based failures', () => {
    expect(hasGenericDisconnectFailureEvent(message('m', {
      events: [{ kind: 'status', label: 'error', code: GENERIC_DAEMON_DISCONNECT_CODE }] as ChatMessage['events'],
    }))).toBe(true);
    expect(hasGenericDisconnectFailureEvent(message('m', {
      events: [{ kind: 'status', label: 'error', detail: GENERIC_DAEMON_DISCONNECT_MESSAGE }] as ChatMessage['events'],
    }))).toBe(true);
    expect(hasGenericDisconnectFailureEvent(message('m', {
      events: [{ kind: 'status', label: 'error', detail: 'something else' }] as ChatMessage['events'],
    }))).toBe(false);
    expect(hasGenericDisconnectFailureEvent(message('m'))).toBe(false);
  });
});

describe('appendLiveArtifactEventItem', () => {
  const evt: LiveArtifactEventItem['event'] = {
    kind: 'live_artifact',
    action: 'created',
    projectId: 'p',
    artifactId: 'a',
    title: 't',
  };

  it('appends with a monotonically increasing id', () => {
    const first = appendLiveArtifactEventItem([], evt);
    const second = appendLiveArtifactEventItem(first, evt);
    expect(second).toHaveLength(2);
    expect((second[1]?.id ?? 0) > (second[0]?.id ?? 0)).toBe(true);
  });

  it('caps the buffer at the most recent 50 entries', () => {
    let items: LiveArtifactEventItem[] = [];
    for (let i = 0; i < 60; i += 1) items = appendLiveArtifactEventItem(items, evt);
    expect(items).toHaveLength(50);
  });
});

describe('isContinueInCliShortcut', () => {
  const base = { metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, key: 'k', isComposing: false };

  it('matches Cmd+Shift+K on mac and rejects Ctrl+Shift+K', () => {
    expect(isContinueInCliShortcut({ ...base, metaKey: true, shiftKey: true }, true)).toBe(true);
    expect(isContinueInCliShortcut({ ...base, ctrlKey: true, shiftKey: true }, true)).toBe(false);
  });

  it('matches Ctrl+Shift+K elsewhere and rejects Cmd+Shift+K', () => {
    expect(isContinueInCliShortcut({ ...base, ctrlKey: true, shiftKey: true }, false)).toBe(true);
    expect(isContinueInCliShortcut({ ...base, metaKey: true, shiftKey: true }, false)).toBe(false);
  });

  it('rejects when Shift is missing, Alt is held, the key differs, or both mod keys are held', () => {
    expect(isContinueInCliShortcut({ ...base, metaKey: true }, true)).toBe(false);
    expect(isContinueInCliShortcut({ ...base, metaKey: true, shiftKey: true, altKey: true }, true)).toBe(false);
    expect(isContinueInCliShortcut({ ...base, metaKey: true, shiftKey: true, key: 'j' }, true)).toBe(false);
    expect(isContinueInCliShortcut({ ...base, metaKey: true, ctrlKey: true, shiftKey: true }, true)).toBe(false);
  });

  it('is case-insensitive on the key and rejects mid-IME composition', () => {
    expect(isContinueInCliShortcut({ ...base, metaKey: true, shiftKey: true, key: 'K' }, true)).toBe(true);
    expect(
      isContinueInCliShortcut({ ...base, metaKey: true, shiftKey: true, isComposing: true }, true),
    ).toBe(false);
  });
});

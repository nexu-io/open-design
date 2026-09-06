import { act } from '@testing-library/react';
import { vi } from 'vitest';
import {
  PREVIEW_RUNTIME_CAPABILITIES,
  PREVIEW_RUNTIME_PROTOCOL_VERSION,
  type PreviewRuntimeCapability,
} from '@open-design/contracts/runtime/preview-runtime';
import type { ProjectScopedPreviewNavigation } from '../../src/providers/registry';
import { htmlNeedsPoweredPreview } from '../../src/components/file-viewer-render-mode';

interface FileViewerPreviewFixture {
  projectId: string;
  file: {
    kind?: string;
    name: string;
  };
  isDeck?: boolean;
  liveHtml?: string;
  projectKind?: string;
}

const fixtureSources = new Map<string, string>();
const fixtureDecks = new Map<string, boolean>();
const fixturePowered = new Map<string, boolean>();
const fixtureNavigations = new Map<string, ProjectScopedPreviewNavigation>();
const lastFixtureNavigation = new Map<string, ProjectScopedPreviewNavigation>();
let navigationSequence = 0;
let observer: MutationObserver | null = null;
let harnessedPreviewWindows = new WeakSet<Window>();
let autoSettle = true;

function resetFixtureState(): void {
  fixtureSources.clear();
  fixtureDecks.clear();
  fixturePowered.clear();
  fixtureNavigations.clear();
  lastFixtureNavigation.clear();
  navigationSequence = 0;
}

function fixtureKey(projectId: string, fileName: string): string {
  return `${projectId}\0${fileName}`;
}

/**
 * Turn the old `liveHtml` test shorthand into a settled on-disk fixture.
 * Product code no longer creates a second srcDoc document for settled HTML;
 * these tests should exercise the same real-URL Runtime as the application.
 */
export function prepareSettledFileViewerFixture<T extends FileViewerPreviewFixture>(props: T): T {
  if (props.file.kind !== 'html') return props;
  const key = fixtureKey(props.projectId, props.file.name);
  fixtureDecks.set(key, props.isDeck === true || props.projectKind === 'slide_deck');
  if (props.liveHtml === undefined) return props;
  fixtureSources.set(key, props.liveHtml);
  fixturePowered.set(key, htmlNeedsPoweredPreview(props.liveHtml));
  return { ...props, liveHtml: undefined };
}

export function syntheticPreviewFileSource(projectId: string, fileName: string): string | undefined {
  return fixtureSources.get(fixtureKey(projectId, fileName));
}

export function setSyntheticPreviewFileSource(
  projectId: string,
  fileName: string,
  source: string,
): void {
  fixtureSources.set(fixtureKey(projectId, fileName), source);
}

export function useSyntheticProjectScopedPreviewNavigation(options: {
  authorizationKey: string;
  enabled?: boolean;
  fileName: string;
  projectId: string;
  retainLastGoodWhenDisabled?: boolean;
  revisionKey: string;
}) {
  const fileKey = fixtureKey(options.projectId, options.fileName);
  if (options.enabled === false) {
    const retained = options.retainLastGoodWhenDisabled
      ? lastFixtureNavigation.get(fileKey) ?? null
      : null;
    return {
      scoped: retained,
      loading: false,
      unavailable: false,
      expiresAt: retained?.renewalScope.expiresAt ?? null,
    };
  }
  const key = [
    options.authorizationKey,
    options.projectId,
    options.fileName,
    options.revisionKey,
  ].join('\0');
  let scoped = fixtureNavigations.get(key);
  if (!scoped) {
    const sequence = ++navigationSequence;
    const sessionId = `fixture-scope-${String(sequence).padStart(4, '0')}`;
    const encodedPath = options.fileName.split('/').map(encodeURIComponent).join('/');
    scoped = {
      sessionId,
      normalUrl: `http://n-${sessionId}.localhost:43111/${encodedPath}`,
      poweredUrl: `http://p-${sessionId}.localhost:43111/${encodedPath}`,
      documentVersion: `fixture-document-${sequence}`,
      runtimeProtocol: 'universal',
      previewPolicy: {
        sandboxProfile: fixturePowered.get(fileKey) ? 'powered' : 'normal',
        guards: { storage: false, focus: false, redirect: false },
        deck: fixtureDecks.get(fileKey) ?? false,
      },
      renewalScope: {
        href: `/api/projects/${encodeURIComponent(options.projectId)}/preview/${sessionId}/`,
        expiresAt: Date.now() + 60 * 60 * 1000,
      },
    };
    fixtureNavigations.set(key, scoped);
  }
  lastFixtureNavigation.set(fileKey, scoped);
  return {
    scoped,
    loading: false,
    unavailable: false,
    expiresAt: scoped.renewalScope.expiresAt,
  };
}

function isFixtureFrame(frame: HTMLIFrameElement): boolean {
  return frame.dataset.odSessionId?.startsWith('fixture-scope-') ?? false;
}

function emitRuntimeMessage(frame: HTMLIFrameElement, data: Record<string, unknown>): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: {
        protocolVersion: PREVIEW_RUNTIME_PROTOCOL_VERSION,
        sessionId: frame.dataset.odSessionId,
        documentVersion: frame.dataset.odDocumentVersion,
        ...data,
      },
    }));
  });
}

function scheduleRuntimeMessage(frame: HTMLIFrameElement, data: Record<string, unknown>): void {
  queueMicrotask(() => {
    if (!frame.isConnected || !isFixtureFrame(frame)) return;
    emitRuntimeMessage(frame, data);
  });
}

function harnessStandbyFrame(frame: HTMLIFrameElement): void {
  if (!isFixtureFrame(frame)) return;
  const target = frame.contentWindow;
  if (!target || harnessedPreviewWindows.has(target)) return;
  harnessedPreviewWindows.add(target);
  vi.spyOn(target, 'postMessage').mockImplementation((message: unknown) => {
    if (typeof message !== 'object' || message === null) return;
    const data = message as {
      enabledCapabilities?: readonly PreviewRuntimeCapability[];
      revision?: number;
      type?: string;
    };
    if (data.type === 'od:preview:probe' && autoSettle) {
      scheduleRuntimeMessage(frame, {
        type: 'od:preview:hello',
        availableCapabilities: [...PREVIEW_RUNTIME_CAPABILITIES],
      });
      scheduleRuntimeMessage(frame, { type: 'od:preview:ready' });
    } else if (data.type === 'od:preview:set-capabilities') {
      scheduleRuntimeMessage(frame, {
        type: 'od:preview:capabilities-applied',
        enabledCapabilities: [...(data.enabledCapabilities ?? [])],
      });
    } else if (
      data.type === 'od:preview:presentation-state-barrier'
      && typeof data.revision === 'number'
    ) {
      scheduleRuntimeMessage(frame, {
        type: 'od:preview:presentation-state-applied',
        revision: data.revision,
      });
    }
  });
  if (autoSettle) settleFileViewerPreviewRuntimeStandby(frame);
}

export function settleFileViewerPreviewRuntimeStandby(frame: HTMLIFrameElement): void {
  scheduleRuntimeMessage(frame, {
    type: 'od:preview:hello',
    availableCapabilities: [...PREVIEW_RUNTIME_CAPABILITIES],
  });
  scheduleRuntimeMessage(frame, { type: 'od:preview:ready' });
}

export function setFileViewerPreviewRuntimeAutoSettle(enabled: boolean): void {
  autoSettle = enabled;
}

function discoverRuntimeFrames(): void {
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(
    '[data-testid="preview-runtime-frame-standby"]',
  )) {
    harnessStandbyFrame(frame);
  }
  for (const frame of document.querySelectorAll<HTMLIFrameElement>(
    '[data-testid="preview-runtime-frame-current"]',
  )) {
    if (isFixtureFrame(frame)) frame.setAttribute('data-testid', 'artifact-preview-frame');
  }
}

export function installFileViewerPreviewRuntimeHarness(): void {
  observer?.disconnect();
  resetFixtureState();
  harnessedPreviewWindows = new WeakSet<Window>();
  autoSettle = true;
  observer = new MutationObserver(discoverRuntimeFrames);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-testid'],
    childList: true,
    subtree: true,
  });
}

export function uninstallFileViewerPreviewRuntimeHarness(): void {
  observer?.disconnect();
  observer = null;
  resetFixtureState();
}

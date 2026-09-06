// @vitest-environment jsdom
// Scope-expiry coverage for the converged real-URL Preview Runtime. Renewing
// the same capability never navigates the active document; replacing a lost
// capability stages a candidate and promotes it atomically after handshake.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FileViewer as ProductFileViewer } from '../../src/components/FileViewer';
import type { ProjectScopedPreviewNavigation } from '../../src/providers/registry';
import type { ProjectFile } from '../../src/types';
import {
  installFileViewerPreviewRuntimeHarness,
  prepareSettledFileViewerFixture,
  setFileViewerPreviewRuntimeAutoSettle,
  settleFileViewerPreviewRuntimeStandby,
  syntheticPreviewFileSource,
  uninstallFileViewerPreviewRuntimeHarness,
} from '../helpers/file-viewer-preview-runtime';

const navigationState = vi.hoisted(() => ({
  current: null as ProjectScopedPreviewNavigation | null,
  loading: false,
  unavailable: false,
}));

vi.mock('../../src/providers/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/registry')>();
  return {
    ...actual,
    fetchProjectFileText(
      projectId: string,
      name: string,
      options?: Parameters<typeof actual.fetchProjectFileText>[2],
    ) {
      const fixture = syntheticPreviewFileSource(projectId, name);
      return fixture === undefined
        ? actual.fetchProjectFileText(projectId, name, options)
        : Promise.resolve(fixture);
    },
  };
});

vi.mock('../../src/runtime/use-project-preview-session-navigation', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../src/runtime/use-project-preview-session-navigation')
  >();
  return {
    ...actual,
    useProjectScopedPreviewNavigation: () => ({
      scoped: navigationState.current,
      loading: navigationState.loading,
      unavailable: navigationState.unavailable,
      expiresAt: navigationState.current?.renewalScope.expiresAt ?? null,
    }),
  };
});

function navigation(input: {
  documentVersion: string;
  expiresAt: number;
  sessionId: string;
}): ProjectScopedPreviewNavigation {
  return {
    sessionId: input.sessionId,
    normalUrl: `http://n-${input.sessionId}.localhost:43111/deck.html`,
    poweredUrl: `http://p-${input.sessionId}.localhost:43111/deck.html`,
    documentVersion: input.documentVersion,
    runtimeProtocol: 'universal',
    previewPolicy: {
      sandboxProfile: 'normal',
      guards: { storage: false, focus: false, redirect: false },
      deck: false,
    },
    renewalScope: {
      href: `/api/projects/project-1/preview/${input.sessionId}/`,
      expiresAt: input.expiresAt,
    },
  };
}

function htmlFile(): ProjectFile {
  return {
    name: 'deck.html',
    path: 'deck.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Page',
      entry: 'deck.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function FileViewer(props: ComponentProps<typeof ProductFileViewer>) {
  return <ProductFileViewer {...prepareSettledFileViewerFixture(props)} />;
}

function standbyFrame(): HTMLIFrameElement {
  return screen.getByTestId('preview-runtime-frame-standby') as HTMLIFrameElement;
}

function currentFrame(): HTMLIFrameElement {
  return (screen.queryByTestId('artifact-preview-frame')
    ?? screen.getByTestId('preview-runtime-frame-current')) as HTMLIFrameElement;
}

async function promoteStandby(): Promise<HTMLIFrameElement> {
  const frame = await waitFor(standbyFrame);
  settleFileViewerPreviewRuntimeStandby(frame);
  await waitFor(() => expect(currentFrame()).toBe(frame));
  return frame;
}

const viewerProps = {
  projectId: 'project-1',
  projectKind: 'prototype',
  file: htmlFile(),
  liveHtml: '<!doctype html><html><body><main>URL loaded</main></body></html>',
} as const;

beforeEach(() => {
  installFileViewerPreviewRuntimeHarness();
  setFileViewerPreviewRuntimeAutoSettle(false);
  navigationState.current = navigation({
    sessionId: 'fixture-scope-renew-0001',
    documentVersion: 'fixture-document-renew-0001',
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  navigationState.loading = false;
  navigationState.unavailable = false;
  vi.stubGlobal('fetch', vi.fn(async () => new Response(viewerProps.liveHtml, { status: 200 })));
});

afterEach(() => {
  navigationState.current = null;
  uninstallFileViewerPreviewRuntimeHarness();
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FileViewer real-URL preview scope expiry', () => {
  it('renews an active scope without replacing or navigating the document', async () => {
    const view = render(<FileViewer {...viewerProps} />);
    const current = await promoteStandby();
    const initialSrc = current.src;

    navigationState.current = {
      ...navigationState.current!,
      renewalScope: {
        ...navigationState.current!.renewalScope,
        expiresAt: navigationState.current!.renewalScope.expiresAt + 60 * 60 * 1000,
      },
    };
    view.rerender(<FileViewer {...viewerProps} filesRefreshKey={1} />);

    expect(currentFrame()).toBe(current);
    expect(current.src).toBe(initialSrc);
    expect(current.getAttribute('data-od-active')).toBe('true');
    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
  });

  it('keeps last-good visible while scope renewal is loading or unavailable', async () => {
    const view = render(<FileViewer {...viewerProps} />);
    const current = await promoteStandby();

    navigationState.loading = true;
    view.rerender(<FileViewer {...viewerProps} filesRefreshKey={1} />);
    expect(currentFrame()).toBe(current);
    expect(current.getAttribute('data-od-active')).toBe('true');

    navigationState.loading = false;
    navigationState.unavailable = true;
    view.rerender(<FileViewer {...viewerProps} filesRefreshKey={2} />);
    expect(currentFrame()).toBe(current);
    expect(current.getAttribute('data-od-active')).toBe('true');
    expect(screen.queryByTestId('preview-runtime-frame-standby')).toBeNull();
  });

  it('replaces a lost scope without exposing an empty active-document window', async () => {
    const view = render(<FileViewer {...viewerProps} />);
    const current = await promoteStandby();

    navigationState.current = navigation({
      sessionId: 'fixture-scope-renew-0002',
      documentVersion: navigationState.current!.documentVersion,
      expiresAt: Date.now() + 60 * 60 * 1000,
    });
    view.rerender(<FileViewer {...viewerProps} filesRefreshKey={1} />);
    const candidate = await waitFor(standbyFrame);

    expect(candidate).not.toBe(current);
    expect(currentFrame()).toBe(current);
    expect(current.isConnected).toBe(true);
    expect(current.getAttribute('data-od-active')).toBe('true');
    expect(candidate.getAttribute('data-od-active')).toBe('false');

    settleFileViewerPreviewRuntimeStandby(candidate);
    await waitFor(() => expect(currentFrame()).toBe(candidate));
    expect(candidate.src).toContain('fixture-scope-renew-0002');
  });
});

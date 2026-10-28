// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoverTouchpointOverlay, hoverBridgeRect, placeHoverOverlay } from '../../src/components/HoverTouchpointOverlay';
import { OpenDesignTouchpointElement, type WebTouchpointContent } from '../../src/components/touchpoint-component';
vi.mock('../../src/components/touchpoint-component', async importOriginal => ({
  ...await importOriginal<typeof import('../../src/components/touchpoint-component')>(),
  verifyWebTouchpoint: vi.fn(async () => ({ entryUrl: 'blob:fixture', resourceUrls: new Map(), dispose: () => undefined })),
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it('offers a keyboard entry, restores focus on Escape, and supports the hover gap and narrow viewport', async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
  const mount = vi.spyOn(OpenDesignTouchpointElement.prototype, 'mount').mockResolvedValue(
    undefined,
  );
  const content = (
    placementKey: 'opend.home.hover-entry' | 'opend.home.hover-layer',
  ): WebTouchpointContent => ({
    id: placementKey,
    placementKey,
    locale: 'en-US',
    manifestHash: 'sha256:fixture',
    entryPath: 'entry.js',
    entryDigest: 'sha256:fixture',
    entryModule: '',
    resources: [],
    buildIdentity: { fingerprint: 'fixture' },
    manifest: {
      formatVersion: 2,
      runtimeKind: 'web-component',
      runtimeApiVersion: 1,
      platformWrapperVersion: 'vela-touchpoint-wrapper-v1',
      sdkVersion: 'vela-touchpoint-sdk-v1',
      contentLine: 'fixture',
      placements: [
        {
          key: placementKey,
          entry: 'entry.js',
          resources: [],
          locales: ['en-US'],
          requiredCapabilities: [],
          staticActions: [],
        },
      ],
      resources: ['entry.js'],
      images: [],
    },
    runtime: {
      kind: 'web-component',
      apiVersion: 1,
      wrapperVersion: 'vela-touchpoint-wrapper-v1',
      sdkVersion: 'vela-touchpoint-sdk-v1',
    },
  });
  const onLayerClose = vi.fn();
  render(
    createElement(HoverTouchpointOverlay, {
      onLayerClose,
      entry: content('opend.home.hover-entry'),
      layer: content('opend.home.hover-layer'),
      isAuthorized: () => true,
    }),
  );
  await act(async () => {});
  const entry = screen
    .getByTestId('cms-hover-overlay-root')
    .querySelector<HTMLElement>('opend-touchpoint')!;
  expect(entry.hidden).toBe(false);
  expect(entry.tabIndex).toBe(0);
  act(() => entry.focus());
  expect(document.activeElement).toBe(entry);
  // ENT-4: Tab focus alone must not expand; Enter does.
  expect(entry.getAttribute('aria-expanded')).toBe('false');
  fireEvent.keyDown(entry, { key: 'Enter' });
  expect(entry.getAttribute('aria-expanded')).toBe('true');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(document.activeElement).toBe(entry);
  expect(entry.getAttribute('aria-expanded')).toBe('false');
  for (const key of ['Enter', ' ']) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      entry.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(entry.getAttribute('aria-expanded')).toBe('true');
    fireEvent.keyDown(window, { key: 'Escape' });
  }
  expect(onLayerClose).not.toHaveBeenCalled();
  const callbacks = mount.mock.calls[1]![5] as { requestClose?: (reason?: 'close') => void };
  const requestClose = callbacks.requestClose!;
  // A closed/hidden layer never records an X callback.
  act(() => requestClose('close'));
  expect(onLayerClose).not.toHaveBeenCalled();
  const openVisibleLayer = async () => {
    await act(async () => { fireEvent.pointerEnter(entry); });
    await act(async () => { await vi.advanceTimersByTimeAsync(32); });
    expect(entry.getAttribute('aria-expanded')).toBe('true');
    const layer = screen.getByTestId('cms-hover-overlay-root').querySelectorAll<HTMLElement>('opend-touchpoint')[1]!;
    expect(layer.hidden).toBe(false);
  };
  await openVisibleLayer();
  act(() => { requestClose('close'); requestClose('close'); });
  expect(entry.getAttribute('aria-expanded')).toBe('false');
  expect(onLayerClose).toHaveBeenCalledTimes(1);
  // Reopening the same mounted, verified pair is a new visible presentation.
  await openVisibleLayer();
  act(() => { requestClose('close'); requestClose('close'); });
  expect(entry.getAttribute('aria-expanded')).toBe('false');
  expect(onLayerClose).toHaveBeenCalledTimes(2);
  const anchor = {
    left: 280,
    right: 312,
    top: 10,
    bottom: 42,
    width: 32,
    height: 32,
  };
  const layer = {
    left: 8,
    right: 312,
    top: 50,
    bottom: 250,
    width: 304,
    height: 200,
  };
  expect(hoverBridgeRect(anchor, layer)).toMatchObject({
    left: 280,
    right: 312,
    top: 42,
    bottom: 50,
  });
  const position = placeHoverOverlay(
    anchor,
    { width: 800, height: 800 },
    { left: 0, right: 320, top: 0, bottom: 480, width: 320, height: 480 },
  );
  expect(position.left).toBe(16);
  expect(position.maxWidth).toBe(288);
  expect(position.maxHeight).toBeLessThanOrEqual(448);
});

const entryShellSource = readFileSync(
  resolve(process.cwd(), 'src/components/EntryShell.tsx'),
  'utf8',
);
const appSource = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const overlayStyles = readFileSync(
  resolve(process.cwd(), 'src/components/HoverTouchpointOverlay.module.css'),
  'utf8',
);

describe('HoverTouchpointOverlay top-right host', () => {
  it('mounts the authorized hover entry in the top-right campaign slot, not the shell root', () => {
    const topRightSlot = entryShellSource.indexOf('topRightSlot=');
    const hoverHost = entryShellSource.indexOf('<ProductionCampaignHover');
    expect(topRightSlot).toBeGreaterThanOrEqual(0);
    expect(hoverHost).toBeGreaterThan(topRightSlot);
    expect(entryShellSource.slice(hoverHost, hoverHost + 200)).toContain(
      'authenticated={amrLoggedIn === true}',
    );
    expect(entryShellSource.slice(hoverHost, hoverHost + 200)).toContain(
      'sessionSubject={amrAccountId}',
    );
    expect(appSource).not.toContain('<ProductionCampaignHover');
  });

  it('keeps the hover entry distinct from the account badge and removes its bottom-right positioning', () => {
    expect(entryShellSource).toContain('<ProductionCampaignBadge');
    expect(entryShellSource).toContain('not renamed from—the account badge');
    const entryRuleStart = overlayStyles.indexOf('.entry {');
    const entryRuleEnd = overlayStyles.indexOf('}', entryRuleStart);
    const entryRule = overlayStyles.slice(entryRuleStart, entryRuleEnd);
    expect(entryRule).toContain('position: relative');
    expect(entryRule).not.toContain('bottom:');
    expect(entryRule).not.toContain('right:');
    expect(entryRule).not.toContain('position: fixed');
  });
});

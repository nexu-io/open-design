// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  artifactRenderReadinessScript,
  waitForArtifactContent,
  waitForArtifactResources,
  waitForRenderedArtifactContent,
} from '../../src/main/artifact-export-readiness.js';

function runReadinessScript(timeoutMs: number): Promise<boolean> {
  return window.eval(artifactRenderReadinessScript(timeoutMs)) as Promise<boolean>;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.innerHTML = '<head></head><body></body>';
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 16),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('artifact image render readiness', () => {
  it('runs in an isolated world without a user gesture', async () => {
    const executeJavaScriptInIsolatedWorld = vi.fn(async () => true);

    await waitForRenderedArtifactContent({ executeJavaScriptInIsolatedWorld }, 1_250);

    expect(executeJavaScriptInIsolatedWorld).toHaveBeenCalledWith(
      1001,
      [{ code: artifactRenderReadinessScript(1_250) }],
      false,
    );
  });

  it('does not delay documents that do not compile JSX at runtime', async () => {
    document.body.innerHTML = '<canvas width="16" height="16"></canvas>';

    await expect(runReadinessScript(1_000)).resolves.toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('waits for a runtime JSX render root to mount content', async () => {
    document.body.innerHTML = '<div id="root"></div><script type="text/babel"></script>';
    let settled = false;
    const ready = runReadinessScript(1_000).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(settled).toBe(false);

    document.querySelector('#root')!.innerHTML = '<p>Mounted content</p>';
    await vi.advanceTimersByTimeAsync(50);

    await expect(ready).resolves.toBe(true);
  });

  it('waits for an existing UI-kit placeholder to be replaced', async () => {
    document.body.innerHTML = [
      '<div id="root"><div class="ui-kit-loading">Loading Acme UI kit...</div></div>',
      '<script type="text/babel"></script>',
    ].join('');
    let settled = false;
    const ready = runReadinessScript(1_000).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(settled).toBe(false);

    document.querySelector('#root')!.innerHTML = '<main>Mounted UI kit</main>';
    await vi.advanceTimersByTimeAsync(50);

    await expect(ready).resolves.toBe(true);
  });

  it('accepts runtime JSX content that mounted before the readiness check', async () => {
    document.body.innerHTML = '<div id="root"><main>Already mounted</main></div><script type="text/babel"></script>';
    const ready = runReadinessScript(1_000);

    await vi.advanceTimersByTimeAsync(50);

    await expect(ready).resolves.toBe(true);
  });

  it('accepts a mounted loading subview after replacing the UI-kit placeholder', async () => {
    document.body.innerHTML = [
      '<div id="root"><div class="ui-kit-loading">Loading Acme UI kit...</div></div>',
      '<script type="text/babel"></script>',
    ].join('');
    let settled = false;
    const ready = runReadinessScript(1_000).then((result) => {
      settled = true;
      return result;
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(settled).toBe(false);

    document.querySelector('#root')!.innerHTML = [
      '<main><h1>Mounted UI kit</h1>',
      '<section aria-busy="true">Loading chart</section></main>',
    ].join('');
    await vi.advanceTimersByTimeAsync(50);

    await expect(ready).resolves.toBe(true);
  });

  it('fails loudly when a runtime render root stays empty', async () => {
    document.body.innerHTML = '<div id="root"></div><script type="text/babel"></script>';
    const ready = runReadinessScript(250);

    await vi.advanceTimersByTimeAsync(250);

    await expect(ready).resolves.toBe(false);
  });

  it('reports a runtime render timeout through the host boundary', async () => {
    const executeJavaScriptInIsolatedWorld = vi.fn(async () => false);

    await expect(waitForRenderedArtifactContent({ executeJavaScriptInIsolatedWorld }, 1_250)).rejects.toThrow(
      'Image export timed out waiting for runtime-rendered content (1250ms)',
    );
  });

  it('bounds the late-resource settling pass', async () => {
    const waiting = waitForArtifactResources(new Promise<void>(() => {}), 250);
    const rejection = expect(waiting).rejects.toThrow(
      'Image export timed out waiting for late resources (250ms)',
    );

    await vi.advanceTimersByTimeAsync(250);

    await rejection;
  });

  it('rejects invalid timeout values before running renderer code', async () => {
    const executeJavaScriptInIsolatedWorld = vi.fn(async () => true);

    await expect(waitForRenderedArtifactContent({ executeJavaScriptInIsolatedWorld }, 0)).rejects.toThrow(
      'Image render timeout must be a positive finite number',
    );
    expect(executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  });

  it('keeps runtime-render readiness out of the PDF path', async () => {
    const executeJavaScriptInIsolatedWorld = vi.fn(async () => true);
    const settleResources = vi.fn(async () => {});

    await waitForArtifactContent('pdf', { executeJavaScriptInIsolatedWorld }, settleResources);

    expect(settleResources).toHaveBeenCalledOnce();
    expect(executeJavaScriptInIsolatedWorld).not.toHaveBeenCalled();
  });

  it('runs render readiness and bounded resource settling for images', async () => {
    const executeJavaScriptInIsolatedWorld = vi.fn(async () => true);
    const settleResources = vi.fn(async () => {});

    await waitForArtifactContent('image', { executeJavaScriptInIsolatedWorld }, settleResources);

    expect(executeJavaScriptInIsolatedWorld).toHaveBeenCalledOnce();
    expect(settleResources).toHaveBeenCalledOnce();
  });
});

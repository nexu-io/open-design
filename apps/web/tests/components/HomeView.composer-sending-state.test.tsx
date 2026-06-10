// @vitest-environment jsdom

// Home composer send must show an in-flight state (#4082).
//
// Submitting from Home kicks off an async project-creation /
// conversation-creation roundtrip before navigation unmounts the screen.
// Without a sending state the button stays idle through that window, so
// the app "looks frozen" and accepts duplicate sends. These tests pin the
// contract: while the submit promise is pending the button is disabled and
// labelled Sending…, repeat clicks are swallowed, and a failed creation
// re-enables the composer with a visible error so the user can retry.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { writeHomeGuideStage } from '../../src/components/home-hero/firstRunGuide';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
});

function stubPluginsFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
}

function renderHome(onSubmit: (payload: unknown) => Promise<boolean> | void) {
  // Keep the first-run guide quiet so sheen classes never race the
  // sending-state classes asserted below.
  writeHomeGuideStage('done');
  stubPluginsFetch();
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={[]}
        onSubmit={onSubmit}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />
    </I18nProvider>,
  );
}

describe('home composer sending state', () => {
  it('shows Sending… and swallows repeat clicks while creation is in flight', async () => {
    let resolveSubmit: (accepted: boolean) => void = () => undefined;
    const onSubmit = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveSubmit = resolve; }),
    );
    renderHome(onSubmit);

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('Build a landing page');
    const submit = (await screen.findByTestId('home-hero-submit')) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    await waitFor(() => {
      expect(submit.disabled).toBe(true);
    });
    expect(submit.textContent).toContain('Sending…');
    expect(submit.className).toContain('is-sending');

    // A second click during the in-flight window must not start a second run.
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    // Flush the resolution so the trailing state update lands inside the test.
    resolveSubmit(true);
    await waitFor(() => {
      expect(submit.disabled).toBe(false);
    });
  });

  it('re-enables the composer and surfaces an error when creation fails', async () => {
    let resolveSubmit: (accepted: boolean) => void = () => undefined;
    const onSubmit = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveSubmit = resolve; }),
    );
    renderHome(onSubmit);

    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt('Build a landing page');
    const submit = (await screen.findByTestId('home-hero-submit')) as HTMLButtonElement;

    fireEvent.click(submit);
    await waitFor(() => {
      expect(submit.disabled).toBe(true);
    });

    resolveSubmit(false);
    await waitFor(() => {
      expect(submit.disabled).toBe(false);
    });
    expect(submit.textContent).toContain('Send');
    expect(submit.className).not.toContain('is-sending');
    expect((await screen.findByRole('alert')).textContent).toMatch(/try again/i);

    // The failure path must leave the composer retryable.
    fireEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });
});

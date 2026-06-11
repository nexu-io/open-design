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

function stubPluginsFetch(plugins: unknown[] = []) {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return new Response(JSON.stringify({ plugins }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
}

const WEB_PROTOTYPE_PLUGIN = {
  id: 'example-web-prototype',
  title: 'Web Prototype',
  version: '0.1.0',
  trust: 'bundled' as const,
  sourceKind: 'bundled' as const,
  source: '/tmp/web-prototype',
  capabilitiesGranted: ['prompt:inject'],
  fsPath: '/tmp/web-prototype',
  installedAt: 0,
  updatedAt: 0,
  manifest: {
    name: 'example-web-prototype',
    title: 'Web Prototype',
    version: '0.1.0',
    description: 'General-purpose desktop web prototype.',
    od: { kind: 'scenario', taskKind: 'new-generation' },
  },
};

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

  it('does not spend the one-shot example-prompt marker on a failed create', async () => {
    // The example-prompt override is a one-shot localStorage marker. A
    // rejected create keeps the composer retryable, so the marker must not
    // be consumed until the create is accepted — otherwise the retry drops
    // examplePromptContext and the user loses the example flow they picked.
    const onSubmit = vi
      .fn<(payload: unknown) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    writeHomeGuideStage('done');
    // The prototype rail binds the example plugin, so its apply roundtrip
    // must succeed for submit() to reach onSubmit.
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [WEB_PROTOTYPE_PLUGIN] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (typeof url === 'string' && url.includes('/apply')) {
        return new Response(JSON.stringify({ ok: true, appliedPlugin: { snapshotId: 'snap-1' } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    render(
      <I18nProvider initial="en">
        <HomeView
          projects={[]}
          onSubmit={onSubmit}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
        />
      </I18nProvider>,
    );

    // Seeding through a fallback prompt-example card is what arms the
    // examplePromptContext marker.
    fireEvent.click(await screen.findByTestId('home-hero-rail-prototype'));
    const exampleCards = await screen.findAllByTestId('home-hero-prompt-example');
    fireEvent.click(exampleCards[0]!);

    const submit = (await screen.findByTestId('home-hero-submit')) as HTMLButtonElement;
    await waitFor(() => expect(submit.disabled).toBe(false));

    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0]![0] as { examplePromptContext?: unknown }).examplePromptContext).toBeTruthy();

    // Create was rejected: the marker stays unspent so the retry resends it.
    await waitFor(() => expect(submit.disabled).toBe(false));
    expect(window.localStorage.getItem('od:example-prompt-used')).toBeNull();

    fireEvent.click(submit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));
    expect((onSubmit.mock.calls[1]![0] as { examplePromptContext?: unknown }).examplePromptContext).toBeTruthy();

    // Only now — after an accepted create — is the one-shot marker spent.
    await waitFor(() => {
      expect(window.localStorage.getItem('od:example-prompt-used')).toBe('1');
    });
  });
});

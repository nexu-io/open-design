// @vitest-environment jsdom
//
// PR-3 Task 17: page-pattern "Use" handoff into the home composer.
//
// Two layers of coverage:
// 1. Pure helper unit tests — `createPagePatternUseHandoff` shapes the
//    variant correctly and falls back through examplePrompt -> description
//    -> a synthesized default.
// 2. HomeView integration — when a `page-pattern-use` handoff arrives,
//    the composer textarea is seeded with the pattern's prompt and gains
//    focus, exactly like the existing `plugin-authoring` handoff does.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { HomeView } from '../../src/components/HomeView';
import { createPagePatternUseHandoff } from '../../src/components/home-hero/plugin-authoring';

describe('createPagePatternUseHandoff', () => {
  it('builds a page-pattern-use variant from the example prompt', () => {
    const handoff = createPagePatternUseHandoff(7, {
      id: 'auth-login',
      examplePrompt: 'Login prompt seed.',
      name: 'Auth · Login',
      pageType: 'auth.login',
    });
    expect(handoff).toMatchObject({
      id: 7,
      source: 'page-pattern-use',
      patternId: 'auth-login',
      prompt: 'Login prompt seed.',
      pageType: 'auth.login',
      focus: true,
    });
  });

  it('falls back to description when examplePrompt is missing', () => {
    const handoff = createPagePatternUseHandoff(1, {
      id: 'x',
      description: 'Desc.',
      name: 'X',
      pageType: 'a.b',
    });
    expect(handoff).toMatchObject({ source: 'page-pattern-use', prompt: 'Desc.' });
  });

  it('falls back to a default sentence when both example prompt and description are missing', () => {
    const handoff = createPagePatternUseHandoff(2, {
      id: 'x',
      name: 'X Name',
      pageType: 'a.b',
    });
    expect(handoff).toMatchObject({
      source: 'page-pattern-use',
      prompt: 'Use the X Name pattern.',
    });
  });

  it('treats whitespace-only examplePrompt as missing', () => {
    const handoff = createPagePatternUseHandoff(3, {
      id: 'x',
      examplePrompt: '   \n  ',
      description: 'Real description.',
      name: 'X',
      pageType: 'a.b',
    });
    expect(handoff).toMatchObject({
      source: 'page-pattern-use',
      prompt: 'Real description.',
    });
  });
});

describe('HomeView page-pattern handoff', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    cleanup();
  });

  it('seeds the composer with the pattern prompt and focuses the textarea', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => (
      new Response(JSON.stringify({ plugins: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    )));
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });

    const handoff = createPagePatternUseHandoff(1, {
      id: 'auth-login',
      examplePrompt: 'Build a login page for a SaaS dashboard.',
      name: 'Auth · Login',
      pageType: 'auth.login',
    });

    render(
      <HomeView
        projects={[]}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
        promptHandoff={handoff}
      />,
    );

    const input = await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect((input as HTMLTextAreaElement).value).toBe(
        'Build a login page for a SaaS dashboard.',
      );
      expect(document.activeElement).toBe(input);
    });
  });
});

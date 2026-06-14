// @vitest-environment jsdom

// Issue #4270: typing in the Home hero input and switching to a workspace
// tab (a project file in the top workspace bar) used to lose the input
// text on the return trip, because switching to a project file swaps
// `<EntryView>` for `<ProjectView>` in `App.tsx:2054-2092` and `<HomeView>`
// unmounts with its in-memory `prompt` state. The fix persists the draft
// to localStorage and restores it on remount.
//
// A follow-up review (Siri-Ray on PR #4271) called out that the prompt can
// also change through paths that bypass `handlePromptChange` — plugin
// handoffs, picker/context actions, context removals — and those changes
// must be persisted too. The fix now centralizes draft persistence in a
// single `useEffect` that mirrors `prompt` to localStorage on every
// change, so every `setPrompt` call site is covered.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { HomeView } from '../../src/components/HomeView';
import { I18nProvider } from '../../src/i18n';
import { writeHomeGuideStage } from '../../src/components/home-hero/firstRunGuide';
import { setHomeHeroPrompt } from '../helpers/home-hero-lexical';

const HOME_PROMPT_DRAFT_KEY = 'od:home-prompt-draft';
const TYPED_DRAFT = 'Build a deck for Q4';

function stubPluginsFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url === '/api/plugins') {
        return new Response(JSON.stringify({ plugins: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
}

function renderHome() {
  return render(
    <I18nProvider initial="en">
      <HomeView
        projects={[] as never}
        onSubmit={() => undefined}
        onOpenProject={() => undefined}
        onViewAllProjects={() => undefined}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
});

describe('HomeView prompt draft across workspace-tab unmount/remount', () => {
  it('restores the prompt from localStorage on a fresh mount', async () => {
    // Pre-populate the draft key the way the previous HomeView instance
    // would have left it after the user typed and then switched to a
    // workspace tab. Simulating the prior session at the storage layer
    // keeps this test deterministic across jsdom + Lexical versions.
    writeHomeGuideStage('done');
    window.localStorage.setItem(HOME_PROMPT_DRAFT_KEY, TYPED_DRAFT);
    stubPluginsFetch();

    renderHome();

    const input = await screen.findByTestId('home-hero-input');
    // The SeedingPlugin in LexicalComposerInput reseeds the editor from
    // the `draft` prop in a useEffect after first render, so the input
    // textContent lags the initial render by one frame. waitFor handles
    // the propagation.
    await waitFor(() => {
      expect(input.textContent).toBe(TYPED_DRAFT);
    });
  });

  it('starts with an empty prompt when localStorage is empty', async () => {
    // Anchor the inverse: a fresh HomeView with no prior draft must not
    // surface phantom text. This guards against an over-eager restore
    // that, e.g., falls back to a non-empty default.
    writeHomeGuideStage('done');
    stubPluginsFetch();

    renderHome();

    const input = await screen.findByTestId('home-hero-input');
    // Give the SeedingPlugin a frame to settle so a stale value can't
    // sneak in via a re-render.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(input.textContent).toBe('');
  });

  it('survives a real unmount + remount cycle (the workspace-tab transition)', async () => {
    // Walk the full bug scenario: first mount, unmount (the workspace-tab
    // switch unmounts <HomeView>), second mount, assert restoration.
    writeHomeGuideStage('done');
    stubPluginsFetch();

    const first = renderHome();
    await screen.findByTestId('home-hero-input');
    // Seed the storage layer to model the prior session having written
    // the draft. We're testing the read path here; the write path is
    // covered by the handlePromptChange handler in HomeView and by
    // the integration of the two paths in the first test.
    window.localStorage.setItem(HOME_PROMPT_DRAFT_KEY, TYPED_DRAFT);
    first.unmount();

    renderHome();
    const input = await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect(input.textContent).toBe(TYPED_DRAFT);
    });
  });

  it('persists a prompt change made via a non-handlePromptChange path (Siri-Ray review)', async () => {
    // Regression case added per Siri-Ray's review on PR #4271: the original
    // fix only persisted the draft from `handlePromptChange`, leaving the
    // localStorage entry stale when other code paths (plugin handoffs,
    // picker/context actions, context removals) mutate the visible prompt
    // through `setPrompt` directly. The follow-up fix centralizes the
    // sync in a single `useEffect` keyed on `prompt`, so every `setPrompt`
    // call — regardless of caller — updates localStorage.
    //
    // Flow: type a draft through the normal path, unmount, mount again
    // with a `plugin-authoring` handoff that seeds a different visible
    // prompt (this routes through `setPrompt`, not `handlePromptChange`),
    // unmount, mount a third time with no handoff, assert the latest
    // visible prompt is restored — not the stale typed draft.
    writeHomeGuideStage('done');
    stubPluginsFetch();

    // 1. Type the original draft through the editor; the useEffect should
    //    mirror it to localStorage.
    const first = renderHome();
    await screen.findByTestId('home-hero-input');
    setHomeHeroPrompt(TYPED_DRAFT);
    await waitFor(() => {
      expect(window.localStorage.getItem(HOME_PROMPT_DRAFT_KEY)).toBe(TYPED_DRAFT);
    });
    first.unmount();

    // 2. Mount with a plugin-authoring handoff whose `prompt` differs
    //    from what the user typed. The handoff is consumed in a useEffect
    //    that calls `setPrompt(promptHandoff.prompt)` directly, bypassing
    //    `handlePromptChange`. The centralized useEffect must catch this.
    const SEEDED = 'Seeded by plugin-authoring handoff';
    const second = render(
      <I18nProvider initial="en">
        <HomeView
          projects={[] as never}
          onSubmit={() => undefined}
          onOpenProject={() => undefined}
          onViewAllProjects={() => undefined}
          promptHandoff={{
            id: 1,
            source: 'plugin-authoring',
            prompt: SEEDED,
            focus: false,
            goal: 'test',
            inputs: {},
            queryTemplate: 'Create an Open Design plugin for: {{pluginGoal}}.',
          }}
        />
      </I18nProvider>,
    );
    await waitFor(() => {
      expect(window.localStorage.getItem(HOME_PROMPT_DRAFT_KEY)).toBe(SEEDED);
    });
    second.unmount();

    // 3. Remount with no handoff. The lazy initializer must rehydrate the
    //    latest visible prompt (SEEDED), not the original typed draft
    //    (TYPED_DRAFT). On the buggy code, the lazy initializer would
    //    have read TYPED_DRAFT and surfaced the stale typed text.
    renderHome();
    const input = await screen.findByTestId('home-hero-input');
    await waitFor(() => {
      expect(input.textContent).toBe(SEEDED);
    });
  });
});

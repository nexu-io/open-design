// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workspaceContextMock = vi.hoisted(() => ({
  state: {
    context: null,
    resourceReadIdentity: null,
    loading: false,
    identityChangePending: false,
    failure: 'unsupported' as 'unsupported' | 'unavailable' | undefined,
  },
}));

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => workspaceContextMock.state,
  };
});

import { HomeView } from '../../src/components/HomeView';
import { HOME_APPLY_TEMPLATE_EVENT } from '../../src/components/home-hero/chips';
import type { DesignSystemSummary, PromptTemplateSummary } from '../../src/types';
// HomeHero's prompt input migrated from a <textarea> + highlight overlay to the
// same Lexical contenteditable the project composer uses. It still has
// data-testid="home-hero-input" but has no `.value`, so we drive it through the
// Lexical-aware helper (real editor.update) and read it back via the serializer.
import { homeHeroPromptText, setHomeHeroPrompt } from '../helpers/home-hero-lexical';

const MEDIA_PLUGIN = pluginRecord('od-media-generation', 'Media generation');
const PROTOTYPE_PLUGIN = pluginRecord('example-web-prototype', 'Web prototype');
const HYPERFRAMES_PLUGIN = pluginRecord('example-hyperframes', 'HyperFrames');

const PROMPT_TEMPLATES: PromptTemplateSummary[] = [
  {
    id: 'image-product',
    surface: 'image',
    title: 'Image product concept',
    summary: 'A polished product image prompt.',
    category: 'product',
    model: 'gpt-image-2',
    aspect: '16:9',
    source: { repo: 'open-design/image-prompts', license: 'MIT' },
  },
  {
    id: 'video-reveal',
    surface: 'video',
    title: 'Video reveal',
    summary: 'A short reveal video prompt.',
    category: 'product',
    model: 'doubao-seedance-2-0-260128',
    aspect: '16:9',
    source: { repo: 'open-design/video-prompts', license: 'MIT' },
  },
  {
    id: 'hyperframes-caption',
    surface: 'video',
    title: 'HyperFrames captions',
    summary: 'A caption-led HyperFrames prompt.',
    category: 'motion',
    model: 'hyperframes-html',
    aspect: '16:9',
    source: { repo: 'heygen-com/hyperframes', license: 'MIT' },
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  workspaceContextMock.state = {
    context: null,
    resourceReadIdentity: null,
    loading: false,
    identityChangePending: false,
    failure: 'unsupported',
  };
});

describe('HomeView media composer options', () => {
  it('keeps the type tabs interactive while switching to Image', async () => {
    const mediaApplyResponse = new Promise<Response>(() => undefined);
    stubFetch({ mediaApplyResponse });
    renderHome();

    // Image lives behind the row's 更多 popover.
    const more = await screen.findByTestId('home-hero-type-pills-more');
    await waitFor(() => expect((more as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(more);
    const imageTab = await screen.findByTestId('home-hero-type-pill-image-more');
    expect((imageTab as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(imageTab);

    // Picking retires the row; the composer pill names the type and its clear
    // stays live while the media apply is still pending, so the choice is
    // reversible at every moment.
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-template-trigger').textContent).toContain('Image');
    });
    expect(screen.getByTestId('home-hero-template-clear')).toBeTruthy();
  });

  it('drops the Home composer mode picker and still submits in Design mode', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await screen.findByTestId('home-hero-input');

    // 设计 is the app default AND the default SELECTION: the composer opens with
    // the Design pill showing, so the mode the request will run in is stated on
    // screen rather than hidden behind a neutral glyph. The submitted payload
    // carries design either way.
    // The 「设计」 pill was removed from the Home composer footer; Home creates
    // keep running in the app default — design — which the payload states.
    expect(screen.queryByTestId('composer-mode-trigger')).toBeNull();

    await setHomePrompt('Create a clean loading animation');
    await submitHome();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      prompt: 'Create a clean loading animation',
      conversationMode: 'design',
    });
  });

  it('renders the design-system popover outside the prompt editor (not clipped by it)', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    await openOption('designSystem');

    // The shared DesignSystemPicker portals its popover to document.body, so it
    // can never be clipped by the prompt editor's (or footer row's) overflow.
    const popover = screen.getByTestId('project-ds-picker-popover');
    expect(screen.getByTestId('home-hero-input').contains(popover)).toBe(false);
    expect(document.body.contains(popover)).toBe(true);
  });

  it('surfaces the persistent design-system picker and no footer pills for Image/Video or HyperFrames/Audio', async () => {
    stubFetch();
    renderHome();

    // The design-system picker is now the persistent row below the composer, so
    // it is present for every kind and no longer a footer pill. Image/Video add
    // no inline footer pills either; ratio / duration / model / resolution are
    // asked for during the run (mirroring prototype/deck).
    expect(screen.getByTestId('home-hero-design-system-trigger')).toBeTruthy();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-designSystem')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-ratio')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-resolution')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-designSystem')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-ratio')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-resolution')).toBeNull();

    // HyperFrames / Audio keep no pre-flight pills at all.
    await clickHomeRailChip('hyperframes');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-ratio')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-audioType')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();
    // Inline `{{slot}}` prompt widgets are gone too; nothing is injected into
    // the prompt body.
    expect(screen.queryByTestId('home-hero-prompt-slot-text')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-voice')).toBeNull();
  });

  it('includes only published user-created design systems in the Home style picker', async () => {
    stubFetch();
    renderHome({
      designSystems: [
        designSystem('user:acme-draft', 'Acme Draft System', 'user', 'draft'),
        designSystem('user:acme-published', 'Acme Published System', 'user', 'published'),
        designSystem('neutral-modern', 'Neutral Modern', 'built-in', 'published'),
      ],
    });

    await clickHomeRailChip('image');
    await openOption('designSystem');

    // The shared picker is a flat searchable list (no group headers). Home still
    // filters to selectable systems: a published user system shows, a draft one
    // does not, and built-in presets show.
    const popover = screen.getByTestId('project-ds-picker-popover');
    expect(within(popover).getByRole('option', { name: /Acme Published System/i })).toBeTruthy();
    expect(within(popover).queryByRole('option', { name: /Acme Draft System/i })).toBeNull();
    expect(within(popover).getByRole('option', { name: /Neutral Modern/i })).toBeTruthy();
  });

  it('opens the Home style picker without duplicate group key warnings', async () => {
    stubFetch();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      renderHome({
        defaultDesignSystemId: 'official-default',
        designSystems: [
          designSystem('official-default', 'Official Default', 'built-in', 'published'),
          designSystem('official-alt', 'Official Alt', 'built-in', 'published'),
        ],
      });

      await clickHomeRailChip('image');
      await openOption('designSystem');

      const messages = consoleError.mock.calls.map((call) => call.map(String).join(' '));
      expect(messages.some((message) => message.includes('Encountered two children with the same key'))).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('switches media chips without opening the replacement dialog', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(screen.queryByRole('dialog', { name: /replace current prompt/i })).toBeNull();

    await setHomePrompt('Make this prompt personally tuned.');
    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(screen.queryByRole('dialog', { name: /replace current prompt/i })).toBeNull();
  });

  it('keeps the prompt empty for Audio and never injects inline slot widgets', async () => {
    stubFetch();
    renderHome();

    // Audio type / model / duration / voice are no longer footer pills — the
    // agent asks for them during the run. The composer just stays empty.
    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-audioType')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-prompt')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-text')).toBeNull();
  });

  it('hides the full selector grid for media surfaces', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(screen.queryByRole('combobox', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Ratio' })).toBeNull();

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(screen.queryByRole('combobox', { name: 'Duration' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Ratio' })).toBeNull();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    // No audio pills/combobox at all now — those questions moved to the agent.
    expect(screen.queryByTestId('home-hero-footer-option-audioType')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Audio type' })).toBeNull();
    // The inline plugin inputs form was removed from the Home composer, so the
    // non-footer "Text" input no longer renders as a free-standing control.
    expect(screen.queryByRole('textbox', { name: 'Text' })).toBeNull();
    expect(promptIsEmpty()).toBe(true);
  });

  it('splits Video and HyperFrames templates into separate submitted metadata', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('video');
    await setHomePrompt('Make a product reveal video.');
    await submitHome();
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        projectMetadata: expect.objectContaining({
          promptTemplate: expect.objectContaining({ id: 'video-reveal' }),
        }),
      }));
    });

    onSubmit.mockClear();
    await clickHomeRailChip('hyperframes');
    await setHomePrompt('Make a HyperFrames motion video.');
    await submitHome();
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        projectMetadata: expect.objectContaining({
          promptTemplate: expect.objectContaining({ id: 'hyperframes-caption' }),
        }),
      }));
    });
  });

  it('updates submitted template metadata after media templates load', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    const props = homeProps({ onSubmit, promptTemplates: [] });
    const view = render(<HomeView {...props} />);

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    await setHomePrompt('Create a campaign image.');
    await submitHome();
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        projectMetadata: expect.not.objectContaining({
          promptTemplate: expect.anything(),
        }),
      }));
    });

    onSubmit.mockClear();
    view.rerender(<HomeView {...props} promptTemplates={PROMPT_TEMPLATES} />);
    await submitHome();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        projectMetadata: expect.objectContaining({
          promptTemplate: expect.objectContaining({ id: 'image-product' }),
        }),
      }));
    });
  });

  it('includes the selected design system in the submitted payload and omits asked-for media fields', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({
      onSubmit,
      designSystems: [
        designSystem('editorial-noir', 'Editorial Noir', 'built-in', 'published'),
        designSystem('brand-alpha', 'Brand Alpha', 'user', 'published'),
      ],
    });

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    await chooseOption('designSystem', 'brand-alpha', 'Brand Alpha');
    setHomePrompt('Create a launch teaser.');
    await submitHome();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'Create a launch teaser.',
        designSystemId: 'brand-alpha',
        // ratio / duration are no longer seeded into metadata — the agent asks.
        projectMetadata: expect.not.objectContaining({
          videoAspect: expect.anything(),
          videoLength: expect.anything(),
        }),
      }));
    });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      projectMetadata: expect.objectContaining({ kind: 'video' }),
    }));
  });

  it('strips deferred media settings from the forwarded pluginInputs', async () => {
    // The footer pills for ratio / duration / model / resolution / audioType /
    // voice were removed so the agent asks for them via question-form during
    // the run. `buildHomeMediaComposer` still seeds those defaults into the
    // composer state, so submission must strip them before forwarding —
    // otherwise the run arrives with `ratio: 16:9` / `duration: 5` baked in and
    // the first-turn discovery flow has nothing left to ask.
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    await setHomePrompt('Create a launch teaser.');
    await submitHome();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [{ pluginInputs }] = onSubmit.mock.calls[0] as [{ pluginInputs?: Record<string, unknown> }];
    expect(pluginInputs).toBeTruthy();
    for (const deferred of ['model', 'ratio', 'resolution', 'duration', 'audioType', 'voice']) {
      expect(pluginInputs).not.toHaveProperty(deferred);
    }
  });

  it('resolves the run-facing snapshot from inputs with the deferred media settings stripped', async () => {
    // Regression at the prompt/run boundary: the daemon renders `## Plugin
    // inputs` verbatim from `snapshot.inputs` and tells the agent not to re-ask
    // about anything listed there. The snapshot's inputs come from the body of
    // the `/apply` call that yields `appliedPluginSnapshotId`, so submission
    // must re-apply with the deferred footer/media fields stripped — otherwise
    // the run prompt carries `ratio: 16:9` / `duration: 5` / `model: …` and the
    // first-turn question-form discovery flow stays suppressed even though
    // `onSubmit.pluginInputs` was stripped.
    const fetchMock = stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    await setHomePrompt('Create a launch teaser.');
    await submitHome();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [{ appliedPluginSnapshotId }] = onSubmit.mock.calls[0] as [{ appliedPluginSnapshotId?: string | null }];
    expect(appliedPluginSnapshotId).toBe('snap-od-media-generation');

    // The apply call that produced the forwarded snapshot is the LAST media
    // apply: its inputs become `snapshot.inputs`, so they must already be free
    // of the deferred settings.
    const applyCalls = fetchMock.mock.calls.filter(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')
    ));
    expect(applyCalls.length).toBeGreaterThan(0);
    const snapshotInputs = JSON.parse(String(applyCalls.at(-1)?.[1]?.body)).inputs as Record<string, unknown>;
    for (const deferred of ['model', 'ratio', 'resolution', 'duration', 'audioType', 'voice']) {
      expect(snapshotInputs).not.toHaveProperty(deferred);
    }
    // The required brief inputs the apply validates against survive the strip.
    expect(snapshotInputs).toHaveProperty('subject');
  });

  it('submits HyperFrames as a video project with the hyperframes-html model', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('hyperframes');
    await setHomePrompt('Create a HyperFrames launch bumper.');
    // submit() re-applies the plugin from the deferral-stripped inputs before
    // forwarding, so onSubmit fires after the apply round-trip resolves.
    await submitHome();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      projectKind: 'video',
      projectMetadata: expect.objectContaining({
        kind: 'video',
        videoModel: 'hyperframes-html',
      }),
    })));
  });

  it('does not wait for rich Workspace context after a directory-scoped plugin was selected', async () => {
    const fetchMock = stubFetch({ teamMediaPlugin: true });
    const onSubmit = vi.fn();
    const props = homeProps({ onSubmit });
    const view = render(<HomeView {...props} />);

    await clickHomeRailChip('video');
    await setHomePrompt('Create a directory-scoped launch teaser.');
    workspaceContextMock.state = {
      context: null,
      resourceReadIdentity: null,
      loading: true,
      identityChangePending: false,
      failure: undefined,
    };
    view.rerender(<HomeView {...props} />);
    await submitHome();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const localApply = fetchMock.mock.calls.filter(([url]) => (
      typeof url === 'string'
      && url.includes('/api/plugins/od-media-generation/apply')
    )).at(-1);
    expect(localApply).toBeTruthy();
    expect(new Headers(localApply?.[1]?.headers).has('x-od-workspace-id')).toBe(false);
  });

  it('keeps bundled plugins usable when identity is pending and the directory is empty', async () => {
    const fetchMock = stubFetch({ emptyWorkspaceDirectory: true });
    const onSubmit = vi.fn();
    const props = homeProps({ onSubmit });
    const view = render(<HomeView {...props} />);

    await clickHomeRailChip('video');
    await setHomePrompt('Create a launch teaser after signing out.');
    const applyCountBeforeSubmit = fetchMock.mock.calls.filter(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')
    )).length;
    workspaceContextMock.state = {
      context: null,
      resourceReadIdentity: null,
      loading: false,
      identityChangePending: true,
      failure: undefined,
    };
    view.rerender(<HomeView {...props} />);
    await submitHome();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const applyCountAfterSubmit = fetchMock.mock.calls.filter(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')
    )).length;
    expect(applyCountAfterSubmit).toBe(applyCountBeforeSubmit + 1);
    const submittedApply = fetchMock.mock.calls.filter(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')
    )).at(-1);
    expect(new Headers(submittedApply?.[1]?.headers).has('x-od-workspace-id')).toBe(false);
  });

  it('does not wait for directory discovery when applying a bundled plugin', async () => {
    const fetchMock = stubFetch({ workspaceDirectoryStatus: 503 });
    const onSubmit = vi.fn();
    const props = homeProps({ onSubmit });
    const view = render(<HomeView {...props} />);

    await clickHomeRailChip('video');
    await setHomePrompt('Create a local launch teaser while identity is unavailable.');
    workspaceContextMock.state = {
      context: null,
      resourceReadIdentity: null,
      loading: true,
      identityChangePending: true,
      failure: 'unavailable',
    };
    view.rerender(<HomeView {...props} />);
    const directoryReadsBeforeSubmit = fetchMock.mock.calls.filter(([url]) => (
      typeof url === 'string' && url === '/api/workspace/directory'
    )).length;
    await submitHome();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const directoryReadsAfterSubmit = fetchMock.mock.calls.filter(([url]) => (
      typeof url === 'string' && url === '/api/workspace/directory'
    )).length;
    expect(directoryReadsAfterSubmit).toBe(directoryReadsBeforeSubmit);
    const submittedApply = fetchMock.mock.calls.filter(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')
    )).at(-1);
    expect(new Headers(submittedApply?.[1]?.headers).has('x-od-workspace-id')).toBe(false);
  });

  it('does not expose a team plugin for unscoped apply while workspace identity is pending', async () => {
    const fetchMock = stubFetch({
      emptyWorkspaceDirectory: true,
      teamMediaPlugin: true,
    });
    workspaceContextMock.state = {
      context: null,
      resourceReadIdentity: null,
      loading: false,
      identityChangePending: true,
      failure: undefined,
    };
    renderHome();

    await screen.findByTestId('home-hero-input');
    expect(
      (screen.getByTestId('home-hero-type-pill-deck') as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(fetchMock.mock.calls.some(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')
    ))).toBe(false);
  });

  it('keeps a locally catalogued plugin usable until local reconciliation removes it', async () => {
    const fetchMock = stubFetch({
      emptyWorkspaceDirectory: true,
      teamMediaPlugin: true,
    });
    const onSubmit = vi.fn();
    workspaceContextMock.state = {
      context: null,
      resourceReadIdentity: null,
      loading: false,
      identityChangePending: false,
      failure: undefined,
    };
    renderHome({ onSubmit });

    await clickHomeRailChip('video');
    await setHomePrompt('Create a launch teaser.');
    await submitHome();
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const apply = fetchMock.mock.calls.find(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')
    ));
    expect(apply).toBeTruthy();
    expect(new Headers(apply?.[1]?.headers).has('x-od-workspace-id')).toBe(false);
  });

  it('preserves od-media-generation required inputs when submitting media chips', async () => {
    const fetchMock = stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('image');
    await setHomePrompt('Create a campaign image.');
    await submitHome();

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) => (
        typeof url === 'string' &&
        url.includes('/api/plugins/od-media-generation/apply') &&
        JSON.parse(String(init?.body)).inputs.subject === 'a polished product concept'
      ))).toBe(true);
    });
    const applyCall = fetchMock.mock.calls.find(([url]) => (
      typeof url === 'string' && url.includes('/api/plugins/od-media-generation/apply')
    ));
    expect(JSON.parse(String(applyCall?.[1]?.body)).inputs).toMatchObject({
      mediaKind: 'image',
      subject: 'a polished product concept',
      style: 'cinematic, high-quality, on-brand',
      aspect: '16:9',
    });
  });
});

function renderHome(overrides: Partial<React.ComponentProps<typeof HomeView>> = {}) {
  return render(<HomeView {...homeProps(overrides)} />);
}

function homeProps(overrides: Partial<React.ComponentProps<typeof HomeView>> = {}): React.ComponentProps<typeof HomeView> {
  return {
    projects: [],
    onSubmit: () => undefined,
    onOpenProject: () => undefined,
    onViewAllProjects: () => undefined,
    promptTemplates: PROMPT_TEMPLATES,
    ...overrides,
  };
}

function stubFetch(options: {
  elevenLabsVoices?: Array<{ voiceId: string; name: string; category?: string }>;
  elevenLabsVoiceError?: string;
  emptyWorkspaceDirectory?: boolean;
  mediaApplyResponse?: Promise<Response>;
  teamMediaPlugin?: boolean;
  workspaceDirectoryStatus?: number;
} = {}) {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  const mediaPlugin = options.teamMediaPlugin
    ? { ...MEDIA_PLUGIN, source: 'team:plugin:workspace-a:od-media-generation' }
    : MEDIA_PLUGIN;
  const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return json({ plugins: [mediaPlugin, PROTOTYPE_PLUGIN, HYPERFRAMES_PLUGIN] });
    }
    if (typeof url === 'string' && url === '/api/mcp/servers') {
      return json({ servers: [], templates: [] });
    }
    if (typeof url === 'string' && url === '/api/workspace/directory') {
      if (options.workspaceDirectoryStatus) {
        return json({ error: 'workspace_unavailable' }, options.workspaceDirectoryStatus);
      }
      return json({
        items: options.emptyWorkspaceDirectory
          ? []
          : [{
              workspaceId: 'workspace-cold',
              workspaceName: 'Cold workspace',
              workspaceType: 'team',
              workspaceMemberId: 'member-cold',
              role: 'member',
              memberStatus: 'active',
              lifecycleState: 'active',
            }],
        activeWorkspaceId: null,
      });
    }
    if (typeof url === 'string' && url.includes('/apply')) {
      const pluginId = url.split('/api/plugins/')[1]?.split('/apply')[0] ?? 'od-media-generation';
      if (pluginId === 'od-media-generation') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { inputs?: Record<string, unknown> };
        const inputs = body.inputs ?? {};
        if (!inputs.subject) {
          return json({ error: 'missing_inputs', fields: ['subject'] }, 422);
        }
        if (options.mediaApplyResponse) return options.mediaApplyResponse;
      }
      return json(applyResult(pluginId));
    }
    if (typeof url === 'string' && url === '/api/media/providers/elevenlabs/voices?limit=100') {
      if (options.elevenLabsVoiceError) {
        return json({ error: options.elevenLabsVoiceError }, 400);
      }
      return json({
        voices: options.elevenLabsVoices ?? [
          { voiceId: 'voice-rachel', name: 'Rachel', category: 'premade' },
        ],
      });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openOption(name: string) {
  // The design-system picker moved out of the footer to the persistent row
  // below the composer; it renders the shared DesignSystemPicker, whose popover
  // is portaled to document.body as `project-ds-picker-popover`. Any other
  // footer field still opens from the inline FooterSelectOption `-menu`.
  if (name === 'designSystem') {
    fireEvent.click(await screen.findByTestId('home-hero-design-system-trigger'));
    await waitFor(() => expect(screen.getByTestId('project-ds-picker-popover')).toBeTruthy());
    return;
  }
  fireEvent.click(await screen.findByTestId(`home-hero-footer-option-${name}`));
  await waitFor(() => expect(screen.getByTestId(`home-hero-footer-option-${name}-menu`)).toBeTruthy());
}

async function clickHomeRailChip(id: string) {
  // A type already picked retires the row, and the pill has no menu — so
  // switching means clearing back to the empty state first.
  const clear = screen.queryByTestId('home-hero-template-clear');
  if (clear) fireEvent.click(clear);
  const lead = await screen.findByTestId('home-hero-type-pill-prototype');
  await waitFor(() => expect((lead as HTMLButtonElement).disabled).toBe(false));
  let pill = screen.queryByTestId(`home-hero-type-pill-${id}`);
  if (!pill) {
    // Types behind 更多 mount only while its popover is open.
    fireEvent.click(screen.getByTestId('home-hero-type-pills-more'));
    pill = screen.queryByTestId(`home-hero-type-pill-${id}-more`);
  }
  if (pill) {
    fireEvent.click(pill);
    return;
  }
  // Types outside the fixed row (media, HyperFrames, …) are reached the way
  // the workspace tabs-bar hands one off: the apply-template window event,
  // which HomeHero applies exactly as a row click.
  fireEvent.keyDown(document, { key: 'Escape' });
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent(HOME_APPLY_TEMPLATE_EVENT, { detail: { chipId: id } }),
    );
  });
}

// Drive the Lexical editor and let the OnChange -> onPromptChange -> setPrompt
// state flush settle (the submit path reads HomeView's React `prompt` state, not
// the contenteditable DOM). Lexical fires the change listener synchronously under
// the helper's `discrete: true`, but the React state update lands a microtask
// later, so we await one tick inside act().
async function setHomePrompt(value: string) {
  setHomeHeroPrompt(value);
  await act(async () => {
    await Promise.resolve();
  });
}

async function submitHome() {
  await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByTestId('home-hero-submit'));
}

// An empty Lexical editor serializes its placeholder <br> as a lone '\n', so the
// composer's clear-empty convention is `text.trim() === ''` (formerly the
// textarea's `.value === ''`).
function promptIsEmpty(): boolean {
  return homeHeroPromptText().trim() === '';
}

async function chooseOption(name: string, value: string, label = value) {
  await openOption(name);
  if (name === 'designSystem') {
    // The shared DesignSystemPicker selects on mouseDown from its portaled list.
    const popover = screen.getByTestId('project-ds-picker-popover');
    const option = within(popover).getAllByRole('option').find((item) => {
      const text = item.textContent ?? '';
      return text.includes(label) || text.includes(value);
    });
    if (!option) throw new Error(`No option "${label}" for ${name}`);
    fireEvent.mouseDown(option);
    return;
  }
  // The inline `<select>` prompt-widget path (home-hero-prompt-option-*-select)
  // is gone; selection now always happens via the footer options menu.
  const menu = screen.getByTestId(`home-hero-footer-option-${name}-menu`);
  const option = within(menu).getAllByRole('option').find((item) => {
    const text = item.textContent ?? '';
    return text.includes(label) || text.includes(value);
  });
  if (!option) throw new Error(`No option "${label}" for ${name}`);
  fireEvent.click(option);
}

function pluginRecord(id: string, title: string) {
  return {
    id,
    title,
    version: '0.1.0',
    trust: 'bundled' as const,
    sourceKind: 'bundled' as const,
    source: `/tmp/${id}`,
    capabilitiesGranted: ['prompt:inject'],
    fsPath: `/tmp/${id}`,
    installedAt: 0,
    updatedAt: 0,
    manifest: {
      name: id,
      title,
      version: '0.1.0',
      description: title,
      od: {
        kind: 'scenario',
        taskKind: 'new-generation',
        useCase: { query: 'Create media.' },
        inputs: [],
      },
    },
  };
}

function designSystem(
  id: string,
  title: string,
  source: DesignSystemSummary['source'],
  status: DesignSystemSummary['status'],
): DesignSystemSummary {
  return {
    id,
    title,
    source,
    status,
    category: source === 'user' ? 'Brand' : 'Starter',
    summary: `${title} summary.`,
    swatches: ['#111111', '#ffffff'],
    surface: 'web',
    isEditable: source === 'user',
  };
}

function applyResult(pluginId: string) {
  return {
    query: 'Create media.',
    contextItems: [],
    inputs: [],
    assets: [],
    mcpServers: [],
    trust: 'trusted',
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    projectMetadata: {},
    appliedPlugin: {
      snapshotId: `snap-${pluginId}`,
      pluginId,
      pluginVersion: '0.1.0',
      manifestSourceDigest: 'a'.repeat(64),
      inputs: {},
      resolvedContext: { items: [] },
      capabilitiesGranted: ['prompt:inject'],
      capabilitiesRequired: ['prompt:inject'],
      assetsStaged: [],
      taskKind: 'new-generation',
      appliedAt: 0,
      connectorsRequired: [],
      connectorsResolved: [],
      mcpServers: [],
      status: 'fresh',
    },
  };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

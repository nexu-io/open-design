// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/components/home-hero/PlaceholderCarousel', () => ({
  PlaceholderCarousel: () => null,
}));

vi.mock('../../src/collab/useWorkspaceContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/collab/useWorkspaceContext')>();
  return {
    ...actual,
    useWorkspaceContext: () => ({
      context: null,
      loading: false,
      failure: 'unsupported' as const,
    }),
  };
});

import { HomeView } from '../../src/components/HomeView';
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
});

describe('HomeView media composer options', () => {
  it('shows the Home composer mode picker and still defaults to Design mode', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await screen.findByTestId('home-hero-input');

    // 设计 is the app default AND the default SELECTION: the composer opens with
    // the Design pill showing, so the mode the request will run in is stated on
    // screen rather than hidden behind a neutral glyph. The submitted payload
    // carries design either way.
    expect(screen.getByTestId('composer-mode-trigger').getAttribute('aria-label')).toBe('Mode: Design');
    expect(screen.getByTestId('composer-mode-clear')).toBeTruthy();

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

  it('surfaces the persistent design-system picker and compact media controls for Image/Video only', async () => {
    stubFetch();
    renderHome();

    // The design-system picker is now the persistent row below the composer, so
    // it is present for every kind and no longer a footer pill. Image/Video use
    // dedicated model/settings controls; the legacy plugin footer pills stay
    // absent so these controls cannot leak into the real run payload.
    expect(screen.getByTestId('home-hero-design-system-trigger')).toBeTruthy();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-designSystem')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-ratio')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-resolution')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();
    expect(screen.getByTestId('media-cloud-model-demo-picker')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'image model: Seedream 5 Lite' })).toBeTruthy();
    expect(screen.queryByTestId('media-cloud-spec-demo-panel')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'image output settings' }));
    expect(screen.getByTestId('media-cloud-spec-demo-panel')).toBeTruthy();
    const imageResolution = screen.getByRole('combobox', { name: 'Resolution: 2K' });
    expect(imageResolution).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Ratio: 1:1' })).toBeTruthy();
    const imageQuantity = screen.getByRole('combobox', { name: 'Quantity: 1 image' });
    fireEvent.click(imageQuantity);
    fireEvent.click(screen.getByRole('option', { name: '4 images' }));
    expect(screen.getByRole('combobox', { name: 'Quantity: 4 images' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Duration: 5 seconds' })).toBeNull();
    expect(screen.getByTestId('media-cloud-spec-demo-panel')).not.toHaveTextContent('~$0.04');
    expect(screen.getByTestId('media-cloud-spec-demo-panel')).not.toHaveTextContent('Hosted');
    expect(screen.getByTestId('media-cloud-spec-demo-panel')).not.toHaveTextContent('Image output');
    expect(screen.getByTestId('media-cloud-spec-demo-panel')).not.toHaveTextContent('Balance');
    fireEvent.click(imageResolution);
    expect(screen.getByRole('option', { name: '2K' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: '2K' }));

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-designSystem')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-ratio')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-resolution')).toBeNull();
    expect(screen.getByRole('button', { name: 'video model: Seedance 2.5' })).toBeTruthy();
    const videoDuration = screen.getByRole('combobox', { name: 'Duration: 5 seconds' });
    expect(videoDuration).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Quantity: 1 video' })).toBeTruthy();
    const videoAudio = screen.getByRole('combobox', { name: 'Audio: Off' });
    expect(videoAudio).toBeTruthy();
    fireEvent.click(videoAudio);
    expect(screen.getByRole('option', { name: 'On' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: 'Off' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Ratio: 16:9' }));
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual([
      '1:1',
      '1:2',
      '2:1',
      '9:16',
      '16:9',
      '3:4',
      '4:3',
      '3:2',
      '2:3',
      '5:4',
      '4:5',
      '21:9',
      '9:21',
    ]);
    fireEvent.click(screen.getByRole('option', { name: '16:9' }));
    const videoPanel = screen.getByTestId('media-cloud-spec-demo-panel');
    expect(videoPanel).not.toHaveTextContent('~$0.36');
    expect(videoPanel).not.toHaveTextContent('Seedance 2.5');
    expect(videoPanel).not.toHaveTextContent('Video output');
    fireEvent.click(videoDuration);
    expect(screen.getByRole('option', { name: '5 seconds' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: '5 seconds' }));

    // HyperFrames / Audio keep no pre-flight pills at all.
    await clickHomeRailChip('hyperframes');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-ratio')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();
    expect(screen.queryByTestId('media-cloud-spec-demo-panel')).toBeNull();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-footer-option-audioType')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();
    expect(screen.queryByTestId('media-cloud-spec-demo-panel')).toBeNull();
    // Inline `{{slot}}` prompt widgets are gone too; nothing is injected into
    // the prompt body.
    expect(screen.queryByTestId('home-hero-prompt-slot-text')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-voice')).toBeNull();
  });

  it('keeps review-only AMR controls out of the user-facing media panel', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    fireEvent.click(screen.getByRole('button', { name: 'image output settings' }));
    expect(screen.queryByText('Demo states')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Insufficient allowance' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Low allowance' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Upgrade benefits' })).toBeNull();
  });

  it('expands the hovered model row to reveal its description and price', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('video');
    fireEvent.click(screen.getByRole('button', { name: 'video output settings' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Audio: Off' }));
    fireEvent.click(screen.getByRole('option', { name: 'On' }));
    const trigger = screen.getByRole('button', { name: 'video model: Seedance 2.5' });
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox', { name: 'video models' });
    const kling = within(listbox).getByRole('option', { name: 'Kling 3.0 Standard' });
    expect(within(listbox).queryByText('Multi-shot video with native audio and voice control')).toBeNull();

    fireEvent.mouseEnter(kling);
    expect(kling.className).toContain('modelOptionExpanded');
    const summary = within(kling).getByText('Multi-shot video with native audio and voice control');
    expect(summary).toBeTruthy();
    Object.defineProperty(summary, 'clientWidth', { configurable: true, value: 180 });
    Object.defineProperty(summary, 'scrollWidth', { configurable: true, value: 320 });
    fireEvent(window, new Event('resize'));
    await waitFor(() => {
      expect(summary.className).toContain('od-tooltip');
      expect(summary.getAttribute('data-tooltip')).toBe('Multi-shot video with native audio and voice control');
    });
    const hoverPrice = within(kling).getByText('~$0.63 / 5 sec');
    expect(hoverPrice).toBeTruthy();
    expect(hoverPrice.parentElement?.className).toContain('modelOptionTop');

    fireEvent.mouseLeave(listbox);
    expect(kling.className).not.toContain('modelOptionExpanded');
    expect(within(listbox).queryByText('Multi-shot video with native audio and voice control')).toBeNull();
  });

  it('shows the current document model families with their LobeHub logos', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    fireEvent.click(screen.getByRole('button', { name: 'image model: Seedream 5 Lite' }));
    const imageModels = screen.getByRole('listbox', { name: 'image models' });
    expect(within(imageModels).getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
      'Seedream 5 Lite',
      'Seedream 5 Pro',
      'Nano Banana 2',
      'GPT Image 2',
    ]);
    expect(
      within(imageModels)
        .getByRole('option', { name: 'Nano Banana 2' })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe('/model-icons/nanobanana-lobe.svg');

    fireEvent.pointerDown(document.body);
    await clickHomeRailChip('video');
    fireEvent.click(screen.getByRole('button', { name: 'video model: Seedance 2.5' }));
    const videoModels = screen.getByRole('listbox', { name: 'video models' });
    expect(within(videoModels).getAllByRole('option').map((option) => option.getAttribute('aria-label'))).toEqual([
      'Seedance 2.5',
      'MiniMax H3',
      'Kling 3.0 Standard',
      'Kling 3.0 Pro',
      'Kling 3.0 Turbo Standard',
      'Kling 3.0 Turbo Pro',
      'Kling 3.0 4K',
    ]);
    expect(
      within(videoModels)
        .getByRole('option', { name: 'Kling 3.0 Pro' })
        .querySelector('img')
        ?.getAttribute('src'),
    ).toBe('/model-icons/kling-lobe.svg');
  });

  it('keeps media popovers mutually exclusive and closes settings on outside interaction', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('video');
    const modelTrigger = screen.getByRole('button', { name: 'video model: Seedance 2.5' });
    const settingsTrigger = screen.getByRole('button', { name: 'video output settings' });

    fireEvent.click(modelTrigger);
    expect(screen.getByRole('listbox', { name: 'video models' })).toBeTruthy();

    fireEvent.click(settingsTrigger);
    expect(screen.queryByRole('listbox', { name: 'video models' })).toBeNull();
    expect(screen.getByTestId('media-cloud-spec-demo-panel')).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('media-cloud-spec-demo-panel')).toBeNull();

    fireEvent.click(settingsTrigger);
    fireEvent.click(modelTrigger);
    expect(screen.queryByTestId('media-cloud-spec-demo-panel')).toBeNull();
    expect(screen.getByRole('listbox', { name: 'video models' })).toBeTruthy();
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

  it('keeps review specs isolated from the legacy plugin selector grid', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(screen.queryByRole('combobox', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
    expect(screen.getByRole('button', { name: 'image model: Seedream 5 Lite' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'image output settings' }));
    expect(screen.getByRole('combobox', { name: 'Ratio: 1:1' })).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: 'Resolution: 2K' }));
    fireEvent.click(screen.getByRole('option', { name: '4K' }));
    expect(screen.getByTestId('media-cloud-spec-demo-panel')).not.toHaveTextContent('~$0.08');

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-template-trigger').textContent).not.toContain('None'));
    expect(screen.getByRole('combobox', { name: 'Duration: 5 seconds' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
    expect(screen.getByRole('button', { name: 'video model: Seedance 2.5' })).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Ratio: 16:9' })).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: 'Resolution: 720p' }));
    fireEvent.click(screen.getByRole('option', { name: '1080p' }));
    fireEvent.click(screen.getByRole('combobox', { name: 'Duration: 5 seconds' }));
    fireEvent.click(screen.getByRole('option', { name: '10 seconds' }));
    expect(screen.getByTestId('media-cloud-spec-demo-panel')).not.toHaveTextContent('~$1.24');

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

  it('preserves od-media-generation required inputs when applying media chips', async () => {
    const fetchMock = stubFetch();
    renderHome();

    await clickHomeRailChip('image');

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
      ratio: '16:9',
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

function stubFetch(options: { elevenLabsVoices?: Array<{ voiceId: string; name: string; category?: string }>; elevenLabsVoiceError?: string } = {}) {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
    if (typeof url === 'string' && url === '/api/plugins') {
      return json({ plugins: [MEDIA_PLUGIN, PROTOTYPE_PLUGIN, HYPERFRAMES_PLUGIN] });
    }
    if (typeof url === 'string' && url === '/api/mcp/servers') {
      return json({ servers: [], templates: [] });
    }
    if (typeof url === 'string' && url.includes('/apply')) {
      const pluginId = url.split('/api/plugins/')[1]?.split('/apply')[0] ?? 'od-media-generation';
      if (pluginId === 'od-media-generation') {
        const body = JSON.parse(String(init?.body ?? '{}')) as { inputs?: Record<string, unknown> };
        const inputs = body.inputs ?? {};
        if (!inputs.subject) {
          return json({ error: 'missing_inputs', fields: ['subject'] }, 422);
        }
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
  // #5517 removed the inline template rail from Home: every scenario template
  // is picked from the composer footer's radial Template picker. Wait until the
  // trigger and the wedge are enabled first — plugins load asynchronously, so
  // both are briefly disabled after mount.
  const trigger = await screen.findByTestId('home-hero-template-trigger');
  await waitFor(() => expect((trigger as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(trigger);
  const wedgeId = `home-hero-template-wedge-${id}`;
  await waitFor(() =>
    expect(screen.getByTestId(wedgeId).getAttribute('aria-disabled')).not.toBe('true'),
  );
  fireEvent.click(screen.getByTestId(wedgeId));
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

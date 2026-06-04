// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
});

describe('HomeView media composer options', () => {
  it('renders media option popovers outside the prompt editor (not clipped by it)', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await openOption('audioType');

    // The old clipped `.home-hero__prompt-highlight` overlay is gone with the
    // textarea->Lexical migration. The equivalent invariant is that the option
    // menu is not nested inside the prompt editor contenteditable (where the
    // editor's own overflow could clip it); it lives in the footer options row.
    const popover = screen.getByTestId('home-hero-footer-option-audioType-menu');
    expect(screen.getByTestId('home-hero-input').contains(popover)).toBe(false);
    expect(popover.closest('[data-testid="home-hero-footer-options"]')).not.toBeNull();
  });

  it('shows the correct option pills for Image, Video, HyperFrames, and Audio', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy());
    expect(promptIsEmpty()).toBe(true);
    expect(screen.getByTestId('home-hero-footer-option-designSystem')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-ratio')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-resolution')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    expect(promptIsEmpty()).toBe(true);
    expect(screen.getByTestId('home-hero-footer-option-designSystem')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-ratio')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-resolution')).toBeTruthy();

    await clickHomeRailChip('hyperframes');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    expect(promptIsEmpty()).toBe(true);
    expect(screen.getByTestId('home-hero-footer-option-ratio')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-audioType')).toBeTruthy());
    expect(promptIsEmpty()).toBe(true);
    expect(screen.getByTestId('home-hero-footer-option-audioType')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy();
    // Inline `{{slot}}` prompt widgets are gone; audio inputs live in the footer
    // options row (asserted above), never injected into the prompt body.
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

    const menu = screen.getByTestId('home-hero-footer-option-designSystem-menu');
    expect(within(menu).getByText('Personal')).toBeTruthy();
    expect(within(menu).getByRole('option', { name: /Acme Published System/i })).toBeTruthy();
    expect(within(menu).queryByRole('option', { name: /Acme Draft System/i })).toBeNull();
    expect(within(menu).getByText('Official preset')).toBeTruthy();
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
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy());
    expect(screen.queryByRole('dialog', { name: /replace current prompt/i })).toBeNull();

    await setHomePrompt('Make this prompt personally tuned.');
    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    expect(screen.queryByRole('dialog', { name: /replace current prompt/i })).toBeNull();
  });

  it('exposes only Speech and Sound effect in the Home Audio workflow', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await openOption('audioType');

    const audioTypes = optionTexts(screen.getByTestId('home-hero-footer-option-audioType-menu'));
    expect(audioTypes).toEqual(['Speech', 'Sound effect']);
  });

  it('keeps the prompt empty when switching Speech and Sound effect audio sources', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-audioType')).toBeTruthy());
    expect(promptIsEmpty()).toBe(true);
    // Inline `{{slot}}` prompt widgets are gone post-migration; audio inputs are
    // never injected into the prompt body, so the editor stays empty.
    expect(screen.queryByTestId('home-hero-prompt-slot-prompt')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-text')).toBeNull();

    await chooseOption('audioType', 'sfx', 'Sound effect');

    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-audioType').textContent).toBe('Sound effect'));
    expect(screen.queryByTestId('home-hero-prompt-slot-text')).toBeNull();
    expect(screen.queryByTestId('home-hero-prompt-slot-prompt')).toBeNull();
    expect(promptIsEmpty()).toBe(true);
  });

  it('keeps media option edits from back-filling the textarea', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await chooseOption('duration', '60', '60s');
    expect(promptIsEmpty()).toBe(true);

    await chooseOption('audioType', 'sfx', 'Sound effect');
    expect(promptIsEmpty()).toBe(true);
  });

  it('hides the full selector grid for media surfaces', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy());
    expect(screen.queryByRole('combobox', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Ratio' })).toBeNull();

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    expect(screen.queryByRole('combobox', { name: 'Duration' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Model' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Ratio' })).toBeNull();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-audioType')).toBeTruthy());
    // The old full editor grid is gone: "Audio type" is now a footer pill (a
    // listbox-trigger button), not a native <select> combobox.
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
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy());
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

  it('includes selected Home footer options in the submitted payload', async () => {
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
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    await chooseOption('designSystem', 'brand-alpha', 'Brand Alpha');
    await chooseOption('ratio', '1:1', '1:1');
    await chooseOption('duration', '10', '10s');
    setHomePrompt('Create a launch teaser.');
    await submitHome();

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        prompt: 'Create a launch teaser.',
        designSystemId: 'brand-alpha',
        projectMetadata: expect.objectContaining({
          kind: 'video',
          videoAspect: '1:1',
          videoLength: 10,
        }),
      }));
    });
  });

  it('submits HyperFrames as a video project with the hyperframes-html model', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('hyperframes');
    await setHomePrompt('Create a HyperFrames launch bumper.');
    await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      projectKind: 'video',
      projectMetadata: expect.objectContaining({
        kind: 'video',
        videoModel: 'hyperframes-html',
      }),
    }));
  });

  it('does not add an ElevenLabs voice prompt when only the Audio tab is selected', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy());
    // The inline `{{slot}}` voice widget is gone; the real intent here is that
    // selecting an ElevenLabs voice never back-fills the prompt editor body
    // (asserted via promptIsEmpty below).
    expect(screen.queryByTestId('home-hero-prompt-slot-voice')).toBeNull();

    await chooseOption('model', 'elevenlabs-v3');

    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-prompt-slot-voice')).toBeNull();
  });

  it('keeps the prompt empty when ElevenLabs returns no voices', async () => {
    stubFetch({ elevenLabsVoices: [] });
    renderHome();

    await clickHomeRailChip('audio');
    await chooseOption('model', 'elevenlabs-v3');

    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-prompt-slot-voice')).toBeNull();
  });

  it('keeps the prompt empty when ElevenLabs voice lookup fails', async () => {
    stubFetch({ elevenLabsVoiceError: 'no ElevenLabs API key' });
    renderHome();

    await clickHomeRailChip('audio');
    await chooseOption('model', 'elevenlabs-v3');

    expect(promptIsEmpty()).toBe(true);
    expect(screen.queryByTestId('home-hero-prompt-slot-voice')).toBeNull();
  });

  it('caps Sound effect duration options and normalizes stale speech durations', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('audio');
    await chooseOption('duration', '60', '60s');
    expect(promptIsEmpty()).toBe(true);

    await chooseOption('audioType', 'sfx', 'Sound effect');

    expect(promptIsEmpty()).toBe(true);
    await openOption('duration');
    const durationOptions = optionTexts(screen.getByTestId('home-hero-footer-option-duration-menu'));
    expect(durationOptions).toEqual(['5s', '10s', '15s', '30s']);

    await setHomePrompt('Create a crisp product notification sound.');
    fireEvent.click(screen.getByTestId('home-hero-submit'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        pluginInputs: expect.objectContaining({ audioType: 'sfx', duration: 30 }),
      }));
    });
  });

  it('recomputes media metadata from textarea edits at submit time', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    await setHomePrompt(
      "Create premium product-studio audio from the user's brief using minimax-tts for 30 seconds: polished, restrained, clear, and brand-ready.",
    );
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        pluginInputs: expect.objectContaining({ duration: 30 }),
        projectMetadata: expect.objectContaining({ audioDuration: 30 }),
      }));
    });
  });

  it('uses the Audio text input as the audio source and plugin subject', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    await setHomePrompt(
      'Create premium product-studio audio from Welcome to Open Design. using minimax-tts for 10 seconds: polished, restrained, clear, and brand-ready.',
    );

    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        pluginInputs: expect.objectContaining({
          subject: 'Welcome to Open Design.',
          text: 'Welcome to Open Design.',
        }),
      }));
    });
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
  // The inline `{{slot}}` prompt-widget path (home-hero-prompt-slot-*) is gone;
  // media options now always open from the footer options row.
  fireEvent.click(await screen.findByTestId(`home-hero-footer-option-${name}`));
  await waitFor(() => expect(screen.getByTestId(`home-hero-footer-option-${name}-menu`)).toBeTruthy());
}

async function clickHomeRailChip(id: string) {
  const activeChip = screen.queryByTestId('home-hero-active-type-chip');
  if (activeChip) {
    fireEvent.click(activeChip);
  }
  fireEvent.click(await screen.findByTestId(`home-hero-rail-${id}`));
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

function optionTexts(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((option) => option.textContent ?? '');
}

// An empty Lexical editor serializes its placeholder <br> as a lone '\n', so the
// composer's clear-empty convention is `text.trim() === ''` (formerly the
// textarea's `.value === ''`).
function promptIsEmpty(): boolean {
  return homeHeroPromptText().trim() === '';
}

async function chooseOption(name: string, value: string, label = value) {
  await openOption(name);
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

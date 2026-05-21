// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeView } from '../../src/components/HomeView';
import type { PromptTemplateSummary } from '../../src/types';

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
  it('keeps the inline option popover outside the clipped textarea highlight overlay', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await openOption('text');

    const popover = screen.getByTestId('home-hero-prompt-option-text');
    expect(popover.closest('.home-hero__prompt-highlight')).toBeNull();
  });

  it('shows the correct option pills for Image, Video, HyperFrames, and Audio', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy());
    expect(screen.getByTestId('home-hero-footer-option-designSystem')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-ratio')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-resolution')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-footer-option-duration')).toBeNull();

    await clickHomeRailChip('video');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    expect(screen.getByTestId('home-hero-footer-option-designSystem')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-ratio')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-resolution')).toBeTruthy();

    await clickHomeRailChip('hyperframes');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy());
    expect(screen.getByTestId('home-hero-footer-option-ratio')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-footer-option-model')).toBeNull();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-prompt-slot-text')).toBeTruthy());
    expect(screen.getByTestId('home-hero-footer-option-audioType')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy();
    expect(screen.getByTestId('home-hero-footer-option-duration')).toBeTruthy();
    expect(screen.queryByTestId('home-hero-prompt-slot-voice')).toBeNull();
  });

  it('switches media chips without opening the replacement dialog', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('image');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy());
    expect(screen.queryByRole('dialog', { name: /replace current prompt/i })).toBeNull();

    fireEvent.change(screen.getByTestId('home-hero-input'), {
      target: { value: 'Make this prompt personally tuned.' },
    });
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

  it('uses Text for Speech and Prompt for Sound effect audio sources', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-prompt-slot-text')).toBeTruthy());
    expect(screen.queryByTestId('home-hero-prompt-slot-prompt')).toBeNull();

    await chooseOption('audioType', 'sfx', 'Sound effect');

    await waitFor(() => expect(screen.getByTestId('home-hero-prompt-slot-prompt')).toBeTruthy());
    expect(screen.queryByTestId('home-hero-prompt-slot-text')).toBeNull();
    expect((screen.getByTestId('home-hero-input') as HTMLTextAreaElement).value).toContain(
      "Create premium product-studio audio from the user's brief",
    );
  });

  it('keeps text option popovers open while typing multiple characters', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await openOption('text');
    const textInput = screen.getByTestId('home-hero-prompt-option-text-input');

    let value = '';
    for (const character of 'Welcome to Open Design.') {
      value += character;
      fireEvent.change(textInput, { target: { value } });
      expect(screen.getByTestId('home-hero-prompt-option-text')).toBeTruthy();
    }

    expect(screen.getByTestId('home-hero-prompt-option-text')).toBeTruthy();
    expect((screen.getByTestId('home-hero-input') as HTMLTextAreaElement).value).toContain(
      'from Welcome to Open Design.',
    );
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
    await waitFor(() => expect(screen.getByTestId('home-hero-prompt-slot-text')).toBeTruthy());
    expect(screen.queryByRole('textbox', { name: 'Text' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Audio type' })).toBeNull();
    expect((screen.getByTestId('home-hero-input') as HTMLTextAreaElement).value).toContain("from the user's brief");
  });

  it('splits Video and HyperFrames templates into separate submitted metadata', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('video');
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
    fireEvent.click(screen.getByTestId('home-hero-submit'));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        projectMetadata: expect.not.objectContaining({
          promptTemplate: expect.anything(),
        }),
      }));
    });

    onSubmit.mockClear();
    view.rerender(<HomeView {...props} promptTemplates={PROMPT_TEMPLATES} />);
    fireEvent.click(screen.getByTestId('home-hero-submit'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        projectMetadata: expect.objectContaining({
          promptTemplate: expect.objectContaining({ id: 'image-product' }),
        }),
      }));
    });
  });

  it('submits HyperFrames as a video project with the hyperframes-html model', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('hyperframes');
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

  it('shows Audio voice only for the ElevenLabs speech model', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await waitFor(() => expect(screen.getByTestId('home-hero-footer-option-model')).toBeTruthy());
    expect(screen.queryByTestId('home-hero-prompt-slot-voice')).toBeNull();

    await chooseOption('model', 'elevenlabs-v3');

    await waitFor(() => expect(screen.getByTestId('home-hero-prompt-slot-voice')).toBeTruthy());
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-prompt-slot-voice').textContent).toBe('Rachel');
    });
    await openOption('voice');
    await waitFor(() => {
      const voiceOptions = optionTexts(screen.getByTestId('home-hero-prompt-option-voice-select'));
      expect(voiceOptions).toContain('Rachel');
    });
    expect(screen.queryByTestId('home-hero-prompt-option-voice-note')).toBeNull();
  });

  it('falls back to Rachel default when ElevenLabs returns no voices', async () => {
    stubFetch({ elevenLabsVoices: [] });
    renderHome();

    await clickHomeRailChip('audio');
    await chooseOption('model', 'elevenlabs-v3');

    await waitFor(() => expect(screen.getByTestId('home-hero-prompt-slot-voice')).toBeTruthy());
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-prompt-slot-voice').textContent).toBe('Rachel (default)');
    });
    await openOption('voice');

    await waitFor(() => {
      const voiceOptions = optionTexts(screen.getByTestId('home-hero-prompt-option-voice-select'));
      expect(voiceOptions).toContain('Rachel (default)');
    });
    expect(screen.getByTestId('home-hero-prompt-option-voice-note').textContent).toContain(
      'No configured ElevenLabs voices were returned',
    );
  });

  it('falls back to Rachel default when ElevenLabs voice lookup fails', async () => {
    stubFetch({ elevenLabsVoiceError: 'no ElevenLabs API key' });
    renderHome();

    await clickHomeRailChip('audio');
    await chooseOption('model', 'elevenlabs-v3');

    await waitFor(() => expect(screen.getByTestId('home-hero-prompt-slot-voice')).toBeTruthy());
    await waitFor(() => {
      expect(screen.getByTestId('home-hero-prompt-slot-voice').textContent).toBe('Rachel (default)');
    });
    await openOption('voice');

    await waitFor(() => {
      const voiceOptions = optionTexts(screen.getByTestId('home-hero-prompt-option-voice-select'));
      expect(voiceOptions).toContain('Rachel (default)');
    });
    expect(screen.getByTestId('home-hero-prompt-option-voice-note').textContent).toContain(
      'no ElevenLabs API key',
    );
  });

  it('caps Sound effect duration options and normalizes stale speech durations', async () => {
    stubFetch();
    renderHome();

    await clickHomeRailChip('audio');
    await chooseOption('duration', '60', '60s');
    await waitFor(() => {
      expect((screen.getByTestId('home-hero-input') as HTMLTextAreaElement).value).toContain(
        'for 60 seconds',
      );
    });

    await chooseOption('audioType', 'sfx', 'Sound effect');

    await waitFor(() => {
      expect((screen.getByTestId('home-hero-input') as HTMLTextAreaElement).value).toContain(
        'for 30 seconds',
      );
    });
    await openOption('duration');
    const durationOptions = optionTexts(screen.getByTestId('home-hero-footer-option-duration-menu'));
    expect(durationOptions).toEqual(['5s', '10s', '15s', '30s']);
  });

  it('recomputes media metadata from textarea edits at submit time', async () => {
    stubFetch();
    const onSubmit = vi.fn();
    renderHome({ onSubmit });

    await clickHomeRailChip('audio');
    const input = screen.getByTestId('home-hero-input') as HTMLTextAreaElement;
    await waitFor(() => expect(input.value).toContain('for 10 seconds'));
    fireEvent.change(input, {
      target: { value: input.value.replace('for 10 seconds', 'for 30 seconds') },
    });
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
    await openOption('text');
    fireEvent.change(screen.getByTestId('home-hero-prompt-option-text-input'), {
      target: { value: 'Welcome to Open Design.' },
    });

    expect((screen.getByTestId('home-hero-input') as HTMLTextAreaElement).value).toContain(
      'from Welcome to Open Design.',
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
  const promptSlot = screen.queryByTestId(`home-hero-prompt-slot-${name}`);
  if (promptSlot) {
    fireEvent.pointerDown(promptSlot);
    await waitFor(() => expect(screen.getByTestId(`home-hero-prompt-option-${name}`)).toBeTruthy());
    return;
  }
  fireEvent.click(await screen.findByTestId(`home-hero-footer-option-${name}`));
  await waitFor(() => expect(screen.getByTestId(`home-hero-footer-option-${name}-menu`)).toBeTruthy());
}

async function clickHomeRailChip(id: string) {
  fireEvent.click(await screen.findByTestId('home-hero-active-type-chip'));
  fireEvent.click(await screen.findByTestId(`home-hero-rail-${id}`));
}

async function submitHome() {
  await waitFor(() => expect((screen.getByTestId('home-hero-submit') as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByTestId('home-hero-submit'));
}

function optionTexts(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((option) => option.textContent ?? '');
}

async function chooseOption(name: string, value: string, label = value) {
  await openOption(name);
  const promptSelect = screen.queryByTestId(`home-hero-prompt-option-${name}-select`);
  if (promptSelect) {
    fireEvent.change(promptSelect, { target: { value } });
    return;
  }
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

// byok-tools is now a thin wrapper: it resolves the model (LLM arg > composer
// default > catalogue default), then delegates to the unified media dispatcher
// `generateMedia`, which owns provider routing / credentials / file writes. So
// we mock generateMedia and assert the delegation shape + URL/error mapping
// rather than re-testing every provider renderer (those have their own specs).
const { generateMediaMock } = vi.hoisted(() => ({ generateMediaMock: vi.fn() }));
vi.mock('../src/media.js', () => ({ generateMedia: generateMediaMock }));

import {
  BYOK_MEDIA_TOOLS,
  executeGenerateAudio,
  executeGenerateImage,
  executeGenerateVideo,
  SENSEAUDIO_DEFAULT_AUDIO_MODEL,
  SENSEAUDIO_DEFAULT_IMAGE_MODEL,
  SENSEAUDIO_DEFAULT_VIDEO_MODEL,
} from '../src/byok-tools.js';

const CTX = {
  projectRoot: '/root',
  projectsRoot: '/root/projects',
  projectId: 'proj-1',
};

beforeEach(() => {
  generateMediaMock.mockReset();
});

describe('BYOK_MEDIA_TOOLS', () => {
  it('exposes generate_image, generate_video, and generate_audio', () => {
    const names = BYOK_MEDIA_TOOLS.map((t) => t.function.name).sort();
    expect(names).toEqual(['generate_audio', 'generate_image', 'generate_video']);
  });

  it('generate_image requires prompt and offers image aspect ratios', () => {
    const tool = BYOK_MEDIA_TOOLS.find((t) => t.function.name === 'generate_image')!;
    const props = tool.function.parameters.properties as any;
    expect(tool.type).toBe('function');
    expect(tool.function.parameters.required).toEqual(['prompt']);
    expect(props.aspect_ratio.enum).toEqual(['1:1', '16:9', '9:16', '4:3', '3:4']);
  });

  it('image model enum spans the whole registry (not just SenseAudio)', () => {
    const tool = BYOK_MEDIA_TOOLS.find((t) => t.function.name === 'generate_image')!;
    const enumIds = (tool.function.parameters.properties as any).model.enum as string[];
    expect(enumIds).toContain(SENSEAUDIO_DEFAULT_IMAGE_MODEL);
    expect(enumIds).toContain('gpt-image-2'); // an OpenAI image model
  });
});

describe('executeGenerateImage', () => {
  it('delegates to generateMedia and maps the file to a project URL', async () => {
    generateMediaMock.mockResolvedValue({ name: 'image-x.png' });
    const result = await executeGenerateImage(
      { prompt: 'a cat', aspect_ratio: '16:9' },
      { ...CTX, defaultImageModel: SENSEAUDIO_DEFAULT_IMAGE_MODEL },
    );
    expect(result).toEqual({
      ok: true,
      url: '/api/projects/proj-1/files/image-x.png',
      kind: 'image',
    });
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: 'proj-1',
        surface: 'image',
        model: SENSEAUDIO_DEFAULT_IMAGE_MODEL,
        prompt: 'a cat',
        aspect: '16:9',
      }),
    );
  });

  it('honours an explicit registry model arg over the composer default', async () => {
    generateMediaMock.mockResolvedValue({ name: 'o.png' });
    await executeGenerateImage(
      { prompt: 'x', model: 'gpt-image-2' },
      { ...CTX, defaultImageModel: SENSEAUDIO_DEFAULT_IMAGE_MODEL },
    );
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-image-2' }),
    );
  });

  it('falls back to the composer default for an unknown model arg', async () => {
    generateMediaMock.mockResolvedValue({ name: 'd.png' });
    await executeGenerateImage(
      { prompt: 'x', model: 'not-a-real-model' },
      { ...CTX, defaultImageModel: SENSEAUDIO_DEFAULT_IMAGE_MODEL },
    );
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: SENSEAUDIO_DEFAULT_IMAGE_MODEL }),
    );
  });

  it('requires a non-empty prompt', async () => {
    const result = await executeGenerateImage({ prompt: '   ' }, CTX);
    expect(result.ok).toBe(false);
    expect(generateMediaMock).not.toHaveBeenCalled();
  });

  it('maps a generateMedia throw to an error result', async () => {
    generateMediaMock.mockRejectedValue(new Error('no OpenAI credential'));
    const result = await executeGenerateImage({ prompt: 'x', model: 'gpt-image-2' }, CTX);
    expect(result).toEqual({ ok: false, error: 'no OpenAI credential', kind: 'image' });
  });
});

describe('executeGenerateVideo', () => {
  it('delegates with surface=video, aspect, and length', async () => {
    generateMediaMock.mockResolvedValue({ name: 'v.mp4' });
    const result = await executeGenerateVideo(
      { prompt: 'a slow pan', aspect_ratio: '9:16', duration: 8 },
      { ...CTX, defaultVideoModel: SENSEAUDIO_DEFAULT_VIDEO_MODEL },
    );
    expect(result).toEqual({
      ok: true,
      url: '/api/projects/proj-1/files/v.mp4',
      kind: 'video',
    });
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'video',
        model: SENSEAUDIO_DEFAULT_VIDEO_MODEL,
        aspect: '9:16',
        length: 8,
      }),
    );
  });

  it('clamps an out-of-range duration to the max', async () => {
    generateMediaMock.mockResolvedValue({ name: 'v.mp4' });
    await executeGenerateVideo(
      { prompt: 'x', duration: 999 },
      { ...CTX, defaultVideoModel: SENSEAUDIO_DEFAULT_VIDEO_MODEL },
    );
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ length: 30 }),
    );
  });
});

describe('executeGenerateAudio', () => {
  it('delegates with surface=audio and derives audioKind from the model', async () => {
    generateMediaMock.mockResolvedValue({ name: 'a.mp3' });
    const result = await executeGenerateAudio(
      { prompt: 'read this aloud', voice: 'female_0038_a' },
      { ...CTX, defaultAudioModel: SENSEAUDIO_DEFAULT_AUDIO_MODEL },
    );
    expect(result).toEqual({
      ok: true,
      url: '/api/projects/proj-1/files/a.mp3',
      kind: 'audio',
    });
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: 'audio',
        model: SENSEAUDIO_DEFAULT_AUDIO_MODEL,
        audioKind: 'speech',
        voice: 'female_0038_a',
      }),
    );
  });

  it('routes a music model with audioKind=music', async () => {
    generateMediaMock.mockResolvedValue({ name: 'm.mp3' });
    await executeGenerateAudio({ prompt: 'lofi beat', model: 'suno-v5' }, CTX);
    expect(generateMediaMock).toHaveBeenCalledWith(
      expect.objectContaining({ surface: 'audio', model: 'suno-v5', audioKind: 'music' }),
    );
  });
});

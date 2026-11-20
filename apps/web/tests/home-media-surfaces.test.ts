import { describe, expect, it } from 'vitest';

import {
  buildHomeMediaComposer,
  metadataForHomeMediaComposer,
} from '../src/components/home-hero/media-surfaces';

describe('Home image composer metadata', () => {
  it('persists the default Vela model into project metadata', () => {
    const composer = buildHomeMediaComposer('image', []);

    expect(metadataForHomeMediaComposer('image', composer.inputs, [])).toEqual({
      kind: 'image',
      imageModel: 'vela/gpt-image-2',
    });
  });

  it('preserves an explicitly selected OpenAI BYOK model', () => {
    const composer = buildHomeMediaComposer('image', [], { model: 'gpt-image-2' });

    expect(metadataForHomeMediaComposer('image', composer.inputs, [])).toEqual({
      kind: 'image',
      imageModel: 'gpt-image-2',
    });
  });

  it('offers 1K and 2K resolution options aligned with Cloud capabilities', () => {
    const composer = buildHomeMediaComposer('image', []);
    const resField = composer.fields.find((field) => field.name === 'resolution');
    expect(resField?.type).toBe('select');
    expect(resField?.options).toEqual(['1k', '2k']);
    expect(composer.inputs.resolution).toBe('2k');
  });
});

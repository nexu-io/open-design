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

  it('persists the configured provider model when it is the preferred image route', () => {
    const composer = buildHomeMediaComposer('image', [], {}, [], {
      imageModels: [
        {
          id: 'minimax-image-01',
          label: 'image-01',
          hint: 'MiniMax',
          provider: 'minimax',
        },
      ],
    });

    expect(metadataForHomeMediaComposer('image', composer.inputs, [])).toEqual({
      kind: 'image',
      imageModel: 'minimax-image-01',
    });
  });
});

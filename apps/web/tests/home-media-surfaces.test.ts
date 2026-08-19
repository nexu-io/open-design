import { describe, expect, it } from 'vitest';

import {
  buildHomeMediaComposer,
  homeMediaInputsAfterTemplateChange,
  metadataForHomeMediaComposer,
} from '../src/components/home-hero/media-surfaces';

const openAiPortraitTemplate = {
  id: 'stone-staircase',
  surface: 'image' as const,
  title: '3D Stone Staircase Evolution Infographic',
  summary: 'Show the evolution of a stone staircase.',
  category: 'infographic',
  model: 'gpt-image-2',
  aspect: '3:4' as const,
  source: {
    repo: 'open-design/prompt-templates',
    license: 'MIT',
  },
};

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

  it('seeds project metadata from the first prompt template model and aspect', () => {
    const composer = buildHomeMediaComposer('image', [openAiPortraitTemplate]);

    expect(composer.inputs).toMatchObject({
      template: 'stone-staircase',
      model: 'gpt-image-2',
      aspect: '3:4',
      ratio: '3:4',
    });
    expect(
      metadataForHomeMediaComposer('image', composer.inputs, [openAiPortraitTemplate]),
    ).toMatchObject({
      kind: 'image',
      imageModel: 'gpt-image-2',
      imageAspect: '3:4',
    });
  });

  it('applies the first template model and aspect when templates load later', () => {
    const beforeTemplatesLoad = buildHomeMediaComposer('image', []).inputs;
    const hydrated = buildHomeMediaComposer(
      'image',
      [openAiPortraitTemplate],
      beforeTemplatesLoad,
    );

    expect(hydrated.inputs).toMatchObject({
      template: 'stone-staircase',
      model: 'gpt-image-2',
      aspect: '3:4',
      ratio: '3:4',
    });
  });

  it('applies a newly selected prompt template without pinning later model edits', () => {
    const initial = buildHomeMediaComposer('image', []).inputs;
    const selected = homeMediaInputsAfterTemplateChange(
      'image',
      initial,
      { ...initial, template: 'stone-staircase' },
      [openAiPortraitTemplate],
    );

    expect(selected).toMatchObject({
      template: 'stone-staircase',
      model: 'gpt-image-2',
      aspect: '3:4',
      ratio: '3:4',
    });
    const customized = homeMediaInputsAfterTemplateChange(
      'image',
      selected,
      { ...selected, model: 'vela/gpt-image-2', aspect: '1:1', ratio: '1:1' },
      [openAiPortraitTemplate],
    );

    expect(customized).toMatchObject({
      model: 'vela/gpt-image-2',
      aspect: '1:1',
      ratio: '1:1',
    });
    expect(
      metadataForHomeMediaComposer('image', customized, [openAiPortraitTemplate]),
    ).toMatchObject({ imageModel: 'vela/gpt-image-2', imageAspect: '1:1' });
  });

  it('ignores unsupported model and aspect declarations from prompt templates', () => {
    const unsupportedTemplate = {
      ...openAiPortraitTemplate,
      id: 'unsupported-template',
      model: 'unknown-provider/model',
      aspect: '2:3',
    };
    const composer = buildHomeMediaComposer(
      'image',
      // The runtime boundary is intentionally exercised with invalid catalog data.
      [unsupportedTemplate as typeof openAiPortraitTemplate],
    );

    expect(composer.inputs).toMatchObject({
      template: 'unsupported-template',
      model: 'vela/gpt-image-2',
      aspect: '16:9',
      ratio: '16:9',
    });
  });

  it('accepts live AIHubMix model ids declared by prompt templates', () => {
    const aihubmixTemplate = {
      ...openAiPortraitTemplate,
      model: 'aihubmix-nano-banana-pro',
    };

    expect(buildHomeMediaComposer('image', [aihubmixTemplate]).inputs).toMatchObject({
      model: 'aihubmix-nano-banana-pro',
      aspect: '3:4',
    });
  });
});

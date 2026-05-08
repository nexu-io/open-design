import { describe, expect, it } from 'vitest';

import { supportedModels } from '../../src/components/NewProjectPanel';
import { IMAGE_MODELS } from '../../src/media/models';

describe('NewProjectPanel image provider visibility', () => {
  it('shows Nano Banana in supported image models', () => {
    const models = supportedModels('image', IMAGE_MODELS);
    expect(models.some((model) => model.provider === 'nanobanana')).toBe(true);
    expect(models.some((model) => model.id === 'gemini-3.1-flash-image-preview')).toBe(true);
  });
});

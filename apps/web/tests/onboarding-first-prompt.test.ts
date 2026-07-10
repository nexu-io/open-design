import { describe, expect, it } from 'vitest';

import { sentPrefilledPrompt } from '../src/onboarding/first-prompt';

describe('sentPrefilledPrompt', () => {
  const seed = 'Design a mobile onboarding flow';

  it('is true when the prefilled suggestion is sent unmodified', () => {
    expect(sentPrefilledPrompt(seed, seed)).toBe(true);
  });

  it('ignores surrounding whitespace on both sides', () => {
    expect(sentPrefilledPrompt(`  ${seed}  `, `${seed}\n`)).toBe(true);
  });

  it('is false when the user edits the suggestion before sending', () => {
    expect(sentPrefilledPrompt(seed, `${seed} for iOS`)).toBe(false);
    expect(sentPrefilledPrompt(seed, 'Something completely different')).toBe(false);
  });

  it('is false when the user clears the seed and sends attachments only', () => {
    expect(sentPrefilledPrompt(seed, '')).toBe(false);
    expect(sentPrefilledPrompt(seed, '   ')).toBe(false);
  });

  it('is false when there was no seed to begin with', () => {
    expect(sentPrefilledPrompt('', seed)).toBe(false);
    expect(sentPrefilledPrompt('   ', seed)).toBe(false);
  });
});

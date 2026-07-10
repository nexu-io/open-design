import { describe, expect, it } from 'vitest';

import {
  mergeGeneratedSegments,
  validateGeneratedSegments,
  type ProductionSegment,
} from '../../src/production-generation';

const segments: ProductionSegment[] = [
  {
    id: 'hook',
    label: 'Hook',
    paragraph: 'Hook paragraph',
    narration: '專業講解者 (professional) 旁白：Hook paragraph',
    shot: '鏡頭：Hook paragraph',
    assets: '素材：Hook paragraph',
    output: '成片：Hook paragraph',
    voiceProfileId: 'guide-host',
  },
  {
    id: 'body',
    label: 'Body',
    paragraph: 'Body paragraph',
    narration: '專業講解者 (professional) 旁白：Body paragraph',
    shot: '鏡頭：Body paragraph',
    assets: '素材：Body paragraph',
    output: '成片：Body paragraph',
    voiceProfileId: 'guide-host',
  },
];

describe('production generation merge helpers', () => {
  it('rejects unknown voiceProfileId values before merge', () => {
    expect(() =>
      validateGeneratedSegments(
        {
          segments: [{ id: 'hook', label: 'Hook', voiceProfileId: 'unknown-id' }],
        },
        ['guide-host', 'young-voice'],
      ),
    ).toThrow(/Unknown voiceProfileId/i);
  });

  it('rejects duplicate generated segment ids before merge', () => {
    expect(() =>
      validateGeneratedSegments(
        {
          segments: [
            { id: 'hook', label: 'Hook' },
            { id: 'hook', label: 'Hook again' },
          ],
        },
        ['guide-host', 'young-voice'],
      ),
    ).toThrow(/Duplicate generated segment id/i);
  });

  it('applies draft merges without overwriting untouched fields', () => {
    const result = mergeGeneratedSegments(
      segments,
      [
        {
          id: 'hook',
          label: 'Hook',
          paragraph: 'Open with the question the viewer cares about.',
          assets: '素材：Use a bold title card and one sample image.',
        },
      ],
      'draft',
      'professional',
      'guide-host',
      (id) => (id === 'guide-host' ? '專業講解者' : id),
    );

    expect(result[0]?.paragraph).toBe('Open with the question the viewer cares about.');
    expect(result[0]?.assets).toBe('素材：Use a bold title card and one sample image.');
    expect(result[0]?.narration).toBe('專業講解者 (professional) 旁白：Hook paragraph');
    expect(result[1]?.paragraph).toBe('Body paragraph');
  });

  it('updates voice narration and keeps the selected voice profile stable', () => {
    const result = mergeGeneratedSegments(
      segments,
      [
        {
          id: 'hook',
          label: 'Hook',
          narration: '年輕聲線 (professional) 旁白：Hook rewrite from OpenRouter.',
          voiceProfileId: 'young-voice',
        },
      ],
      'voice',
      'professional',
      'guide-host',
      (id) => (id === 'young-voice' ? '年輕聲線' : '專業講解者'),
    );

    expect(result[0]?.voiceProfileId).toBe('young-voice');
    expect(result[0]?.narration).toBe('年輕聲線 (professional) 旁白：Hook rewrite from OpenRouter.');
    expect(result[0]?.paragraph).toBe('Hook paragraph');
  });
});


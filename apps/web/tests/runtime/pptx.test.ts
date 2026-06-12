import { describe, expect, it } from 'vitest';

import { buildImageSlidesPptx } from '../../src/runtime/pptx';

const ONE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l6NqWwAAAABJRU5ErkJggg==';

describe('buildImageSlidesPptx', () => {
  it('packages slide snapshots as a PowerPoint deck', async () => {
    const blob = buildImageSlidesPptx([
      { dataUrl: ONE_PIXEL_PNG, width: 1600, height: 900 },
      { dataUrl: ONE_PIXEL_PNG, width: 1600, height: 900 },
    ], 'Quarterly <Plan>');

    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.presentationml.presentation');

    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);

    const packageText = new TextDecoder().decode(bytes);
    expect(packageText).toContain('ppt/presentation.xml');
    expect(packageText).toContain('ppt/slides/slide1.xml');
    expect(packageText).toContain('ppt/slides/slide2.xml');
    expect(packageText).toContain('ppt/media/image1.png');
    expect(packageText).toContain('ppt/media/image2.png');
    expect(packageText).toContain('Quarterly &lt;Plan&gt;');
  });

  it('rejects non-PNG slide data URLs', () => {
    expect(() => buildImageSlidesPptx([
      { dataUrl: 'data:image/jpeg;base64,AAAA', width: 1600, height: 900 },
    ], 'Deck')).toThrow('only supports PNG');
  });
});

import {
  addTitleSlide,
  createPresentation,
  findSlidePlaceholder,
  savePresentation,
  setShapeText,
} from '@office-kit/pptx';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  applyGroundedMutations,
  assertGroundedPptxSlideCount,
  inspectGroundedPresentation,
  renderGroundedSlide,
  validateGroundedPptxPackage,
  assertGroundedPptxMutationOutput,
} from '../../src/pptx-grounded/office-kit-adapter.js';
import { createGroundedPptxWorkLimiter } from '../../src/pptx-grounded/capacity.js';

describe('Office-Kit grounded PPTX adapter', () => {

  it('inspects a native PPTX without converting it to HTML', async () => {
    const presentation = createPresentation();
    const slide = addTitleSlide(presentation, 'Grounded architecture');
    const subtitle = findSlidePlaceholder(slide, 'subTitle');
    expect(subtitle).toBeDefined();
    setShapeText(subtitle!, 'Source deck remains authoritative');

    const bytes = await savePresentation(presentation);
    const structure = await inspectGroundedPresentation(bytes);

    expect(structure.slideCount).toBe(1);
    expect(structure.slideSize.width).toBeGreaterThan(0);
    expect(structure.slideSize.height).toBeGreaterThan(0);
    expect(structure.theme.colorScheme.accent1).toMatch(/^#[0-9A-F]{6}$/i);
    expect(structure.slides).toEqual([
      expect.objectContaining({
        index: 0,
        title: 'Grounded architecture',
        text: expect.stringContaining('Source deck remains authoritative'),
        layout: expect.objectContaining({ type: 'title' }),
      }),
    ]);
  });

  it('renders only the requested native slide to PNG without a browser', async () => {
    const presentation = createPresentation();
    addTitleSlide(presentation, 'Preview me');
    addTitleSlide(presentation, 'Preview me too');

    const bytes = await savePresentation(presentation);
    const preview = await renderGroundedSlide(bytes, 1, { width: 640 });

    expect(preview.index).toBe(1);
    expect(preview.width).toBe(640);
    expect(preview.png.subarray(0, 8)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
    await expect(renderGroundedSlide(bytes, 2)).rejects.toThrow('slide index is out of bounds');
    await expect(renderGroundedSlide(bytes, 0, { width: 4096 })).rejects.toThrow('render width');
  });

  it('rejects extreme slide geometry before rasterization', async () => {
    const presentation = createPresentation();
    addTitleSlide(presentation, 'Extreme');
    const zip = await JSZip.loadAsync(await savePresentation(presentation));
    const document = await zip.file('ppt/presentation.xml')!.async('string');
    zip.file('ppt/presentation.xml', document.replace(/<p:sldSz[^>]*\/>/, '<p:sldSz cx="9144000" cy="91440000"/>'));
    const bytes = await zip.generateAsync({ type: 'uint8array' });
    await expect(renderGroundedSlide(bytes, 0, { width: 1280 })).rejects.toThrow(/aspect ratio|pixel/);
  });

  it('caps serialized mutation output before validation or publication', () => {
    expect(() => assertGroundedPptxMutationOutput(new Uint8Array(9), 8)).toThrow('output size exceeds limit');
  });

  it('bounds process-wide heavy work and rejects overload without retaining more work', async () => {
    const limiter = createGroundedPptxWorkLimiter({ maxConcurrency: 1, maxQueue: 1 });
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstGate = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const secondGate = new Promise<void>((resolve) => { resolveSecond = resolve; });
    const first = limiter.run(async () => firstGate);
    const second = limiter.run(async () => secondGate);
    await expect(limiter.run(async () => undefined)).rejects.toMatchObject({ status: 429 });
    resolveFirst();
    await first;
    resolveSecond();
    await second;
  });

  it('rejects PPTX packages that exceed entry and expanded-size limits', async () => {
    const tooManyEntries = new JSZip();
    tooManyEntries.file('[Content_Types].xml', '<Types/>');
    tooManyEntries.file('a', 'a');
    tooManyEntries.file('b', 'b');
    await expect(
      validateGroundedPptxPackage(await tooManyEntries.generateAsync({ type: 'uint8array' }), {
        maxEntries: 2,
      }),
    ).rejects.toThrow('too many entries');

    const expanded = new JSZip();
    expanded.file('[Content_Types].xml', '<Types/>');
    expanded.file('large.bin', new Uint8Array(32));
    await expect(
      validateGroundedPptxPackage(await expanded.generateAsync({ type: 'uint8array' }), {
        maxUncompressedBytes: 16,
      }),
    ).rejects.toThrow('expanded size');
    await expect(validateGroundedPptxPackage(new Uint8Array(17), { maxCompressedBytes: 16 }))
      .rejects.toThrow('compressed size');
    expect(() => assertGroundedPptxSlideCount(501)).toThrow('slide count');
    expect(() => assertGroundedPptxSlideCount(0)).toThrow('at least one slide');
  });

  it('aborts actual high-ratio expansion before Office-Kit parsing', async () => {
    const highRatio = new JSZip();
    highRatio.file('[Content_Types].xml', '<Types/>');
    highRatio.file('large.bin', new Uint8Array(1024 * 1024));
    const bytes = await highRatio.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    expect(bytes.byteLength).toBeLessThan(16 * 1024);

    await expect(validateGroundedPptxPackage(bytes, { maxUncompressedBytes: 16 * 1024 }))
      .rejects.toThrow('expanded size');
  });

  it('duplicates a source slide and rebinds placeholders without changing the source', async () => {
    const presentation = createPresentation();
    const source = addTitleSlide(presentation, 'Original title');
    const subtitle = findSlidePlaceholder(source, 'subTitle');
    setShapeText(subtitle!, 'Original subtitle');

    const input = await savePresentation(presentation);
    const result = await applyGroundedMutations(input, [
      {
        op: 'duplicateSlide',
        sourceIndex: 0,
        insertAt: 1,
        replacements: [
          { placeholder: 'ctrTitle', text: 'Generated title' },
          { placeholder: 'subTitle', text: 'Generated subtitle' },
        ],
      },
    ]);

    expect(result.validationIssues.filter((issue) => issue.severity === 'error')).toEqual([]);
    const structure = await inspectGroundedPresentation(result.bytes);
    expect(structure.slideCount).toBe(2);
    expect(structure.slides[0]).toEqual(
      expect.objectContaining({ title: 'Original title', text: expect.stringContaining('Original subtitle') }),
    );
    expect(structure.slides[1]).toEqual(
      expect.objectContaining({ title: 'Generated title', text: expect.stringContaining('Generated subtitle') }),
    );
  });

  it('rejects slide-specific dependent relationships before duplicating the source', async () => {
    const presentation = createPresentation();
    addTitleSlide(presentation, 'Source with notes');
    const zip = await JSZip.loadAsync(await savePresentation(presentation));
    const relsPath = 'ppt/slides/_rels/slide1.xml.rels';
    const rels = await zip.file(relsPath)!.async('string');
    zip.file(relsPath, rels.replace(
      '</Relationships>',
      '<Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>',
    ));
    zip.file('ppt/notesSlides/notesSlide1.xml', '<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>');
    const input = await zip.generateAsync({ type: 'uint8array' });

    await expect(applyGroundedMutations(input, [
      { op: 'duplicateSlide', sourceIndex: 0, insertAt: 1, replacements: [] },
    ])).rejects.toThrow(/unsupported slide relationship.*notesSlide/i);
  });

  it('fails closed when a placeholder locator does not resolve exactly once', async () => {
    const presentation = createPresentation();
    addTitleSlide(presentation, 'Source');
    const input = await savePresentation(presentation);

    await expect(
      applyGroundedMutations(input, [
        {
          op: 'duplicateSlide',
          sourceIndex: 0,
          insertAt: 1,
          replacements: [{ placeholder: 'body', text: 'Must not target another shape' }],
        },
      ]),
    ).rejects.toThrow('placeholder "body" resolved to 0 shapes');
  });

  it('preserves unsupported package parts byte-for-byte across mutation', async () => {
    const presentation = createPresentation();
    addTitleSlide(presentation, 'Source');
    const zip = await JSZip.loadAsync(await savePresentation(presentation));
    const customXml = '<custom:grounding xmlns:custom="urn:open-design">keep-me</custom:grounding>';
    zip.file('customXml/item1.xml', customXml);

    const contentTypes = await zip.file('[Content_Types].xml')!.async('string');
    zip.file(
      '[Content_Types].xml',
      contentTypes.replace(
        '</Types>',
        '<Override PartName="/customXml/item1.xml" ContentType="application/xml"/></Types>',
      ),
    );
    const rootRels = await zip.file('_rels/.rels')!.async('string');
    zip.file(
      '_rels/.rels',
      rootRels.replace(
        '</Relationships>',
        '<Relationship Id="rIdGrounding" Type="urn:open-design:grounding" Target="customXml/item1.xml"/></Relationships>',
      ),
    );
    const input = await zip.generateAsync({ type: 'uint8array' });

    const result = await applyGroundedMutations(input, [
      { op: 'duplicateSlide', sourceIndex: 0, insertAt: 1, replacements: [] },
    ]);
    const outputZip = await JSZip.loadAsync(result.bytes);

    expect(await outputZip.file('customXml/item1.xml')?.async('string')).toBe(customXml);
    expect(await outputZip.file('_rels/.rels')?.async('string')).toContain('rIdGrounding');
    expect(await outputZip.file('[Content_Types].xml')?.async('string')).toContain(
      '/customXml/item1.xml',
    );
  });
});

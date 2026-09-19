import { describe, expect, it } from 'vitest';
import { ManualEditSourceAnnotator, annotateManualEditSourceOrdinals } from '../src/manual-edit-source.js';

function annotateInChunks(source: string, chunkSizes: readonly number[]): string {
  const annotator = new ManualEditSourceAnnotator();
  let offset = 0;
  let output = '';
  for (const size of chunkSizes) {
    output += annotator.push(source.slice(offset, offset + size));
    offset += size;
  }
  output += annotator.push(source.slice(offset));
  output += annotator.finish();
  return output;
}

describe('manual edit source annotation', () => {
  it('assigns deterministic authored-tag ordinals only to editable elements', () => {
    const source = '<!doctype html><html><head><title>Title</title></head><body><main><h1>Hero</h1><img src="x"></main></body></html>';

    expect(annotateManualEditSourceOrdinals(source)).toBe(
      '<!doctype html><html><head><title>Title</title></head><body><main data-od-source-path="source-0" data-od-generated-source-path><h1 data-od-source-path="source-1" data-od-generated-source-path>Hero</h1><img src="x" data-od-source-path="source-2" data-od-generated-source-path></main></body></html>',
    );
  });

  it('produces the same output at every possible input split', () => {
    const source = [
      '<!doctype html><body>',
      '<!-- <p>comment</p> -->',
      '<main class="a > b"><h1>héllo</h1>',
      '<script>const fake = "<p>script</p>";</script>',
      '<template><p>template</p><template><span>nested</span></template></template>',
      '<p data-od-source-path="authored">kept</p><img src="x" />',
      '</main></body>',
    ].join('');
    const expected = annotateManualEditSourceOrdinals(source);

    for (let split = 0; split <= source.length; split += 1) {
      expect(annotateInChunks(source, [split]), `split at ${split}`).toBe(expected);
    }
  });

  it('ignores markup-looking text in comments, templates, and raw-text elements', () => {
    const source = [
      '<!-- <h1>comment</h1> -->',
      '<script>const x = `<p>script</p>`;</script>',
      '<style>.x::before { content: "<span>style</span>" }</style>',
      '<textarea><strong>textarea</strong></textarea>',
      '<template><section>template</section></template>',
      '<p>real</p>',
    ].join('');

    const annotated = annotateInChunks(source, new Array(source.length).fill(1));

    expect(annotated).toContain('<p data-od-source-path="source-0" data-od-generated-source-path>real</p>');
    expect(annotated.match(/data-od-source-path/g)).toHaveLength(1);
  });

  it('does not mistake a raw-text close-prefix for the closing tag', () => {
    const source = '<script>"</scripture><p>still script</p>";</script><p>real</p>';
    const split = source.indexOf('</scripture>') + '</script'.length;

    const annotated = annotateInChunks(source, [split]);

    expect(annotated).toContain('<p>still script</p>');
    expect(annotated).toContain('<p data-od-source-path="source-0" data-od-generated-source-path>real</p>');
    expect(annotated.match(/data-od-source-path/g)).toHaveLength(1);
  });

  it('preserves authored identities while keeping subsequent ordinals stable', () => {
    const source = '<main data-od-source-path="custom"><p>one</p><p DATA-OD-SOURCE-PATH=legacy>two</p><p>three</p></main>';

    expect(annotateManualEditSourceOrdinals(source)).toBe(
      '<main data-od-source-path="custom"><p data-od-source-path="source-1" data-od-generated-source-path>one</p><p DATA-OD-SOURCE-PATH=legacy>two</p><p data-od-source-path="source-3" data-od-generated-source-path>three</p></main>',
    );
  });

  it('streams through an attacker-sized malformed tag without retaining the document', () => {
    const hugeAttribute = 'x'.repeat(96 * 1024);
    const source = `<div data-value="${hugeAttribute}">large</div><p>after</p>`;

    const annotated = annotateInChunks(source, new Array(Math.ceil(source.length / 1024)).fill(1024));

    expect(annotated).toContain(`<div data-value="${hugeAttribute}">large</div>`);
    expect(annotated).toContain('<p data-od-source-path="source-1" data-od-generated-source-path>after</p>');
    expect(annotated).not.toContain('data-od-source-path="source-0"');
  });
});

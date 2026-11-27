import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { describe, it } from 'vitest';

import { buildDocumentPreview } from '../src/document-preview.js';

const PRESENTATION_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const SLIDE_TYPE = `${RELATIONSHIP_NS}/slide`;

function slide(text: string): string {
  return `<p:sld xmlns:p="${PRESENTATION_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><a:t>${text}</a:t></p:cSld></p:sld>`;
}

function presentation(ids: string[]): string {
  return `<p:presentation xmlns:p="${PRESENTATION_NS}" xmlns:r="${RELATIONSHIP_NS}"><p:sldIdLst>${ids.map((id, index) => `<p:sldId id="${256 + index}" r:id="${id}"/>`).join('')}</p:sldIdLst></p:presentation>`;
}

function relationships(entries: Array<{ id: string; target: string; type?: string; mode?: string }>): string {
  return `<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}">${entries.map(({ id, target, type = SLIDE_TYPE, mode }) =>
    `<Relationship Id="${id}" Target="${target}" Type="${type}"${mode ? ` TargetMode="${mode}"` : ''}/>`).join('')}</Relationships>`;
}

async function preview(zip: JSZip) {
  return buildDocumentPreview({ name: 'reordered.pptx', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
}

function deck(ids: string[], entries: Parameters<typeof relationships>[0]): JSZip {
  const zip = new JSZip();
  zip.file('ppt/presentation.xml', presentation(ids));
  zip.file('ppt/_rels/presentation.xml.rels', relationships(entries));
  return zip;
}

describe('PPTX preview slide sequence', () => {
  it('preserves the ordinary one-slide preview shape', async () => {
    const zip = deck(['first'], [{ id: 'first', target: 'slides/slide1.xml' }]);
    zip.file('ppt/slides/slide1.xml', slide('Hello 世界'));
    assert.deepEqual(await preview(zip), {
      kind: 'presentation', title: 'reordered.pptx',
      sections: [{ title: 'Slide 1', lines: ['Hello 世界'] }],
    });
  });

  it('uses presentation order instead of slide filenames, relationship order, or numeric IDs', async () => {
    const zip = deck(['rId9', 'rId2', 'rId7'], [
      { id: 'rId2', target: 'slides/slide1.xml' },
      { id: 'rId7', target: 'slides/slide2.xml' },
      { id: 'rId9', target: 'slides/slide3.xml' },
    ]);
    zip.file('ppt/slides/slide2.xml', slide('Second file'));
    zip.file('ppt/slides/slide3.xml', slide('Third file'));
    zip.file('ppt/slides/slide1.xml', slide('First file'));
    assert.deepEqual((await preview(zip)).sections, [
      { title: 'Slide 1', lines: ['Third file'] },
      { title: 'Slide 2', lines: ['First file'] },
      { title: 'Slide 3', lines: ['Second file'] },
    ]);
  });

  it('uses referenced slide parts with nonnumeric names and excludes orphaned slides', async () => {
    const zip = deck(['closing', 'opening'], [
      { id: 'opening', target: 'slides/opening.xml' },
      { id: 'closing', target: 'slides/closing.xml' },
      { id: 'unused', target: 'slides/slide9.xml' },
    ]);
    zip.file('ppt/slides/opening.xml', slide('Opening'));
    zip.file('ppt/slides/closing.xml', slide('Closing'));
    zip.file('ppt/slides/slide9.xml', slide('Deleted from the presentation'));
    assert.deepEqual((await preview(zip)).sections.map((section) => section.lines), [['Closing'], ['Opening']]);
  });

  it('resolves package-root and relative targets from the presentation part', async () => {
    const zip = deck(['root', 'relative', 'parent'], [
      { id: 'root', target: '/ppt/slides/slide3.xml' },
      { id: 'relative', target: './slides/../slides/slide2.xml' },
      { id: 'parent', target: '../custom-slides/first.xml' },
    ]);
    zip.file('ppt/slides/slide3.xml', slide('Root target'));
    zip.file('ppt/slides/slide2.xml', slide('Relative target'));
    zip.file('custom-slides/first.xml', slide('Parent target'));
    assert.deepEqual((await preview(zip)).sections.map((section) => section.lines), [
      ['Root target'], ['Relative target'], ['Parent target'],
    ]);
  });

  it('reads XML namespace aliases and single quotes without treating comments as slide entries', async () => {
    const zip = deck([], []);
    zip.file('ppt/presentation.xml', `<q:presentation xmlns:q='${PRESENTATION_NS}' xmlns:rel='${RELATIONSHIP_NS}'>
      <q:sldIdLst><!-- <q:sldId id='256' rel:id='unused'/> -->
        <q:sldId id='258' rel:id='second'/><q:sldId id='257' rel:id='first'/>
      </q:sldIdLst></q:presentation>`);
    zip.file('ppt/_rels/presentation.xml.rels', `<pkg:Relationships xmlns:pkg='${PACKAGE_RELATIONSHIP_NS}'>
      <pkg:Relationship Id='first' Type='${SLIDE_TYPE}' Target='slides/slide1.xml'/>
      <pkg:Relationship Id='second' Type='${SLIDE_TYPE}' Target='slides/slide2.xml'/>
    </pkg:Relationships>`);
    zip.file('ppt/slides/slide1.xml', slide('First'));
    zip.file('ppt/slides/slide2.xml', slide('Second'));
    assert.deepEqual((await preview(zip)).sections.map((section) => section.lines), [['Second'], ['First']]);
  });

  it('resolves percent-encoded and non-ASCII ZIP part names without losing URI characters', async () => {
    const zip = deck(['encoded', 'literal', 'unicode'], [
      { id: 'encoded', target: 'slides/%E7%BB%88%E7%AB%A0%20%23%20%F0%9F%8C%9F.xml' },
      { id: 'literal', target: 'slides/Opening%20Slide.xml' },
      { id: 'unicode', target: 'slides/序章.xml' },
    ]);
    zip.file('ppt/slides/终章 # 🌟.xml', slide('Encoded Unicode'));
    zip.file('ppt/slides/Opening%20Slide.xml', slide('Escaped ZIP entry'));
    zip.file('ppt/slides/序章.xml', slide('Unicode URI'));
    assert.deepEqual((await preview(zip)).sections.map((section) => section.lines), [
      ['Encoded Unicode'], ['Escaped ZIP entry'], ['Unicode URI'],
    ]);
  });

  it('keeps an explicitly empty presentation empty even when unused slide files remain', async () => {
    const zip = deck([], [{ id: 'unused', target: 'slides/slide1.xml' }]);
    zip.file('ppt/slides/slide1.xml', slide('Unused'));
    assert.deepEqual((await preview(zip)).sections, [
      { title: 'Presentation', lines: ['No readable slides found.'] },
    ]);
  });

  it('does not invent a filename order when the main presentation part is missing', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', slide('Unordered'));
    await assert.rejects(preview(zip), /presentation/);
  });

  for (const broken of ['missing relationship', 'missing part', 'external target', 'wrong relationship type'] as const) {
    it(`rejects ${broken} instead of returning an apparently successful partial preview`, async () => {
      const zip = deck(['valid', 'broken'], [
        { id: 'valid', target: 'slides/slide1.xml' },
        ...(broken === 'missing relationship' ? [] : [{
          id: 'broken',
          target: broken === 'external target' ? 'https://example.invalid/slide.xml' : 'slides/slide2.xml',
          ...(broken === 'external target' ? { mode: 'External' } : {}),
          ...(broken === 'wrong relationship type' ? { type: `${RELATIONSHIP_NS}/notesSlide` } : {}),
        }]),
      ]);
      zip.file('ppt/slides/slide1.xml', slide('First'));
      if (broken !== 'missing part') zip.file('ppt/slides/slide2.xml', slide('Second'));
      await assert.rejects(preview(zip), /slide|relationship/);
    });
  }

  it('preserves the existing XML entity rejection for newly read presentation metadata', async () => {
    const zip = deck(['first'], [{ id: 'first', target: 'slides/slide1.xml' }]);
    zip.file('ppt/presentation.xml', `<!DOCTYPE p:presentation [<!ENTITY label "hidden">]>${presentation(['first'])}`);
    zip.file('ppt/slides/slide1.xml', slide('First'));
    await assert.rejects(preview(zip), { statusCode: 415 });
  });
});

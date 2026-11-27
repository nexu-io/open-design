import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { describe, it } from 'vitest';

import { buildDocumentPreview } from '../src/document-preview.js';

const RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PACKAGE_RELATIONSHIP_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const SHEET_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

function textXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function wordRun(text: string): string {
  return `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${textXml(text)}</w:t></w:r>`;
}

function packageRoot(zip: JSZip, target: string, contentType: string): void {
  zip.file('_rels/.rels', `<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}"><Relationship Id="rId1" Type="${RELATIONSHIP_NS}/officeDocument" Target="${target}"/></Relationships>`);
  zip.file('[Content_Types].xml', `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/${target}" ContentType="${contentType}"/></Types>`);
}

async function previewDocx(paragraphs: string[]) {
  const zip = new JSZip();
  packageRoot(zip, 'word/document.xml', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml');
  zip.file('word/document.xml', `<w:document xmlns:w="${WORD_NS}"><w:body>${paragraphs.map((p) => `<w:p>${p}</w:p>`).join('')}<w:sectPr/></w:body></w:document>`);
  return buildDocumentPreview({ name: 'formatted.docx', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
}

async function previewXlsx(runs: string[], shared: boolean) {
  const zip = new JSZip();
  packageRoot(zip, 'xl/workbook.xml', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml');
  zip.file('xl/workbook.xml', `<workbook xmlns="${SHEET_NS}" xmlns:r="${RELATIONSHIP_NS}"><sheets><sheet name="Places" sheetId="1" r:id="sheet"/></sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}"><Relationship Id="sheet" Type="${RELATIONSHIP_NS}/worksheet" Target="worksheets/sheet1.xml"/>${shared ? `<Relationship Id="strings" Type="${RELATIONSHIP_NS}/sharedStrings" Target="sharedStrings.xml"/>` : ''}</Relationships>`);
  const richText = runs.map((text) => `<r><rPr><b/></rPr><t xml:space="preserve">${textXml(text)}</t></r>`).join('');
  if (shared) zip.file('xl/sharedStrings.xml', `<sst xmlns="${SHEET_NS}" count="1" uniqueCount="1"><si>${richText}</si></sst>`);
  zip.file('xl/worksheets/sheet1.xml', `<worksheet xmlns="${SHEET_NS}"><sheetData><row r="1"><c r="A1" t="${shared ? 's' : 'inlineStr'}">${shared ? '<v>0</v>' : `<is>${richText}</is>`}</c><c r="B1"><v>42</v></c></row></sheetData></worksheet>`);
  return buildDocumentPreview({ name: 'formatted.xlsx', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
}

describe('Office preview rich-text boundaries', () => {
  it('does not insert spaces inside a DOCX word split across formatting runs', async () => {
    const result = await previewDocx([wordRun('Open') + wordRun('Design')]);
    assert.deepEqual(result.sections, [{ title: 'Document', lines: ['OpenDesign'] }]);
  });

  it('preserves DOCX punctuation and the spaces authored around it', async () => {
    const result = await previewDocx([wordRun('Hello') + wordRun(',') + wordRun(' world') + wordRun('!')]);
    assert.deepEqual(result.sections[0]?.lines, ['Hello, world!']);
  });

  it('does not invent spaces between styled CJK characters', async () => {
    const result = await previewDocx([wordRun('团队') + wordRun('设计')]);
    assert.deepEqual(result.sections[0]?.lines, ['团队设计']);
  });

  it('keeps paragraph boundaries and the existing paragraph whitespace normalization', async () => {
    const result = await previewDocx([
      wordRun('  First ') + wordRun('  paragraph  '),
      wordRun(''),
      wordRun('Second paragraph'),
    ]);
    assert.deepEqual(result.sections[0]?.lines, ['First paragraph', 'Second paragraph']);
  });

  for (const separator of ['tab', 'br', 'cr']) {
    it(`retains an explicit DOCX ${separator} as a word separator`, async () => {
      const result = await previewDocx([`${wordRun('First')}<w:r><w:${separator}/></w:r>${wordRun('second')}`]);
      assert.deepEqual(result.sections[0]?.lines, ['First second']);
    });
  }

  for (const shared of [false, true]) {
    for (const [label, runs, expected] of [
      ['trailing space', ['New ', 'York'], 'New York'],
      ['leading space', ['North', ' America'], 'North America'],
      ['space-only run', ['South', ' ', 'Korea'], 'South Korea'],
      ['multiple spaces', ['Hello  ', 'world'], 'Hello  world'],
      ['entities and CJK', ['团', '队 & ', 'friends'], '团队 & friends'],
    ] as const) {
      it(`preserves ${label} in XLSX ${shared ? 'shared' : 'inline'} rich strings`, async () => {
        const result = await previewXlsx([...runs], shared);
        assert.deepEqual(result.sections, [{ title: 'Places', lines: [`${expected} | 42`] }]);
      });
    }
  }

  it('keeps the existing PPTX per-run lines trimmed and omits blank text', async () => {
    const zip = new JSZip();
    const presentationNs = 'http://schemas.openxmlformats.org/presentationml/2006/main';
    packageRoot(zip, 'ppt/presentation.xml', 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml');
    zip.file('ppt/presentation.xml', `<p:presentation xmlns:p="${presentationNs}" xmlns:r="${RELATIONSHIP_NS}"><p:sldIdLst><p:sldId id="256" r:id="slide"/></p:sldIdLst></p:presentation>`);
    zip.file('ppt/_rels/presentation.xml.rels', `<Relationships xmlns="${PACKAGE_RELATIONSHIP_NS}"><Relationship Id="slide" Type="${RELATIONSHIP_NS}/slide" Target="slides/slide1.xml"/></Relationships>`);
    zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="${presentationNs}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>  Title  </a:t></a:r><a:r><a:t>   </a:t></a:r><a:r><a:t>Body</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);

    const result = await buildDocumentPreview({ name: 'control.pptx', buffer: await zip.generateAsync({ type: 'nodebuffer' }) });
    assert.deepEqual(result.sections, [{ title: 'Slide 1', lines: ['Title', 'Body'] }]);
  });
});

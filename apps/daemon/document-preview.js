import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { kindFor } from './projects.js';

const execFileP = promisify(execFile);
const MAX_COMPRESSED_PREVIEW_BYTES = 10 * 1024 * 1024;
const MAX_UNCOMPRESSED_PREVIEW_BYTES = 50 * 1024 * 1024;
const MAX_XML_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PREVIEW_CONCURRENCY = 2;
const pdfPreviewQueue = createLimiter(MAX_PDF_PREVIEW_CONCURRENCY);

export async function buildDocumentPreview(file) {
  const kind = kindFor(file.name);
  if (!['pdf', 'document', 'presentation', 'spreadsheet'].includes(kind)) {
    const err = new Error('unsupported preview type');
    err.statusCode = 415;
    throw err;
  }

  if (kind === 'pdf') {
    return {
      kind,
      title: path.basename(file.name),
      sections: await pdfPreviewQueue(() => previewPdf(file.buffer)),
    };
  }

  assertPreviewInputSize(file.buffer.length);
  const zip = await JSZip.loadAsync(file.buffer);
  assertZipPreviewSize(zip);
  if (kind === 'document') {
    return {
      kind,
      title: path.basename(file.name),
      sections: await previewDocx(zip),
    };
  }
  if (kind === 'presentation') {
    return {
      kind,
      title: path.basename(file.name),
      sections: await previewPptx(zip),
    };
  }
  return {
    kind,
    title: path.basename(file.name),
    sections: await previewXlsx(zip),
  };
}

async function previewPdf(buffer) {
  assertPreviewInputSize(buffer.length);
  const tmpDir = await mkdtemp(path.join(tmpdir(), 'od-preview-'));
  const tmpFile = path.join(tmpDir, 'input.pdf');
  await writeFile(tmpFile, buffer, { flag: 'wx' });
  try {
    const { stdout } = await execFileP('pdftotext', ['-layout', tmpFile, '-'], {
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
    });
    const lines = stdout
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter((line) => line.trim().length > 0);
    return [
      {
        title: 'PDF',
        lines: lines.length > 0 ? lines : ['No readable text found.'],
      },
    ];
  } catch {
    return [
      {
        title: 'PDF',
        lines: ['Text preview is unavailable. Use Open or Download to inspect the PDF.'],
      },
    ];
  } finally {
    rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function previewDocx(zip) {
  const xml = await readZipText(zip, 'word/document.xml');
  const paragraphs = extractParagraphs(xml, /<w:p\b[\s\S]*?<\/w:p>/g);
  return [
    {
      title: 'Document',
      lines: paragraphs.length > 0 ? paragraphs : ['No readable text found.'],
    },
  ];
}

async function previewPptx(zip) {
  const slideNames = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort(numericPathSort);
  const sections = [];
  for (let i = 0; i < slideNames.length; i += 1) {
    const xml = await readZipText(zip, slideNames[i]);
    const lines = extractTextRuns(xml);
    sections.push({
      title: `Slide ${i + 1}`,
      lines: lines.length > 0 ? lines : ['No readable text found.'],
    });
  }
  return sections.length > 0
    ? sections
    : [{ title: 'Presentation', lines: ['No readable slides found.'] }];
}

async function previewXlsx(zip) {
  const sharedStrings = await readSharedStrings(zip);
  const workbook = await readWorkbook(zip);
  const sections = [];
  for (const sheet of workbook) {
    const xml = await readZipText(zip, sheet.path).catch(() => '');
    const lines = extractWorksheetRows(xml, sharedStrings);
    sections.push({
      title: sheet.name,
      lines: lines.length > 0 ? lines : ['No readable cell values found.'],
    });
  }
  return sections.length > 0
    ? sections
    : [{ title: 'Spreadsheet', lines: ['No readable sheets found.'] }];
}

async function readSharedStrings(zip) {
  const xml = await readZipText(zip, 'xl/sharedStrings.xml').catch(() => '');
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si\b[\s\S]*?<\/si>/g)).map((m) =>
    extractTextRuns(m[0]).join(''),
  );
}

async function readWorkbook(zip) {
  const workbookXml = await readZipText(zip, 'xl/workbook.xml').catch(() => '');
  const relsXml = await readZipText(zip, 'xl/_rels/workbook.xml.rels').catch(() => '');
  const rels = new Map();
  for (const rel of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(rel[1]);
    if (attrs.Id && attrs.Target) rels.set(attrs.Id, attrs.Target);
  }
  const sheets = [];
  for (const sheet of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
    const attrs = parseAttrs(sheet[1]);
    const relId = attrs['r:id'];
    const target = relId ? rels.get(relId) : null;
    if (!target) continue;
    sheets.push({
      name: attrs.name || `Sheet ${sheets.length + 1}`,
      path: `xl/${target.replace(/^\/?xl\//, '')}`,
    });
  }
  if (sheets.length > 0) return sheets;
  return Object.keys(zip.files)
    .filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(name))
    .sort(numericPathSort)
    .map((name, i) => ({ name: `Sheet ${i + 1}`, path: name }));
}

function extractWorksheetRows(xml, sharedStrings) {
  const rows = [];
  for (const row of xml.matchAll(/<row\b[\s\S]*?<\/row>/g)) {
    const values = [];
    for (const cell of row[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = parseAttrs(cell[1]);
      const body = cell[2];
      let value = '';
      if (attrs.t === 's') {
        const idx = Number(extractFirst(body, /<v>([\s\S]*?)<\/v>/));
        value = Number.isInteger(idx) ? sharedStrings[idx] ?? '' : '';
      } else if (attrs.t === 'inlineStr') {
        value = extractTextRuns(body).join('');
      } else {
        value = decodeXml(extractFirst(body, /<v>([\s\S]*?)<\/v>/));
      }
      if (value.trim()) values.push(value.trim());
    }
    if (values.length > 0) rows.push(values.join(' | '));
  }
  return rows;
}

function extractParagraphs(xml, paragraphPattern) {
  return Array.from(xml.matchAll(paragraphPattern))
    .map((m) => extractTextRuns(m[0]).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extractTextRuns(xml) {
  return Array.from(xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>|<w:t[^>]*>([\s\S]*?)<\/w:t>|<t[^>]*>([\s\S]*?)<\/t>/g))
    .map((m) => decodeXml(m[1] ?? m[2] ?? m[3] ?? '').trim())
    .filter(Boolean);
}

async function readZipText(zip, name) {
  const entry = zip.file(name);
  if (!entry) throw new Error(`missing ${name}`);
  const size = entry._data?.uncompressedSize ?? 0;
  if (size > MAX_XML_ENTRY_BYTES) {
    const err = new Error('document section too large to preview');
    err.statusCode = 413;
    throw err;
  }
  const xml = await entry.async('text');
  assertSafeXml(xml);
  return xml;
}

function parseAttrs(raw) {
  const attrs = {};
  for (const m of raw.matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attrs[m[1]] = decodeXml(m[2]);
  }
  return attrs;
}

function extractFirst(raw, pattern) {
  const m = raw.match(pattern);
  return m ? m[1] ?? '' : '';
}

function decodeXml(raw) {
  return String(raw)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function assertPreviewInputSize(size) {
  if (size > MAX_COMPRESSED_PREVIEW_BYTES) {
    const err = new Error('document too large to preview');
    err.statusCode = 413;
    throw err;
  }
}

function assertZipPreviewSize(zip) {
  let total = 0;
  for (const entry of Object.values(zip.files)) {
    total += entry._data?.uncompressedSize ?? 0;
    if (total > MAX_UNCOMPRESSED_PREVIEW_BYTES) {
      const err = new Error('document too large to preview');
      err.statusCode = 413;
      throw err;
    }
  }
}

function assertSafeXml(xml) {
  if (/<!DOCTYPE\b|<!ENTITY\b/i.test(xml)) {
    const err = new Error('unsupported XML entities');
    err.statusCode = 415;
    throw err;
  }
}

function createLimiter(limit) {
  let active = 0;
  const pending = [];
  const runNext = () => {
    if (active >= limit || pending.length === 0) return;
    active += 1;
    const { task, resolve, reject } = pending.shift();
    Promise.resolve()
      .then(task)
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        runNext();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      pending.push({ task, resolve, reject });
      runNext();
    });
}

function numericPathSort(a, b) {
  const an = Number(a.match(/(\d+)(?=\.xml$)/)?.[1] ?? 0);
  const bn = Number(b.match(/(\d+)(?=\.xml$)/)?.[1] ?? 0);
  return an - bn || a.localeCompare(b);
}

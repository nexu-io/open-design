// Phase 6/7 entry slice / spec §10 / §21.3.2 — design-extract atom.
//
// SKILL.md fragment ships at plugins/_official/atoms/design-extract/.
// The runner takes a project cwd that already has
// `<cwd>/code/index.json` (the output of the `code-import` atom) and
// scans every text file under the source repo for design tokens. It
// writes the canonical bag the SKILL.md fragment promises:
//
//   <cwd>/code/tokens.json
//
// The actual text scanner lives in `token-evidence.ts` so user
// design-system imports and migration atoms share one evidence collector.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import type { CodeImportIndex } from './code-import.js';
import {
  createDesignTokenEvidenceCollector,
  type DesignExtractReport,
  type DesignTokenEntry,
  type DesignTokenKind,
} from '../../design-systems/token-evidence.js';

export type {
  DesignExtractReport,
  DesignTokenEntry,
  DesignTokenKind,
};

export interface DesignExtractOptions {
  // Project cwd containing code/index.json + the source files.
  cwd: string;
  // Repo root (where the imported source actually lives — typically
  // distinct from cwd; the runner reads file contents via this path).
  repoPath: string;
  // Per-file size cap — files larger than this are skipped because
  // the regex pass becomes O(n) on hundreds of MB of bundled JS.
  // Default 256 KiB.
  largeFileBytes?: number;
}

const DEFAULT_LARGE_FILE = 256 * 1024;

export async function runDesignExtract(opts: DesignExtractOptions): Promise<DesignExtractReport> {
  const cwd = path.resolve(opts.cwd);
  const repoPath = path.resolve(opts.repoPath);
  const largeFileBytes = opts.largeFileBytes ?? DEFAULT_LARGE_FILE;
  const indexPath = path.join(cwd, 'code', 'index.json');
  const warnings: string[] = [];

  let index: CodeImportIndex;
  try {
    const raw = await fsp.readFile(indexPath, 'utf8');
    index = JSON.parse(raw) as CodeImportIndex;
  } catch (err) {
    throw new Error(`design-extract: missing or unreadable code/index.json (run code-import first): ${(err as Error).message}`);
  }

  const collector = createDesignTokenEvidenceCollector();
  for (const entry of index.files) {
    if (entry.size > largeFileBytes) continue;
    const lang = entry.language;
    if (lang !== 'css' && lang !== 'scss' && lang !== 'ts' && lang !== 'tsx' &&
        lang !== 'js' && lang !== 'jsx' && lang !== 'html' && lang !== 'json') {
      continue;
    }
    const abs = path.join(repoPath, entry.path);
    let text: string;
    try {
      text = await fsp.readFile(abs, 'utf8');
    } catch {
      warnings.push(`unreadable: ${entry.path}`);
      continue;
    }
    collector.scanText({ text, file: entry.path, language: lang });
  }

  if (collector.scannedFiles.length === 0) {
    warnings.push('design-extract scanned 0 files; check that code-import populated code/index.json');
  }

  const report = collector.toReport({
    warnings,
    endedAt: new Date().toISOString(),
  });

  await fsp.mkdir(path.join(cwd, 'code'), { recursive: true });
  await fsp.writeFile(
    path.join(cwd, 'code', 'tokens.json'),
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );
  return report;
}

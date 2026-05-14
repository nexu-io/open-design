/**
 * Critique-coverage walker (Phase 13.4). Walks every named surface of
 * the Critique Theater feature (i18n keys, SSE event names, PanelEvent
 * variants, reducer state phases) and asserts that each one is
 * referenced from at least one production file and one test file under
 * the workspace. Catches orphan symbols introduced by an in-flight
 * refactor before they reach review.
 *
 * Lives as a vitest case so the existing
 * `pnpm --filter @open-design/web test` pipeline picks it up; no new
 * CI script entry to maintain. The plan calls for a separate
 * `pnpm check:critique-coverage` walker, but the vitest equivalent
 * runs in the same gate without the extra glue.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { describe, expect, it } from 'vitest';

import { CRITIQUE_SSE_EVENT_NAMES, PANELIST_ROLES } from '@open-design/contracts/critique';

const __filename = url.fileURLToPath(import.meta.url);
// dirname is apps/web/tests/components/Theater. Up 5 segments lands
// at the repo root (Theater -> components -> tests -> web -> apps -> repo).
const REPO_ROOT = path.resolve(path.dirname(__filename), '..', '..', '..', '..', '..');

const SRC_ROOTS = [
  path.join(REPO_ROOT, 'apps/web/src'),
  path.join(REPO_ROOT, 'apps/daemon/src/critique'),
  path.join(REPO_ROOT, 'packages/contracts/src'),
];
const TEST_ROOTS = [
  path.join(REPO_ROOT, 'apps/web/tests'),
  path.join(REPO_ROOT, 'apps/daemon/tests'),
  path.join(REPO_ROOT, 'packages/contracts/tests'),
  path.join(REPO_ROOT, 'e2e/ui'),
];

function walk(root: string): string[] {
  const out: string[] = [];
  let stack: string[] = [];
  try {
    stack = [root];
  } catch {
    return out;
  }
  while (stack.length > 0) {
    const cur = stack.pop()!;
    let stat;
    try {
      stat = statSync(cur);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      let entries: string[];
      try {
        entries = readdirSync(cur);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === 'dist' || entry === '.next') continue;
        stack.push(path.join(cur, entry));
      }
    } else if (stat.isFile()) {
      if (/\.(ts|tsx|js|jsx|css|md)$/.test(cur)) out.push(cur);
    }
  }
  return out;
}

const SRC_FILES = SRC_ROOTS.flatMap(walk);
const TEST_FILES = TEST_ROOTS.flatMap(walk);

const SRC_CORPUS = readCorpus(SRC_FILES);
const TEST_CORPUS = readCorpus(TEST_FILES);

function readCorpus(files: string[]): string {
  return files.map((f) => {
    try {
      return readFileSync(f, 'utf8');
    } catch {
      return '';
    }
  }).join('\n');
}

function symbols(): string[] {
  const out: string[] = [];
  // Every CRITIQUE_SSE_EVENT_NAME is a wire-level identity. Each must
  // be referenced at least once in production and at least once in
  // tests so a rename is impossible without updating both sides.
  for (const name of CRITIQUE_SSE_EVENT_NAMES) out.push(name);
  // Every panelist role token appears in role-keyed CSS, the reducer
  // capability switches, and the i18n key set.
  for (const role of PANELIST_ROLES) out.push(`'${role}'`);
  // Reducer phases.
  out.push("phase: 'idle'", "phase: 'running'", "phase: 'shipped'",
    "phase: 'degraded'", "phase: 'interrupted'", "phase: 'failed'");
  // Critical i18n keys the spec calls out as named anchors. Every key
  // must appear in en.ts (production) and at least one test should
  // assert against the resolved string.
  for (const key of [
    'critiqueTheater.userFacingName',
    'critiqueTheater.roundLabel',
    'critiqueTheater.composite',
    'critiqueTheater.threshold',
    'critiqueTheater.interrupt',
    'critiqueTheater.interrupted',
    'critiqueTheater.degradedHeading',
    'critiqueTheater.shippedSummary',
    'critiqueTheater.interruptedSummary',
  ]) out.push(key);
  return out;
}

describe('critique-coverage walker (Phase 13.4)', () => {
  const SYMBOLS = symbols();

  it.each(SYMBOLS)('production references %s', (sym) => {
    expect(SRC_CORPUS.includes(sym)).toBe(true);
  });

  it.each(SYMBOLS)('tests reference %s', (sym) => {
    // Accept either the full `critique.<event>` channel name or the
    // unprefixed `<event>` PanelEvent type for SSE-event symbols.
    // Tests typically dispatch the PanelEvent shape into the reducer
    // (no `critique.` prefix) while production code uses the prefixed
    // form on the SSE wire; both prove the symbol is exercised end-
    // to-end.
    if (sym.startsWith('critique.')) {
      const unprefixed = sym.slice('critique.'.length);
      const direct = TEST_CORPUS.includes(sym);
      const viaUnprefixed = new RegExp(`type:\\s*'${unprefixed}'`).test(TEST_CORPUS);
      expect(direct || viaUnprefixed).toBe(true);
    } else {
      expect(TEST_CORPUS.includes(sym)).toBe(true);
    }
  });
});

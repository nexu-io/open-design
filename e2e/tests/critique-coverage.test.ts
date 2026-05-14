/**
 * Critique surface coverage walker (Phase 13.2). Walks every named
 * symbol of the Critique Theater feature (SSE event names, panelist
 * roles, reducer state phases, i18n keys) and asserts that each one
 * is referenced from at least one production file AND at least one
 * test file across the workspace.
 *
 * Lives in `e2e/tests/` per the repo boundary rule (root `AGENTS.md`):
 *
 *   > Cross-app, cross-runtime, or repository-resource consistency
 *   > checks belong in `e2e/tests/` when they need to observe more
 *   > than one app/package boundary.
 *
 *   > App packages must not import another app's private `src/` or
 *   > `tests/` implementation as a shared helper.
 *
 * The walker is by definition cross-app: it reads the web reducer,
 * the daemon critique module, the contracts package, and the e2e UI
 * suite. Hosting it under `apps/web/tests/` would couple the web
 * package's test lane to daemon and e2e file layout (so a
 * daemon-only refactor could break the web lane), which is exactly
 * the boundary the repo rule forbids. Siri-Ray P2 on PR #1318.
 *
 * Adding a new SSE event / role / phase / i18n key:
 *
 *   1. Add the symbol to its contract / dictionary in
 *      `packages/contracts/src/critique.ts` (SSE events, roles) or
 *      `apps/web/src/i18n/types.ts` plus every locale (i18n keys).
 *   2. Add at least one production caller (reducer branch, role-
 *      keyed CSS, i18n consumer).
 *   3. Add at least one test that exercises the new symbol.
 *   4. Append the symbol literal to the right group below.
 *      `SSE_EVENTS` is auto-built from
 *      `CRITIQUE_SSE_EVENT_NAMES` so it stays in sync without
 *      manual upkeep; `PANELIST_ROLE_STRINGS` is auto-built from
 *      `PANELIST_ROLES` for the same reason. `PHASE_STRINGS` and
 *      `I18N_KEYS` are hand-maintained.
 *
 *   What the walker DOES catch:
 *
 *     Renaming an EXISTING symbol in production / tests without
 *     updating the walker array trips the gate. The walker still
 *     looks for the old name and fails to find it; the reviewer
 *     of the rename PR sees the failing assertion and asks for
 *     the walker update in the same diff.
 *
 *   What the walker does NOT catch on its own:
 *
 *     Adding a NEW hand-maintained symbol (phase string or i18n
 *     key) without adding it to the walker array leaves the gate
 *     green because the walker does not know to look for a symbol
 *     it was not told about. Mitigation: contracts-derived groups
 *     (`SSE_EVENTS`, `PANELIST_ROLE_STRINGS`) auto-grow so the
 *     contracts package is the only place that needs editing;
 *     the hand-maintained groups (`PHASE_STRINGS`, `I18N_KEYS`)
 *     are short enough that step 4 is a one-line edit alongside
 *     the contracts / i18n change.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

declare global {
  interface ImportMeta {
    glob<T = unknown>(pattern: string, options: { eager: true }): Record<string, T>;
  }
}

type CritiqueContracts = {
  CRITIQUE_SSE_EVENT_NAMES: readonly string[];
  PANELIST_ROLES: readonly string[];
};

const contractsModules = import.meta.glob<CritiqueContracts>(
  '../../packages/contracts/src/critique.ts',
  { eager: true },
);
const contracts = Object.values(contractsModules)[0];
if (!contracts) {
  throw new Error(
    'critique-coverage walker could not load packages/contracts/src/critique.ts via import.meta.glob; '
      + 'this almost always means the contracts file was renamed or moved.',
  );
}
const { CRITIQUE_SSE_EVENT_NAMES, PANELIST_ROLES } = contracts;

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SELF_PATH = fileURLToPath(import.meta.url);

const SRC_ROOTS = [
  path.join(REPO_ROOT, 'apps/web/src'),
  path.join(REPO_ROOT, 'apps/daemon/src/critique'),
  path.join(REPO_ROOT, 'packages/contracts/src'),
];
const TEST_ROOTS = [
  path.join(REPO_ROOT, 'apps/web/tests'),
  path.join(REPO_ROOT, 'apps/daemon/tests'),
  path.join(REPO_ROOT, 'packages/contracts/tests'),
  path.join(REPO_ROOT, 'e2e/tests'),
  path.join(REPO_ROOT, 'e2e/ui'),
];

const FILE_EXTENSIONS = /\.(ts|tsx|js|jsx|css|md)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', '.turbo']);

function walk(root: string): string[] {
  const out: string[] = [];
  const stack: string[] = [root];
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
        if (SKIP_DIRS.has(entry)) continue;
        stack.push(path.join(cur, entry));
      }
    } else if (stat.isFile() && FILE_EXTENSIONS.test(cur)) {
      out.push(cur);
    }
  }
  return out;
}

function readCorpus(files: string[]): string {
  return files.map((f) => {
    try {
      return readFileSync(f, 'utf8');
    } catch {
      return '';
    }
  }).join('\n');
}

const SRC_FILES = SRC_ROOTS.flatMap(walk);
// The walker walks e2e/tests, which contains this file. Hand-maintained
// PHASE_STRINGS and I18N_KEYS literals declared below would otherwise
// satisfy the test-side coverage assertion against themselves, so a real
// downstream test exercising a symbol could be deleted with the gate
// still green. Exclude this file from TEST_FILES so the corpus only
// holds independent evidence.
const TEST_FILES = TEST_ROOTS.flatMap(walk).filter((f) => path.resolve(f) !== SELF_PATH);
const SRC_CORPUS = readCorpus(SRC_FILES);
const TEST_CORPUS = readCorpus(TEST_FILES);

/**
 * Strict source-side match: production code MUST reference the symbol
 * by its exact wire form. A `critique.<event>` SSE name must appear
 * as `critique.<event>`, not as the unprefixed PanelEvent type alias,
 * so the SSE channel name stays load-bearing in production.
 */
function srcReferences(corpus: string, sym: string): boolean {
  return corpus.includes(sym);
}

/**
 * Lenient test-side match: reducer tests dispatch the PanelEvent shape
 * directly (no `critique.` prefix on the SSE channel), so for an SSE
 * event symbol the test corpus is allowed to satisfy via either the
 * prefixed form (`critique.<event>`) or the unprefixed PanelEvent type
 * form (`type: '<event>'`). Both forms prove an assertion exercises the
 * event end-to-end.
 */
function testReferences(corpus: string, sym: string): boolean {
  if (corpus.includes(sym)) return true;
  if (sym.startsWith('critique.')) {
    const unprefixed = sym.slice('critique.'.length);
    return new RegExp(`type:\\s*'${unprefixed}'`).test(corpus);
  }
  return false;
}

const SSE_EVENTS = [...CRITIQUE_SSE_EVENT_NAMES];
const PANELIST_ROLE_STRINGS = PANELIST_ROLES.map((r) => `'${r}'`);

const PHASE_STRINGS = [
  "'idle'",
  "'running'",
  "'shipped'",
  "'degraded'",
  "'interrupted'",
  "'failed'",
];

const I18N_KEYS = [
  'critiqueTheater.userFacingName',
  'critiqueTheater.roundLabel',
  'critiqueTheater.composite',
  'critiqueTheater.threshold',
  'critiqueTheater.interrupt',
  'critiqueTheater.interrupted',
  'critiqueTheater.degradedHeading',
  'critiqueTheater.shippedSummary',
  'critiqueTheater.interruptedSummary',
];

describe('critique-coverage walker (Phase 13.2)', () => {
  describe('SSE event names', () => {
    it.each(SSE_EVENTS)('production references %s', (sym) => {
      expect(
        srcReferences(SRC_CORPUS, sym),
        `expected SRC corpus to mention SSE event "${sym}" at least once`,
      ).toBe(true);
    });

    it.each(SSE_EVENTS)('tests reference %s', (sym) => {
      expect(
        testReferences(TEST_CORPUS, sym),
        `expected TEST corpus to mention SSE event "${sym}" (prefixed or as PanelEvent type) at least once`,
      ).toBe(true);
    });
  });

  describe('Panelist roles', () => {
    it.each(PANELIST_ROLE_STRINGS)('production references %s', (sym) => {
      expect(
        srcReferences(SRC_CORPUS, sym),
        `expected SRC corpus to mention panelist role string ${sym} at least once`,
      ).toBe(true);
    });

    it.each(PANELIST_ROLE_STRINGS)('tests reference %s', (sym) => {
      expect(
        testReferences(TEST_CORPUS, sym),
        `expected TEST corpus to mention panelist role string ${sym} at least once`,
      ).toBe(true);
    });
  });

  describe('Reducer lifecycle phases', () => {
    it.each(PHASE_STRINGS)('production references %s', (sym) => {
      expect(
        srcReferences(SRC_CORPUS, sym),
        `expected SRC corpus to mention reducer phase string ${sym} at least once`,
      ).toBe(true);
    });

    it.each(PHASE_STRINGS)('tests reference %s', (sym) => {
      expect(
        testReferences(TEST_CORPUS, sym),
        `expected TEST corpus to mention reducer phase string ${sym} at least once`,
      ).toBe(true);
    });
  });

  describe('i18n keys', () => {
    it.each(I18N_KEYS)('production references %s', (sym) => {
      expect(
        srcReferences(SRC_CORPUS, sym),
        `expected SRC corpus to mention i18n key "${sym}" at least once`,
      ).toBe(true);
    });

    it.each(I18N_KEYS)('tests reference %s', (sym) => {
      expect(
        testReferences(TEST_CORPUS, sym),
        `expected TEST corpus to mention i18n key "${sym}" at least once`,
      ).toBe(true);
    });
  });
});

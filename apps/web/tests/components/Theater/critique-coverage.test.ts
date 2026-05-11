/**
 * Critique-coverage walker (Phase 13.2). Walks every named surface of
 * the Critique Theater feature (i18n keys, SSE event names, panelist
 * roles, reducer state phases) and asserts that each symbol is
 * referenced from at least one production file AND at least one test
 * file under the workspace. Catches orphan symbols introduced by an
 * in-flight refactor before they reach review.
 *
 * Lives as a vitest case so the existing
 * `pnpm --filter @open-design/web test` pipeline picks it up; no new
 * CI script entry to maintain. The plan calls for a separate
 * `pnpm check:critique-coverage` walker, but the vitest equivalent
 * runs in the same gate without the extra glue.
 *
 * Why grep over an AST walker (lefarcen Q2 on PR #1318):
 *
 *   An AST walker (TypeScript Compiler API / ESLint plugin / ts-morph)
 *   would catch some failure modes this grep does not: a key renamed
 *   in `Dict` but not in callers, a panelist role re-typed without
 *   re-flowing to the runtime guard. But it adds a non-trivial build
 *   surface (compiler API version pinning, source-map plumbing,
 *   incremental cache invalidation) that we do not need for the
 *   class of bugs this gate catches.
 *
 *   The class of bugs we are guarding against is rename drift:
 *   "the reducer dropped a symbol but i18n / CSS / contracts still
 *   reference the old name", or vice versa. That bug is structural
 *   at the string level, not at the AST level, so an exact-string
 *   substring check across both corpora is sufficient. The walker
 *   uses literal string matches with the surrounding quote
 *   characters (`'designer'`, not `designer`) so it does not
 *   false-positive on prose, comments, or substring overlaps.
 *
 *   A future PR can layer an AST walker on top once we have a
 *   bug class that benefits from it (e.g. a type-narrowing failure
 *   that string-level matching cannot see). Until then, grep is
 *   the right cost for the catch.
 *
 * Adding a new SSE event / role / phase / i18n key (lefarcen Q4 on
 * PR #1318):
 *
 *   1. Add the symbol to its contract / dictionary in
 *      `packages/contracts/src/critique.ts` (SSE events, roles)
 *      or `apps/web/src/i18n/types.ts` + every locale (i18n keys).
 *   2. Add at least one production caller (reducer branch, role-
 *      keyed CSS, i18n consumer).
 *   3. Add at least one test that exercises the new symbol.
 *   4. Add the symbol string to the appropriate group below
 *      (`SSE_EVENTS`, `PANELIST_ROLE_STRINGS`, `PHASE_STRINGS`,
 *      `I18N_KEYS`). The walker auto-enforces presence in both
 *      corpora on the next CI run.
 *
 *   Failure mode if a contributor forgets step 4: CI red, gate
 *   message names the missing symbol AND which corpus is missing
 *   it. The reviewer of the next PR sees this and asks for the
 *   walker update in the same diff.
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
      // Root may not exist on every clone (e.g. an unused workspace).
      // Silently skip rather than failing the whole walker.
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
const TEST_FILES = TEST_ROOTS.flatMap(walk);
const SRC_CORPUS = readCorpus(SRC_FILES);
const TEST_CORPUS = readCorpus(TEST_FILES);

/**
 * Match a symbol against a corpus. For prefixed SSE event names
 * (`critique.<event>`) we also accept the unprefixed PanelEvent type
 * form (`type: '<event>'`) on the test side, because reducer tests
 * dispatch the PanelEvent shape (no `critique.` prefix) while
 * production code uses the prefixed form on the SSE wire.
 */
function corpusReferences(corpus: string, sym: string): boolean {
  if (corpus.includes(sym)) return true;
  if (sym.startsWith('critique.')) {
    const unprefixed = sym.slice('critique.'.length);
    return new RegExp(`type:\\s*'${unprefixed}'`).test(corpus);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Symbol groups. When you add a new symbol to the critique surface, add the
// matching literal here. See the docblock at the top of this file for the
// maintenance steps.
// ---------------------------------------------------------------------------

const SSE_EVENTS = [...CRITIQUE_SSE_EVENT_NAMES];

const PANELIST_ROLE_STRINGS = PANELIST_ROLES.map((r) => `'${r}'`);

// Phases: bare-quoted form (e.g. `'idle'`) so the assertion matches
// every realistic call site shape — `phase: 'idle'`, `phase === 'idle'`,
// `case 'idle':`, the i18n key `'critiqueTheater.phaseIdle'` — without
// being brittle to one specific source shape.
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
        corpusReferences(SRC_CORPUS, sym),
        `expected SRC corpus to mention SSE event "${sym}" at least once`,
      ).toBe(true);
    });

    it.each(SSE_EVENTS)('tests reference %s', (sym) => {
      expect(
        corpusReferences(TEST_CORPUS, sym),
        `expected TEST corpus to mention SSE event "${sym}" (prefixed or as PanelEvent type) at least once`,
      ).toBe(true);
    });
  });

  describe('Panelist roles', () => {
    it.each(PANELIST_ROLE_STRINGS)('production references %s', (sym) => {
      expect(
        corpusReferences(SRC_CORPUS, sym),
        `expected SRC corpus to mention panelist role string ${sym} at least once`,
      ).toBe(true);
    });

    it.each(PANELIST_ROLE_STRINGS)('tests reference %s', (sym) => {
      expect(
        corpusReferences(TEST_CORPUS, sym),
        `expected TEST corpus to mention panelist role string ${sym} at least once`,
      ).toBe(true);
    });
  });

  describe('Reducer lifecycle phases', () => {
    it.each(PHASE_STRINGS)('production references %s', (sym) => {
      expect(
        corpusReferences(SRC_CORPUS, sym),
        `expected SRC corpus to mention reducer phase string ${sym} at least once`,
      ).toBe(true);
    });

    it.each(PHASE_STRINGS)('tests reference %s', (sym) => {
      expect(
        corpusReferences(TEST_CORPUS, sym),
        `expected TEST corpus to mention reducer phase string ${sym} at least once`,
      ).toBe(true);
    });
  });

  describe('i18n keys', () => {
    it.each(I18N_KEYS)('production references %s', (sym) => {
      expect(
        corpusReferences(SRC_CORPUS, sym),
        `expected SRC corpus to mention i18n key "${sym}" at least once`,
      ).toBe(true);
    });

    it.each(I18N_KEYS)('tests reference %s', (sym) => {
      expect(
        corpusReferences(TEST_CORPUS, sym),
        `expected TEST corpus to mention i18n key "${sym}" at least once`,
      ).toBe(true);
    });
  });
});

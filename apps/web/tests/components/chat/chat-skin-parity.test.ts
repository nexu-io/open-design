import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * OPEND-2204 — chat style ownership.
 *
 * `routines.css` carries the project-view chat skin behind a `.app` ancestor,
 * but `.app` only exists in `ProjectView`. The design-system flow renders the
 * same `ChatPane` under `.workspace-shell`, so it silently loses that skin
 * (chat header chrome, transcript background, assistant prose metrics, bubble
 * widths...).
 *
 * The invariant this file locks:
 *
 *   1. Every chat-owned rule in `routines.css` that is scoped to `.app` also
 *      matches under `.chat-skin`, at the SAME specificity — either as a
 *      paired `.app X, .chat-skin X` selector list, or as
 *      `:is(.app, .chat-skin) X`. Both forms keep the ancestor at one class,
 *      so the rule still beats / loses to `chat.css` exactly as before.
 *   2. The `.app ` prefix is never simply deleted — dropping it would take the
 *      rule from (0,2,0) to (0,1,0) and invert its relationship with the
 *      `chat.css` base rules.
 *   3. The container that hosts `ChatPane` in `DesignSystemFlow` carries
 *      `chat-skin`, so path #2 actually opts in.
 */

const routinesCss = readFileSync(
  new URL('../../../src/styles/viewer/routines.css', import.meta.url),
  'utf8',
);
const designSystemFlowSource = readFileSync(
  new URL('../../../src/components/DesignSystemFlow.tsx', import.meta.url),
  'utf8',
);

/**
 * Anchor = the first class compound after the `.app` ancestor. A rule anchored
 * at one of these owns chat transcript / composer chrome, so it belongs to the
 * shared skin. Anything else under `.app` (workspace tabs, design-files table,
 * handoff menu, split layout, app chrome) stays project-view-only.
 */
const CHAT_ANCHOR =
  /^(?:chat-header(?:-tabs?|-actions)?|chat-log(?:-tail-spacer)?|chat-empty(?:-wrap|-title|-hint)?|chat-examples?|chat-example-(?:icon|title|prompt|cta)|chat-design-artifacts?(?:-empty)?|chat-design-artifact-[a-z-]+|chat-connect-repo(?:-[a-z-]+)?|msg|msg-time|composer|composer-[a-z-]+|prose-block)$/;

/**
 * Key elements deliberately left on `.app` even when the rule is anchored in a
 * chat family, because their own base rules stay project-view-only. Moving the
 * modifier without the base would leave the design-system path half-styled,
 * which is worse than leaving it untouched. Tracked in the OPEND-2204 report.
 */
const HELD_BACK_KEY = /(?:assistant-footer|working-dir-pill)/;

const APP_COMPOUND = /(^|\s)\.app(?=[\s.:[>]|$)/;

interface Rule {
  line: number;
  branches: string[];
}

function blankComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (block) =>
    block.replace(/[^\n]/g, ' '),
  );
}

/** Split a selector list on top-level commas (ignores commas in `()`/`[]`). */
function splitBranches(prelude: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < prelude.length; i += 1) {
    const c = prelude[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(prelude.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(prelude.slice(start).trim());
  return out.filter(Boolean);
}

/** Collect every declaration block's selector list (at any at-rule nesting). */
function declarationRules(source: string): Rule[] {
  const scan = blankComments(source);
  const rules: Rule[] = [];
  const stack: Array<{ start: number; open: number }> = [];
  let preludeStart = 0;
  for (let i = 0; i < scan.length; i += 1) {
    const c = scan[i];
    if (c === '{') {
      stack.push({ start: preludeStart, open: i });
      preludeStart = i + 1;
    } else if (c === '}') {
      const frame = stack.pop();
      if (frame && !scan.slice(frame.open + 1, i).includes('{')) {
        rules.push({
          line: source.slice(0, frame.start).split('\n').length,
          branches: splitBranches(scan.slice(frame.start, frame.open)),
        });
      }
      preludeStart = i + 1;
    } else if (c === ';' && stack.length === 0) {
      preludeStart = i + 1;
    }
  }
  return rules;
}

function anchorAfterApp(branch: string): string | null {
  const match = APP_COMPOUND.exec(branch);
  if (!match) return null;
  const rest = branch.slice(match.index + match[0].length).replace(/^[>+~]\s*/, '').trimStart();
  return /^\.([A-Za-z0-9_-]+)/.exec(rest)?.[1] ?? null;
}

function keyCompound(branch: string): string {
  const last = branch.trim().split(/\s+/).at(-1) ?? '';
  return last;
}

function chatSkinTwin(branch: string): string {
  return branch.replace(APP_COMPOUND, (_m, lead: string) => `${lead}.chat-skin`);
}

function normalize(selector: string): string {
  return selector.replace(/\s+/g, ' ').trim();
}

/** `:is(.app, .chat-skin) X` already covers both hosts in a single branch. */
const IS_PAIR = /:is\(\s*\.app\s*,\s*\.chat-skin\s*\)|:is\(\s*\.chat-skin\s*,\s*\.app\s*\)/;

function chatOwnedAppBranches(rule: Rule): string[] {
  return rule.branches.filter((branch) => {
    if (!APP_COMPOUND.test(branch)) return false;
    const anchor = anchorAfterApp(branch);
    if (!anchor || !CHAT_ANCHOR.test(anchor)) return false;
    if (HELD_BACK_KEY.test(keyCompound(branch))) return false;
    return true;
  });
}

describe('OPEND-2204 chat skin parity', () => {
  it('exposes every chat-owned `.app` rule to `.chat-skin` as well', () => {
    const rules = declarationRules(routinesCss);
    const uncovered: string[] = [];

    for (const rule of rules) {
      const covered = new Set(rule.branches.map(normalize));
      for (const branch of chatOwnedAppBranches(rule)) {
        if (IS_PAIR.test(branch)) continue;
        if (!covered.has(normalize(chatSkinTwin(branch)))) {
          uncovered.push(`routines.css:${rule.line}  ${normalize(branch)}`);
        }
      }
    }

    expect(uncovered).toEqual([]);
  });

  it('keeps the `.app` ancestor so specificity never drops to a single class', () => {
    // Sentinels for the three gaps the audit measured: chat header chrome,
    // transcript ground, and assistant prose metrics. If a future refactor
    // "simplifies" these by deleting `.app `, the parity test above would pass
    // vacuously — this one would not.
    for (const selector of [
      '.app .chat-header',
      '.app .chat-log',
      '.app .msg.assistant',
      '.app .msg.user',
      '.app .msg.assistant .prose-block',
    ]) {
      expect(
        declarationRules(routinesCss).some((rule) =>
          rule.branches.some((branch) => normalize(branch) === selector),
        ),
        `expected ${selector} to still exist verbatim in routines.css`,
      ).toBe(true);
    }
  });

  it('opts the design-system flow ChatPane container into the shared skin', () => {
    const occurrences = designSystemFlowSource.match(/<ChatPane\b/g) ?? [];
    expect(occurrences).toHaveLength(1);

    const chatPaneAt = designSystemFlowSource.indexOf('<ChatPane');
    const before = designSystemFlowSource.slice(0, chatPaneAt);
    const enclosing = [...before.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)].at(-1);
    const classList = enclosing?.[1] ?? enclosing?.[2] ?? '';

    expect(classList.split(/\s+/)).toContain('chat-skin');
  });
});

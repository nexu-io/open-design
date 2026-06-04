export type InlineMentionKind =
  | 'plugin'
  | 'skill'
  | 'mcp'
  | 'file'
  | 'workspace'
  | 'connector'
  | 'unknown';

export interface InlineMentionEntity {
  id: string;
  kind: InlineMentionKind;
  label: string;
  token?: string;
  title?: string;
}

export type InlineMentionPart =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'mention';
      entity: InlineMentionEntity;
      text: string;
    };

export function inlineMentionToken(label: string): string {
  return label.startsWith('@') ? label : `@${label}`;
}

export function buildInlineMentionParts(
  text: string,
  entities: InlineMentionEntity[],
  options: { highlightUnknown?: boolean } = {},
): InlineMentionPart[] | null {
  if (!text) return null;
  if (!text.includes('@')) return null;
  const highlightUnknown = options.highlightUnknown ?? true;
  const known = getMentionTokenIndex(entities);
  const parts: InlineMentionPart[] = [];
  let scanStart = 0;
  let copiedUntil = 0;
  let found = false;

  while (scanStart < text.length) {
    const start = text.indexOf('@', scanStart);
    if (start === -1) break;
    if (!isMentionBoundary(text, start)) {
      scanStart = start + 1;
      continue;
    }

    const knownMatch = findKnownMentionAt(text, known, start);
    const unknownMatch = highlightUnknown ? findUnknownMentionAt(text, start) : null;
    const match =
      knownMatch && (!unknownMatch || knownMatch.token.length >= unknownMatch.token.length)
        ? knownMatch
        : unknownMatch;

    if (!match) {
      scanStart = start + 1;
      continue;
    }

    if (match.start > copiedUntil) {
      parts.push({ kind: 'text', text: text.slice(copiedUntil, match.start) });
    }
    parts.push({
      kind: 'mention',
      entity: match.entity,
      text: match.token,
    });
    found = true;
    copiedUntil = match.start + match.token.length;
    scanStart = copiedUntil;
  }

  if (copiedUntil < text.length) {
    parts.push({ kind: 'text', text: text.slice(copiedUntil) });
  }

  return found ? coalesceTextParts(parts) : null;
}

interface MentionTrieNode {
  children: Map<string, MentionTrieNode>;
  entity?: InlineMentionEntity;
  token?: string;
}

interface MentionTokenIndex {
  root: MentionTrieNode;
}

const mentionTokenIndexCache = new WeakMap<InlineMentionEntity[], MentionTokenIndex>();

function getMentionTokenIndex(entities: InlineMentionEntity[]): MentionTokenIndex {
  const cached = mentionTokenIndexCache.get(entities);
  if (cached) return cached;

  const root: MentionTrieNode = { children: new Map() };
  const seen = new Set<string>();
  const normalized = entities
    .map((entity) => {
      const token = entity.token ?? inlineMentionToken(entity.label);
      return {
        id: entity.id,
        kind: entity.kind,
        label: entity.label,
        token,
        ...(entity.title ? { title: entity.title } : {}),
      };
    })
    .filter((entity) => {
      if (!entity.token || entity.token === '@') return false;
      const key = `${entity.kind}:${entity.token}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.token?.length ?? 0) - (a.token?.length ?? 0));

  for (const entity of normalized) {
    const token = entity.token;
    if (!token) continue;
    let node = root;
    for (const char of token) {
      let child = node.children.get(char);
      if (!child) {
        child = { children: new Map() };
        node.children.set(char, child);
      }
      node = child;
    }
    if (!node.entity) {
      node.entity = entity;
      node.token = token;
    }
  }

  const index = { root };
  mentionTokenIndexCache.set(entities, index);
  return index;
}

function findKnownMentionAt(
  text: string,
  index: MentionTokenIndex,
  start: number,
): MentionMatch | null {
  let best: MentionMatch | null = null;
  let node: MentionTrieNode | undefined = index.root;
  for (let i = start; i < text.length; i += 1) {
    node = node.children.get(text[i] ?? '');
    if (!node) break;
    if (node.entity && node.token && isMentionRightBoundary(text, i + 1)) {
      best = { start, token: node.token, entity: node.entity };
    }
  }
  return best;
}

function findUnknownMentionAt(text: string, start: number): MentionMatch | null {
  let end = start + 1;
  if (end >= text.length || /[\s@]/.test(text[end] ?? '')) return null;
  while (end < text.length && !/[\s@]/.test(text[end] ?? '')) {
    end += 1;
  }
  const token = text.slice(start, end);
  return {
    start,
    token,
    entity: {
      id: `unknown:${token}`,
      kind: 'unknown',
      label: token.slice(1),
      token,
      title: token,
    },
  };
}

/**
 * Left boundary rule for inline mentions: `@<token>` is a candidate
 * mention only when the character before `@` is the start of the
 * string or whitespace / opening bracket / quote. Exported so the
 * draft-side plugin-insertion tracker stays in lockstep with this
 * parser — see `apps/web/src/utils/pluginInsertionTracking.ts`.
 */
export function isMentionBoundary(text: string, start: number): boolean {
  if (start === 0) return true;
  return /[\s([{"']/.test(text[start - 1] ?? '');
}

/**
 * Right boundary rule for inline mentions: the parser's unknown
 * mention regex is `/@[^\s@]+/`, so a `@<token>` candidate is the
 * full mention only when the character after the token is the end
 * of the string, whitespace, or another `@` (which would start a
 * new mention). Anything else extends the parser's tokenization
 * past the candidate — e.g. `@Airbnb/foo` is parsed as a single
 * mention even when `@Airbnb` is a known plugin. Exported for the
 * same reason as `isMentionBoundary`: the draft-side tracker must
 * not declare an entry "still valid" when the parser would no
 * longer see the tracked token as a standalone mention.
 */
export function isMentionRightBoundary(text: string, end: number): boolean {
  if (end >= text.length) return true;
  return /[\s@]/.test(text[end] ?? '');
}

function coalesceTextParts(parts: InlineMentionPart[]): InlineMentionPart[] {
  const result: InlineMentionPart[] = [];
  for (const part of parts) {
    const last = result[result.length - 1];
    if (part.kind === 'text' && last?.kind === 'text') {
      last.text += part.text;
    } else if (part.kind === 'text' && part.text.length === 0) {
      continue;
    } else {
      result.push(part);
    }
  }
  return result;
}

interface MentionMatch {
  start: number;
  token: string;
  entity: InlineMentionEntity;
}

/**
 * Submit-time right boundary for reconciling a *still-visible atomic pill*
 * against serialized text. Looser than `isMentionRightBoundary`: an atomic
 * mention pill stays selected even when the user types trailing punctuation
 * right after it (e.g. `@Slack,` or `@Notion.`), so the character after the
 * token may also be sentence/clause punctuation that cannot be part of a
 * mention token (`@[^\s@]+`). Letters, digits, `/`, `-`, etc. still fail,
 * because those would extend the token into a *different* word the user is
 * actively typing rather than a closed pill followed by punctuation.
 *
 * This intentionally does NOT relax `isMentionRightBoundary`, whose stricter
 * rule the inline parser and the draft-side tracker depend on.
 */
function isMentionSubmitRightBoundary(text: string, end: number): boolean {
  if (end >= text.length) return true;
  return /[\s@,.;:!?)\]}"'»”’]/.test(text[end] ?? '');
}

/**
 * Whether `@label` appears in `text` as a standalone inline mention (proper
 * left boundary, not a substring of a longer word). Used to reconcile selected
 * context (plugins/MCP/connectors) against the prompt at submit time: a context
 * whose mention pill the user deleted should not be sent to the agent. Unlike
 * the parser's `isMentionRightBoundary`, this treats trailing punctuation after
 * a still-visible pill (e.g. `@Slack,`) as present — see
 * `isMentionSubmitRightBoundary`.
 */
export function mentionTokenPresent(text: string, label: string): boolean {
  const token = inlineMentionToken(label);
  let from = 0;
  let start = text.indexOf(token, from);
  while (start !== -1) {
    if (
      isMentionBoundary(text, start) &&
      isMentionSubmitRightBoundary(text, start + token.length)
    ) {
      return true;
    }
    from = start + 1;
    start = text.indexOf(token, from);
  }
  return false;
}

export type InlineMentionKind =
  | 'plugin'
  | 'skill'
  | 'mcp'
  | 'file'
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
  const highlightUnknown = options.highlightUnknown ?? true;
  const known = normalizeEntities(entities);
  const parts: InlineMentionPart[] = [];
  let index = 0;
  let found = false;

  while (index < text.length) {
    const knownMatch = findNextKnownMention(text, known, index);
    const unknownMatch = highlightUnknown ? findNextUnknownMention(text, index) : null;
    const match = pickEarlierMention(knownMatch, unknownMatch);

    if (!match) {
      parts.push({ kind: 'text', text: text.slice(index) });
      break;
    }

    if (match.start > index) {
      parts.push({ kind: 'text', text: text.slice(index, match.start) });
    }
    parts.push({
      kind: 'mention',
      entity: match.entity,
      text: match.token,
    });
    found = true;
    index = match.start + match.token.length;
  }

  return found ? coalesceTextParts(parts) : null;
}

function normalizeEntities(entities: InlineMentionEntity[]): InlineMentionEntity[] {
  const seen = new Set<string>();
  return entities
    .map((entity) => {
      const token = entity.token ?? inlineMentionToken(entity.label);
      return { ...entity, token };
    })
    .filter((entity) => {
      if (!entity.token || entity.token === '@') return false;
      const key = `${entity.kind}:${entity.token}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.token?.length ?? 0) - (a.token?.length ?? 0));
}

function findNextKnownMention(
  text: string,
  entities: InlineMentionEntity[],
  from: number,
): MentionMatch | null {
  let best: MentionMatch | null = null;
  for (const entity of entities) {
    const token = entity.token;
    if (!token) continue;
    let start = text.indexOf(token, from);
    while (start !== -1 && !isMentionBoundary(text, start)) {
      start = text.indexOf(token, start + 1);
    }
    if (start === -1) continue;
    if (
      !best ||
      start < best.start ||
      (start === best.start && token.length > best.token.length)
    ) {
      best = { start, token, entity };
    }
  }
  return best;
}

function findNextUnknownMention(text: string, from: number): MentionMatch | null {
  const mentionPattern = /@[^\s@]+/g;
  mentionPattern.lastIndex = from;
  let match: RegExpExecArray | null;
  while ((match = mentionPattern.exec(text)) !== null) {
    const token = match[0];
    const start = match.index;
    if (!isMentionBoundary(text, start)) continue;
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
  return null;
}

function pickEarlierMention(
  known: MentionMatch | null,
  unknown: MentionMatch | null,
): MentionMatch | null {
  if (!known) return unknown;
  if (!unknown) return known;
  if (known.start < unknown.start) return known;
  if (unknown.start < known.start) return unknown;
  return known.token.length >= unknown.token.length ? known : unknown;
}

function isMentionBoundary(text: string, start: number): boolean {
  if (start === 0) return true;
  return /[\s([{"']/.test(text[start - 1] ?? '');
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

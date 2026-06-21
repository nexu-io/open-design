type EventSink = (event: { type: 'text_delta'; delta: string }) => void;

const ARTIFACT_OPEN_RE = /(?:<\s*\|?\s*DSML[\s,]+artifact\b[^>]*>|<\s*artifact\b[^>]*>)/i;
const DSML_ARTIFACT_CLOSE_RE = /(?:<\/artifact>|<\/\s*\|?\s*DSML\s*>|<\s*\|?\s*\/\s*DSML\s*\|?\s*>)/i;
const DSML_OPEN_CANONICAL = 'dsmlartifact';
const ARTIFACT_OPEN_CANONICAL = 'artifact';
const ARTIFACT_CLOSE_CANONICALS = ['artifact', 'dsml'];
const MAX_CANDIDATE_LENGTH = 512;

export interface ArtifactTextSuppressor {
  strip(text: string): string;
  flush(): string;
  isSuppressing(): boolean;
  hasPendingCandidate(): boolean;
}

export function createDsmlArtifactTextSuppressor(): ArtifactTextSuppressor {
  let suppressing = false;
  let candidate = '';

  function strip(text: string): string {
    const current = `${candidate}${text}`;
    candidate = '';

    if (suppressing) {
      const close = DSML_ARTIFACT_CLOSE_RE.exec(current);
      if (!close || close.index === undefined) {
        const closeCandidateStart = possibleArtifactCloseStart(current);
        if (closeCandidateStart !== -1) candidate = current.slice(closeCandidateStart);
        return '';
      }
      suppressing = false;
      const end = close.index + close[0].length;
      return strip(current.slice(end));
    }

    const open = ARTIFACT_OPEN_RE.exec(current);
    if (open && open.index !== undefined) {
      suppressing = true;
      const prefix = current.slice(0, open.index);
      const tail = current.slice(open.index + open[0].length);
      return `${prefix}${strip(tail)}`;
    }

    const candidateStart = possibleDsmlArtifactOpenStart(current);
    if (candidateStart === -1) return current;

    candidate = current.slice(candidateStart);
    return current.slice(0, candidateStart);
  }

  function flush(): string {
    const text = candidate;
    candidate = '';
    return suppressing ? '' : text;
  }

  function isSuppressing(): boolean {
    return suppressing;
  }

  function hasPendingCandidate(): boolean {
    return candidate.length > 0;
  }

  return { strip, flush, isSuppressing, hasPendingCandidate };
}

export function emitWithTextSuppressor(
  suppressor: ArtifactTextSuppressor,
  onEvent: EventSink,
  text: string,
): boolean {
  const delta = suppressor.strip(text);
  if (!delta) return false;
  onEvent({ type: 'text_delta', delta });
  return true;
}

function possibleDsmlArtifactOpenStart(text: string): number {
  const min = Math.max(0, text.length - MAX_CANDIDATE_LENGTH);
  let index = text.lastIndexOf('<');
  while (index >= min) {
    const tail = text.slice(index);
    if (isPossibleDsmlArtifactOpen(tail)) return index;
    if (index === 0) break;
    index = text.lastIndexOf('<', index - 1);
  }
  return -1;
}

function isPossibleDsmlArtifactOpen(text: string): boolean {
  if (!text.startsWith('<') || text.includes('>')) return false;
  const compact = text.toLowerCase().replace(/[<|,\s]/g, '');
  return compact.length === 0 ||
    DSML_OPEN_CANONICAL.startsWith(compact) ||
    compact.startsWith(DSML_OPEN_CANONICAL) ||
    ARTIFACT_OPEN_CANONICAL.startsWith(compact) ||
    compact.startsWith(ARTIFACT_OPEN_CANONICAL);
}

function possibleArtifactCloseStart(text: string): number {
  const min = Math.max(0, text.length - MAX_CANDIDATE_LENGTH);
  let index = text.lastIndexOf('<');
  while (index >= min) {
    const tail = text.slice(index);
    if (isPossibleArtifactClose(tail)) return index;
    if (index === 0) break;
    index = text.lastIndexOf('<', index - 1);
  }
  return -1;
}

function isPossibleArtifactClose(text: string): boolean {
  if (!text.startsWith('<') || text.includes('>')) return false;
  const compact = text.toLowerCase().replace(/[<|/\s]/g, '');
  return compact.length === 0 ||
    ARTIFACT_CLOSE_CANONICALS.some((canonical) =>
      canonical.startsWith(compact) || compact.startsWith(canonical),
    );
}

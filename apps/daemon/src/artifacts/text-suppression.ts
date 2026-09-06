type EventSink = (event: { type: 'text_delta'; delta: string }) => void;

const ARTIFACT_OPEN_RE = /(?:<\s*\|?\s*DSML[\s,]+artifact\b[^>]*>|<\s*artifact\b[^>]*>)/i;
const DSML_ARTIFACT_CLOSE_RE = /(?:<\/artifact>|<\/\s*\|?\s*DSML\s*>|<\s*\|?\s*\/\s*DSML\s*\|?\s*>)/i;
const DSML_OPEN_CANONICAL = 'dsmlartifact';
const ARTIFACT_OPEN_CANONICAL = 'artifact';
const ARTIFACT_CLOSE_CANONICALS = ['artifact', 'dsml'];
const TOOL_CALL_OPEN_RE = /(?:<\s*tool_call\b[^>]*>|<\s*edit\s*>)/i;
const TOOL_CALL_CLOSE_RE = /(?:<\/\s*tool_call\s*>|<\/\s*edit\s*>)/i;
const TOOL_CALL_OPEN_CANONICALS = ['toolcall', 'edit'];
const TOOL_CALL_CLOSE_CANONICALS = ['toolcall', 'edit'];
const DSML_TOOL_PROTOCOL_TAIL_CANONICAL =
  '</||dsml||parameter></||dsml||invoke></||dsml||tool_calls>';
const DSML_TOOL_PROTOCOL_TAIL_RE =
  /<\/\s*(?:[|｜]\s*){2}DSML\s*(?:[|｜]\s*){2}parameter\s*>\s*<\/\s*(?:[|｜]\s*){2}DSML\s*(?:[|｜]\s*){2}invoke\s*>\s*<\/\s*(?:[|｜]\s*){2}DSML\s*(?:[|｜]\s*){2}tool_calls\s*>\s*$/i;
const MAX_CANDIDATE_LENGTH = 512;

export interface ArtifactTextSuppressor {
  strip(text: string): string;
  flush(): string;
  isSuppressing(): boolean;
  hasPendingCandidate(): boolean;
  stats(): ArtifactTextSuppressorStats;
}

export interface ArtifactTextSuppressorStats {
  suppressedChars: number;
  suppressedChunks: number;
  openedBlocks: number;
  closedBlocks: number;
  pendingCandidateChars: number;
  suppressing: boolean;
}

export function createDsmlArtifactTextSuppressor(): ArtifactTextSuppressor {
  return createTaggedTextSuppressor({
    openRe: ARTIFACT_OPEN_RE,
    closeRe: DSML_ARTIFACT_CLOSE_RE,
    isPossibleOpen: isPossibleDsmlArtifactOpen,
    isPossibleClose: isPossibleArtifactClose,
  });
}

export function createToolCallTextSuppressor(): ArtifactTextSuppressor {
  const toolBlockSuppressor = createTaggedTextSuppressor({
    openRe: TOOL_CALL_OPEN_RE,
    closeRe: TOOL_CALL_CLOSE_RE,
    isPossibleOpen: isPossibleToolCallOpen,
    isPossibleClose: isPossibleToolCallClose,
  });
  const protocolTailSuppressor = createDsmlToolProtocolTailSuppressor();
  return chainTextSuppressors(toolBlockSuppressor, protocolTailSuppressor);
}

/**
 * Removes the proprietary DSML closing sequence only when it is the final
 * suffix of otherwise visible text. The ordered three-tag requirement keeps
 * literal XML/Markdown examples intact while repairing already-persisted AMR
 * output that predates the streaming suppressor.
 */
export function scrubDsmlToolProtocolTail(text: string): string {
  return text.replace(DSML_TOOL_PROTOCOL_TAIL_RE, '');
}

function createDsmlToolProtocolTailSuppressor(): ArtifactTextSuppressor {
  let candidate = '';
  let suppressedChars = 0;
  let suppressedChunks = 0;

  function strip(text: string): string {
    const current = `${candidate}${text}`;
    candidate = '';
    const candidateStart = possibleDsmlToolProtocolTailStart(current);
    if (candidateStart === -1) return current;
    candidate = current.slice(candidateStart);
    return current.slice(0, candidateStart);
  }

  function flush(): string {
    const text = candidate;
    candidate = '';
    if (!isCompleteDsmlToolProtocolTail(text)) return text;
    suppressedChars += text.length;
    suppressedChunks += 1;
    return '';
  }

  function isSuppressing(): boolean {
    return false;
  }

  function hasPendingCandidate(): boolean {
    return candidate.length > 0;
  }

  function stats(): ArtifactTextSuppressorStats {
    return {
      suppressedChars,
      suppressedChunks,
      openedBlocks: 0,
      closedBlocks: 0,
      pendingCandidateChars: candidate.length,
      suppressing: false,
    };
  }

  return { strip, flush, isSuppressing, hasPendingCandidate, stats };
}

function chainTextSuppressors(
  first: ArtifactTextSuppressor,
  second: ArtifactTextSuppressor,
): ArtifactTextSuppressor {
  return {
    strip(text) {
      return second.strip(first.strip(text));
    },
    flush() {
      const firstTail = first.flush();
      const visibleFirstTail = firstTail ? second.strip(firstTail) : '';
      return `${visibleFirstTail}${second.flush()}`;
    },
    isSuppressing() {
      return first.isSuppressing() || second.isSuppressing();
    },
    hasPendingCandidate() {
      return first.hasPendingCandidate() || second.hasPendingCandidate();
    },
    stats() {
      const firstStats = first.stats();
      const secondStats = second.stats();
      return {
        suppressedChars: firstStats.suppressedChars + secondStats.suppressedChars,
        suppressedChunks: firstStats.suppressedChunks + secondStats.suppressedChunks,
        openedBlocks: firstStats.openedBlocks + secondStats.openedBlocks,
        closedBlocks: firstStats.closedBlocks + secondStats.closedBlocks,
        pendingCandidateChars:
          firstStats.pendingCandidateChars + secondStats.pendingCandidateChars,
        suppressing: firstStats.suppressing || secondStats.suppressing,
      };
    },
  };
}

function createTaggedTextSuppressor(args: {
  openRe: RegExp;
  closeRe: RegExp;
  isPossibleOpen: (text: string) => boolean;
  isPossibleClose: (text: string) => boolean;
}): ArtifactTextSuppressor {
  let suppressing = false;
  let candidate = '';
  let suppressedChars = 0;
  let suppressedChunks = 0;
  let openedBlocks = 0;
  let closedBlocks = 0;

  function noteSuppressed(text: string): void {
    if (text.length <= 0) return;
    suppressedChars += text.length;
    suppressedChunks += 1;
  }

  function strip(text: string): string {
    const current = `${candidate}${text}`;
    candidate = '';

    if (suppressing) {
      const close = args.closeRe.exec(current);
      if (!close || close.index === undefined) {
        const closeCandidateStart = possibleTagStart(current, args.isPossibleClose);
        if (closeCandidateStart !== -1) {
          candidate = current.slice(closeCandidateStart);
          noteSuppressed(current.slice(0, closeCandidateStart));
        } else {
          noteSuppressed(current);
        }
        return '';
      }
      suppressing = false;
      const end = close.index + close[0].length;
      closedBlocks += 1;
      noteSuppressed(current.slice(0, end));
      return strip(current.slice(end));
    }

    const open = args.openRe.exec(current);
    if (open && open.index !== undefined) {
      suppressing = true;
      openedBlocks += 1;
      const prefix = current.slice(0, open.index);
      const tail = current.slice(open.index + open[0].length);
      noteSuppressed(open[0]);
      return `${prefix}${strip(tail)}`;
    }

    const candidateStart = possibleTagStart(current, args.isPossibleOpen);
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

  function stats(): ArtifactTextSuppressorStats {
    return {
      suppressedChars,
      suppressedChunks,
      openedBlocks,
      closedBlocks,
      pendingCandidateChars: candidate.length,
      suppressing,
    };
  }

  return { strip, flush, isSuppressing, hasPendingCandidate, stats };
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
  return possibleTagStart(text, isPossibleDsmlArtifactOpen);
}

function possibleTagStart(text: string, predicate: (tail: string) => boolean): number {
  const min = Math.max(0, text.length - MAX_CANDIDATE_LENGTH);
  let index = text.lastIndexOf('<');
  while (index >= min) {
    const tail = text.slice(index);
    if (predicate(tail)) return index;
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
  return possibleTagStart(text, isPossibleArtifactClose);
}

function isPossibleArtifactClose(text: string): boolean {
  if (!text.startsWith('<') || text.includes('>')) return false;
  const compact = text.toLowerCase().replace(/[<|/\s]/g, '');
  return compact.length === 0 ||
    ARTIFACT_CLOSE_CANONICALS.some((canonical) =>
      canonical.startsWith(compact) || compact.startsWith(canonical),
    );
}

function isPossibleToolCallOpen(text: string): boolean {
  if (!text.startsWith('<') || text.includes('>')) return false;
  const compact = text.toLowerCase().replace(/[<|,\s_-]/g, '');
  return compact.length === 0 ||
    TOOL_CALL_OPEN_CANONICALS.some((canonical) =>
      canonical.startsWith(compact) || compact.startsWith(canonical),
    );
}

function isPossibleToolCallClose(text: string): boolean {
  if (!text.startsWith('<') || text.includes('>')) return false;
  const compact = text.toLowerCase().replace(/[<|/\s_-]/g, '');
  return compact.length === 0 ||
    TOOL_CALL_CLOSE_CANONICALS.some((canonical) =>
      canonical.startsWith(compact) || compact.startsWith(canonical),
    );
}

function possibleDsmlToolProtocolTailStart(text: string): number {
  const min = Math.max(0, text.length - MAX_CANDIDATE_LENGTH);
  let index = text.lastIndexOf('<');
  while (index >= min) {
    if (isPossibleDsmlToolProtocolTail(text.slice(index))) return index;
    if (index === 0) break;
    index = text.lastIndexOf('<', index - 1);
  }
  return -1;
}

function isPossibleDsmlToolProtocolTail(text: string): boolean {
  const compact = compactDsmlToolProtocolTail(text);
  return DSML_TOOL_PROTOCOL_TAIL_CANONICAL.startsWith(compact);
}

function isCompleteDsmlToolProtocolTail(text: string): boolean {
  return compactDsmlToolProtocolTail(text) === DSML_TOOL_PROTOCOL_TAIL_CANONICAL;
}

function compactDsmlToolProtocolTail(text: string): string {
  return text
    .toLowerCase()
    .replace(/｜/g, '|')
    .replace(/\s/g, '');
}

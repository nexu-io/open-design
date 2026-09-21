/**
 * Markdown-context helpers shared by the streaming artifact parser and the
 * post-stream `<artifact>` stripper. The implementation lives in
 * `@open-design/contracts` so the daemon's transcript builder reads a buffer
 * exactly the way the chat renderer does; this module only re-exports it.
 */
export {
  FENCE_OPEN_RE,
  FENCE_CLOSE_RE,
  INLINE_CODE_RE,
  isStandaloneMarkdownLine,
  isRealArtifactOpenAt,
  computeSkipRanges,
  rangeContains,
  type Range,
} from '@open-design/contracts';

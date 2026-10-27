// Compatibility path for the artifact parser and display cleanup.
// Markdown ownership is shared with daemon transcript summaries.
export {
  CHAT_PROTOCOL_FENCE_OPEN_RE as FENCE_OPEN_RE,
  CHAT_PROTOCOL_FENCE_CLOSE_RE as FENCE_CLOSE_RE,
  INLINE_CODE_RE,
  isChatProtocolStandaloneLine as isStandaloneMarkdownLine,
  isRealArtifactOpenAt,
  computeSkipRanges,
  rangeContains,
  type ChatProtocolRange as Range,
} from '@open-design/contracts';

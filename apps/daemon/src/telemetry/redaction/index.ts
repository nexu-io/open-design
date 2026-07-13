/** @module redaction/index
 * Redaction layer: scrubs local filesystem paths and secrets out of prompt
 * content before hashing or capture.
 * Exposes the public `redactLocalPaths` plus the domain-internal `redactPromptText` and `sanitizeSectionContent` consumed by the builder subdir.
 */
export {
  redactLocalPaths,
  redactPromptText,
  sanitizeSectionContent,
} from './redaction.js';

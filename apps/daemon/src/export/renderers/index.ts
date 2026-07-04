/** @module export/renderers
 * Artifact renderers: turn a project's stored content into an export artifact.
 * deck.ts (deck slides -> PPTX/PDF), pdf.ts (desktop PDF/artifact render inputs),
 * transcript.ts (conversation history -> JSONL transcript). No sibling imports; may use core.
 */
export type { BuildDeckRenderInputOptions, DeckRenderRequest, SlideImage } from './deck.js';
export {
  buildDeckRenderInput,
  readSlideFiles,
  decodeSlideDataUrls,
  buildScreenshotPptx,
  buildScreenshotPdf,
} from './deck.js';
export type { BuildDesktopPdfExportInputOptions, BuildDesktopArtifactExportInputOptions } from './pdf.js';
export { buildDesktopPdfExportInput, buildDesktopArtifactExportInput } from './pdf.js';
export type { TranscriptExportOptions, TranscriptExportResult } from './transcript.js';
export { TranscriptExportLockedError, exportProjectTranscript } from './transcript.js';

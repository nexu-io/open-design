/** @module builder/index
 * Prompt-stack assembly layer: builds the canonical telemetry payload from raw
 * prompt sections and derives its content-free, structured, and flat projections.
 * Reaches the redaction sibling barrel for content sanitization along the single declared allowedEdge (builder → redaction).
 */
export {
  buildPromptStackFlatMetadata,
  buildPromptStackTelemetry,
  promptStackWithoutContent,
  structuredPromptStackInput,
} from './builder.js';

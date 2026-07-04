/** @module telemetry
 * Main public API for the telemetry module.
 * Re-exports the shared prompt-stack types and constants, the telemetry-environment resolver, the redaction primitive, and the prompt-stack builder + projections from domain subdirectories.
 * This root barrel is the module's public contract: external runtime code imports only from here, never a subdirectory file.
 */
export type {
  PromptStackTelemetry,
  PromptTelemetryInputSection,
  PromptTelemetrySection,
  PromptTelemetrySectionKind,
  StructuredPromptStackInput,
} from './core/index.js';
export {
  PROMPT_STACK_PATH_MARKER,
  PROMPT_STACK_REDACTION_VERSION,
} from './core/index.js';
export { readTelemetryEnvironment } from './core/index.js';

export { redactLocalPaths } from './redaction/index.js';

export {
  buildPromptStackFlatMetadata,
  buildPromptStackTelemetry,
  promptStackWithoutContent,
  structuredPromptStackInput,
} from './builder/index.js';

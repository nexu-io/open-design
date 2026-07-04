/** @module core/index
 * Foundational layer: shared prompt-stack telemetry types, redaction/version
 * constants, and the telemetry-environment resolver.
 * This is the kernel every other subdirectory may depend on directly; core itself never imports from a sibling subdirectory.
 */
export type {
  PromptStackTelemetry,
  PromptTelemetryInputSection,
  PromptTelemetrySection,
  PromptTelemetrySectionKind,
  StructuredPromptStackInput,
} from './types.js';
export {
  PROMPT_STACK_PATH_MARKER,
  PROMPT_STACK_REDACTION_VERSION,
} from './constants.js';
export { readTelemetryEnvironment } from './environment.js';

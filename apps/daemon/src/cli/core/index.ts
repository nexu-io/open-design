// @ts-nocheck
/** @module cli/core
 * Foundation kernel layer: shared flag parsing (parseFlags, positionalArgs,
 * coerceCliValue), daemon-url resolution (cliDaemonUrl, cliDaemonBaseUrl,
 * libraryDaemonUrl), structured errors and exit codes, long-form input intake
 * (readMemoryBodyFromFlags, readPromptFromFlags), and run-event streaming
 * (streamRunEvents). Every sibling domain may import core; core imports no
 * sibling subdirectory. This layer is the embeddability contract that keeps
 * heredoc/pipe-driven CLI callers and agent scripts clean.
 */
export * from './daemon-url.js';
export * from './errors.js';
export * from './flags.js';
export * from './io.js';
export * from './run-events.js';

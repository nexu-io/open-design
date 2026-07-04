/**
 * @module agents/presentation
 *
 * How a running agent surfaces to the user: the human-readable agent label and
 * the stderr visibility filter that decides which subprocess stderr lines are
 * shown versus suppressed.
 */
export * from './user-facing-agent-label.js';
export * from './amr-stderr-filter.js';

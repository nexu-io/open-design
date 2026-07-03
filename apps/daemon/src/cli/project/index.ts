// @ts-nocheck
/** @module cli/project
 * Barrel for the project domain: re-exports project, run, files, chat, shell, and diff CLI handlers to the root dispatcher.
 * Project commands are the headless face of the web workspace: import, chat, start agent runs, inspect artifacts, and diff files.
 */
export * from './chat.js';
export * from './diff.js';
export * from './files.js';
export * from './project.js';
export * from './run.js';
export * from './shell.js';

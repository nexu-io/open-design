/**
 * @module browser
 *
 * Barrel for daemon browser bridges: browser-open (launch a URL in the OS
 * browser) and browser-use-diagnostics (in-app browser-use automation probe /
 * unavailable-prompt rendering). The native OS folder-picker dialog
 * (native-folder-dialog) is intentionally NOT here — it is a desktop
 * file-chooser bridge, not a browser one.
 */
export * from './browser-open.js';
export * from './browser-use-diagnostics.js';

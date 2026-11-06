// Hand-off surface: the daemon enumerates local apps the user can open
// their design project folder in (Cursor, Zed, VS Code, Finder, etc.),
// then spawns the chosen app with the project's resolvedDir as its
// argument. The detection model is borrowed from paseo's
// `editor-targets.ts` — a declarative catalogue filtered by what's
// actually on $PATH at request time. The daemon never opens binary
// paths the user did not pick from this list.

export type HostEditorId =
  | 'cursor'
  | 'vscode'
  | 'windsurf'
  | 'zed'
  | 'qoder'
  | 'antigravity'
  | 'webstorm'
  | 'idea'
  | 'xcode'
  | 'finder'
  | 'explorer'
  | 'file-manager'
  | 'terminal'
  | 'warp';

export interface HostEditor {
  id: HostEditorId;
  label: string;
  // Optional bundled icon name from the web's Icon registry — purely
  // presentational, daemon does not consume.
  icon?: string;
  // The CLI shim or `open -a` argument the daemon actually invokes.
  // Omitted from API responses by default — exposed only for diagnostics.
  command?: string;
  // True when the daemon successfully probed the executable on $PATH
  // (or on macOS, found the bundle via `mdfind`). Clients hide entries
  // where `available === false` unless explicitly showing the full list.
  available: boolean;
  // Where the executable was resolved from — for debugging.
  resolvedPath?: string;
  // Platforms this entry can ever match. Calculated by the daemon at
  // request time; included so the UI can branch by host (e.g. show
  // Finder only on macOS).
  platforms?: Array<'darwin' | 'win32' | 'linux'>;
}

export interface HostEditorsResponse {
  editors: HostEditor[];
  platform: 'darwin' | 'win32' | 'linux' | 'unknown';
}

export interface OpenProjectInEditorRequest {
  editorId: HostEditorId;
}

export interface OpenProjectInEditorResponse {
  ok: true;
  editorId: HostEditorId;
  path: string;
}

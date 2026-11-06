/**
 * Interactive Terminal DTOs. The daemon spawns a PTY (node-pty) rooted at the
 * project working directory and reuses the existing SSE event-stream infra to
 * push output down to the client; keystrokes and resizes flow back up over
 * plain POST endpoints. No WebSocket — the transport mirrors the chat-run
 * lifecycle in `apps/daemon/src/runs.ts`.
 *
 * Both the web `<TerminalViewer>` and `od shell` drive the same
 * `/api/projects/:id/terminals` surface, so this contract is the single source
 * of truth for the session shape and the SSE event union.
 */

export type TerminalSessionStatus = 'running' | 'exited';

export interface TerminalSession {
  id: string;
  projectId: string | null;
  /** Absolute working directory the PTY was spawned in (the project dir). */
  cwd: string;
  /** The shell binary the PTY is running (resolved from request/SHELL/OS). */
  shell: string;
  cols: number;
  rows: number;
  status: TerminalSessionStatus;
  createdAt: number;
  updatedAt: number;
  /** Exit code once the shell process has terminated; null while running. */
  exitCode: number | null;
  /** Terminating signal name (e.g. `SIGTERM`) when the PTY was killed. */
  signal: string | null;
}

export interface CreateTerminalRequest {
  /** Initial column count for the PTY; defaults to 80. */
  cols?: number;
  /** Initial row count for the PTY; defaults to 24. */
  rows?: number;
  /**
   * Override the shell binary. When omitted the daemon resolves SHELL on
   * posix (falling back to zsh/bash) and ComSpec/powershell on win32.
   */
  shell?: string;
}

export interface CreateTerminalResponse {
  terminal: TerminalSession;
}

export interface TerminalSessionResponse {
  terminal: TerminalSession;
}

export interface TerminalsListResponse {
  terminals: TerminalSession[];
}

export interface TerminalStdinRequest {
  /** Raw bytes to write into the PTY's stdin (keystrokes, pasted text). */
  data: string;
}

export interface TerminalResizeRequest {
  cols: number;
  rows: number;
}

/**
 * SSE event union emitted by `GET /api/projects/:id/terminals/:tid/stream`.
 * `data` carries a chunk of raw PTY output; `exit` is the single terminal
 * event marking the shell process exit. Reattaching clients replay buffered
 * `data` events after `Last-Event-ID`, mirroring chat-run event replay.
 */
export type TerminalSseEvent =
  | { event: 'data'; data: TerminalDataEvent }
  | { event: 'exit'; data: TerminalExitEvent };

export interface TerminalDataEvent {
  /** Raw PTY output chunk. */
  data: string;
}

export interface TerminalExitEvent {
  code: number | null;
  signal: string | null;
}

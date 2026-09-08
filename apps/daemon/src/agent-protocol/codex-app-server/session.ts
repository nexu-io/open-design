/** @module agent-protocol/codex-app-server/session
 *
 * Drives one codex turn over the `codex app-server` stdio JSON-RPC transport.
 *
 * Shape of a turn, from spawn to close:
 *
 *   initialize            -> capabilities handshake
 *   initialized           -> (notification)
 *   thread/start | thread/resume
 *   turn/start            -> the user prompt travels here, not on stdin
 *   …notifications…       -> normalized and handed to the agent-event channel
 *   turn/completed        -> turn is over; the daemon closes the child
 *
 * The daemon still spawns one child per turn and resumes by thread id, so this
 * is a transport swap, not an architecture change: `getDurableSessionId()`
 * returns the same capture-style handle the `exec --json` path reads off
 * `thread.started`.
 *
 * Three defects the ACP transport carries are avoided here BY CONSTRUCTION,
 * and each has a named test:
 *
 *   1. Langfuse's `stdin-write` / `agent-call` spans exist only when the run
 *      records prompt-send marks. ACP never records them because the marks are
 *      wired to the stdin branch, so its tool spans hang off `agent-run`. This
 *      module calls `onPromptSendStart` / `onPromptSendEnd` around the
 *      `turn/start` write, which is this transport's real prompt boundary.
 *   2. ACP files per-step usage under `diagnostic`, where the analytics scan
 *      cannot reach it. Usage here is a plain `usage` agent event — the exact
 *      channel `exec --json` uses.
 *   3. ACP raises `fatal_rpc_error` instead of the `stream_error` failure
 *      detail the Langfuse triage practice queries on. Every failure here,
 *      including a JSON-RPC error response, is emitted as an `error` AGENT
 *      event so it flows through `sendAgentEvent`'s classifier.
 *
 * On `experimentalApi`: NOT enabled. Measured on codex-cli 0.149.1 across four
 * configurations × two repetitions of one fixed prompt, `item/agentMessage/
 * delta` arrived on every run regardless of the flag (52/54 vs 45/42 frames),
 * and `item/reasoning/summaryTextDelta` was gated purely by the reasoning
 * summary setting, not by the flag. The capability's own doc comment is "opt
 * into receiving experimental API methods and fields" — declaring it would buy
 * nothing measurable and widen the surface most likely to change.
 */
import { createCodexAppServerNormalizer } from './normalize.js';

type JsonObject = Record<string, unknown>;

export type CodexSandboxMode = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface CodexAppServerSessionOptions {
  child: {
    stdout: { on(event: 'data', listener: (chunk: unknown) => void): unknown };
    stdin: {
      write(chunk: string, cb?: (err?: Error | null) => void): unknown;
      end(): unknown;
      destroyed?: boolean;
    } | null;
    killed?: boolean;
  };
  prompt: string;
  cwd: string;
  model?: string | null;
  reasoning?: string | null;
  serviceTier?: string | null;
  sandboxMode: CodexSandboxMode;
  resumeSessionId?: string | null;
  imagePaths?: string[];
  clientVersion?: string;
  onAgentEvent: (event: JsonObject) => void;
  onCliReady?: () => void;
  onSessionReady?: () => void;
  onPromptSendStart?: () => void;
  onPromptSendEnd?: () => void;
  onTurnComplete?: () => void;
}

export interface CodexAppServerSession {
  abort(): void;
  /**
   * True once codex reported a turn that ended without failing. The run's close
   * classifier reads this so a shutdown that produces no exit code (a signalled
   * kill during teardown) is still recorded as a success.
   */
  completedSuccessfully(): boolean;
  getDurableSessionId(): string | null;
  getLastSessionPath(): string | null;
  stats(): { unknownNotifications: number; unknownItems: number };
}

/**
 * The `exec` path forces `--ask-for-approval never` implicitly (that is what
 * non-interactive exec means). Say it out loud on the thread so the app-server
 * transport cannot be more permissive than the transport it replaces.
 */
const APPROVAL_POLICY_NEVER = 'never';

/**
 * Codex's embedded model catalog ships `default_reasoning_summary = "none"`,
 * so without this the turn reasons but reports nothing. The `exec` path sets
 * the same value through `-c model_reasoning_summary="detailed"`; on this
 * transport it is a typed per-turn parameter.
 */
const REASONING_SUMMARY = 'detailed';

/** `default` is the daemon's synthetic "user did not choose" sentinel. */
function chosen(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'default') return null;
  return trimmed;
}

function isRecord(value: unknown): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function attachCodexAppServerSession(
  opts: CodexAppServerSessionOptions,
): CodexAppServerSession {
  const {
    child,
    prompt,
    cwd,
    sandboxMode,
    resumeSessionId,
    onAgentEvent,
    onCliReady,
    onSessionReady,
    onPromptSendStart,
    onPromptSendEnd,
    onTurnComplete,
  } = opts;

  const normalizer = createCodexAppServerNormalizer(onAgentEvent);
  const pending = new Map<number, (frame: JsonObject) => void>();
  let nextId = 1;
  let buffer = '';
  let threadId: string | null = null;
  let rolloutPath: string | null = null;
  let cliReadySeen = false;
  let promptSent = false;
  let aborted = false;
  let fatalReported = false;
  let turnEnded = false;
  let turnSucceeded = false;
  let handleReported = false;

  function write(frame: JsonObject, onWritten?: () => void): void {
    const stdin = child.stdin;
    if (!stdin || stdin.destroyed) return;
    try {
      stdin.write(`${JSON.stringify(frame)}\n`, () => onWritten?.());
    } catch {
      // A child that exited before reading stdin surfaces through the daemon's
      // exit/close handlers; a throw here would take the daemon with it.
    }
  }

  function request(
    method: string,
    params: JsonObject,
    onResult: (result: JsonObject) => void,
    onWritten?: () => void,
  ): void {
    const id = nextId++;
    pending.set(id, (frame) => {
      if (frame.error !== undefined) {
        reportFatal(rpcErrorText(method, frame.error));
        return;
      }
      onResult(isRecord(frame.result) ? frame.result : {});
    });
    write({ jsonrpc: '2.0', id, method, params }, onWritten);
  }

  function notify(method: string, params: JsonObject): void {
    write({ jsonrpc: '2.0', method, params });
  }

  function rpcErrorText(method: string, error: unknown): string {
    const detail = isRecord(error) ? error : {};
    const message =
      typeof detail.message === 'string' && detail.message
        ? detail.message
        : `json-rpc error from ${method}`;
    const code = typeof detail.code === 'number' ? ` (${detail.code})` : '';
    return `codex app-server ${method}${code}: ${message}`;
  }

  /**
   * Surface a transport failure on the AGENT event channel so it reaches
   * `sendAgentEvent` and becomes a `stream_error` failure detail, rather than a
   * transport-private error shape no triage query knows about.
   */
  function reportFatal(message: string): void {
    if (fatalReported || aborted) return;
    fatalReported = true;
    onAgentEvent({ type: 'error', message });
  }

  function startTurn(): void {
    if (!threadId || promptSent) return;
    promptSent = true;
    const params: JsonObject = {
      threadId,
      input: [
        { type: 'text', text: prompt, text_elements: [] },
        ...(opts.imagePaths ?? []).map((path) => ({ type: 'localImage', path })),
      ],
      summary: REASONING_SUMMARY,
    };
    const model = chosen(opts.model);
    if (model) params.model = model;
    const effort = chosen(opts.reasoning);
    if (effort) params.effort = effort;
    const serviceTier = chosen(opts.serviceTier);
    if (serviceTier) params.serviceTier = serviceTier;
    // The prompt-send boundary for this transport. Marked here, not around a
    // stdin write that never happens, so the Langfuse `stdin-write` and
    // `agent-call` spans exist on app-server runs too.
    onPromptSendStart?.();
    request(
      'turn/start',
      params,
      () => {
        // `turn/start` resolves when the turn is accepted; completion arrives
        // as the `turn/completed` notification.
      },
      () => onPromptSendEnd?.(),
    );
  }

  function openThread(): void {
    const shared: JsonObject = {
      cwd,
      sandbox: sandboxMode,
      approvalPolicy: APPROVAL_POLICY_NEVER,
    };
    const onThread = (result: JsonObject) => {
      const thread = isRecord(result.thread) ? result.thread : null;
      const id = typeof thread?.id === 'string' ? thread.id : null;
      if (id) {
        threadId = id;
        const path = typeof thread?.path === 'string' ? thread.path : '';
        if (path) rolloutPath = path;
        // `thread/start` is followed by a `thread/started` notification, but
        // `thread/resume` answers only with this result. Capture-style resume
        // persists whatever handle the run reported THIS turn, so a resumed
        // turn that reported none would let the stored handle go stale and the
        // next turn would start a cold thread.
        reportSessionHandle(id);
        onSessionReady?.();
        startTurn();
        return;
      }
      reportFatal('codex app-server returned no thread id');
    };
    if (resumeSessionId) {
      request('thread/resume', { ...shared, threadId: resumeSessionId }, onThread);
      return;
    }
    request('thread/start', shared, onThread);
  }

  /** Emit the thread id on the session-capture channel, at most once. */
  function reportSessionHandle(id: string): void {
    if (handleReported || !id) return;
    handleReported = true;
    onAgentEvent({ type: 'status', label: 'initializing', sessionId: id });
  }

  function handleFrame(frame: JsonObject): void {
    if (!cliReadySeen) {
      cliReadySeen = true;
      onCliReady?.();
    }
    const id = typeof frame.id === 'number' ? frame.id : null;
    if (id !== null && typeof frame.method !== 'string') {
      const resolver = pending.get(id);
      pending.delete(id);
      resolver?.(frame);
      return;
    }
    if (typeof frame.method !== 'string') return;
    if (id !== null) {
      // A server-to-client REQUEST. Nothing in this build answers one — the
      // thread runs with approvals disabled, so MCP elicitation and approval
      // prompts should never fire. Refusing explicitly keeps a future codex
      // that does send one from blocking the turn forever waiting on a reply.
      write({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `unsupported request: ${frame.method}` },
      });
      return;
    }
    if (frame.method === 'thread/started') {
      const params = isRecord(frame.params) ? frame.params : {};
      const thread = isRecord(params.thread) ? params.thread : null;
      const path = typeof thread?.path === 'string' ? thread.path : '';
      if (path) rolloutPath = path;
      const startedId = typeof thread?.id === 'string' ? thread.id : '';
      if (startedId && !threadId) threadId = startedId;
      reportSessionHandle(startedId);
      return;
    }
    normalizer.handleNotification(frame.method, frame.params);
    if (frame.method === 'turn/completed') {
      const params = isRecord(frame.params) ? frame.params : {};
      const turn = isRecord(params.turn) ? params.turn : null;
      turnSucceeded = turn?.status !== 'failed';
      onTurnComplete?.();
      shutdown();
    }
  }

  /**
   * End the turn by closing the child's stdin.
   *
   * This is the one lifecycle difference between the two transports, and it is
   * not optional: `codex exec` runs a turn and exits, while `codex app-server`
   * is a server that keeps listening. Without this the child never exits, the
   * daemon's close handler never fires, and the run sits in `running` forever
   * with its answer already delivered. Measured on codex-cli 0.149.1, stdin EOF
   * shuts the server down with exit code 0 in roughly 250ms — a normal clean
   * exit, so nothing downstream needs a special case for it.
   */
  function shutdown(): void {
    if (turnEnded) return;
    turnEnded = true;
    const stdin = child.stdin;
    if (!stdin || stdin.destroyed) return;
    try {
      stdin.end();
    } catch {
      // The child already went away; its exit handler owns the run from here.
    }
  }

  child.stdout.on('data', (chunk) => {
    buffer += String(chunk);
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let frame: unknown;
      try {
        frame = JSON.parse(line);
      } catch {
        // codex writes structured frames only; a non-JSON line is noise from a
        // wrapper script, not a protocol failure. Dropping it keeps a chatty
        // shim from failing an otherwise healthy run.
        continue;
      }
      if (isRecord(frame)) handleFrame(frame);
    }
  });

  request(
    'initialize',
    {
      clientInfo: {
        name: 'open-design',
        title: 'Open Design',
        version: opts.clientVersion ?? '0.0.0',
      },
      capabilities: { experimentalApi: false, requestAttestation: false },
    },
    () => {
      notify('initialized', {});
      openThread();
    },
  );

  return {
    abort(): void {
      if (aborted) return;
      aborted = true;
      // Cancel the turn rather than only signalling the process: codex keeps
      // the thread alive and reports `turn/completed` with status
      // `interrupted`, so a later resume still finds it.
      if (threadId) write({ jsonrpc: '2.0', id: nextId++, method: 'turn/interrupt', params: { threadId } });
    },
    completedSuccessfully(): boolean {
      return turnEnded && turnSucceeded && !fatalReported;
    },
    getDurableSessionId(): string | null {
      return threadId;
    },
    getLastSessionPath(): string | null {
      return rolloutPath;
    },
    stats() {
      return normalizer.stats();
    },
  };
}

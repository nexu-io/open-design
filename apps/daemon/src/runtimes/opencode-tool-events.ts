type Event = Record<string, unknown>;

/** Per-run state for the optional local plugin; native final events stay authoritative. */
export class OpenCodeToolEvents {
  private sessionId: string | null = null;
  private readonly pending = new Map<string, { name: string; input: Event; startedAt: number }>();
  private readonly settled = new Set<string>();
  private closed = false;
  private readonly beforeSession = new Map<string, Event>();

  startSession(id: string | null, emit: (event: Event) => void): void {
    if (!id || this.closed) return;
    this.sessionId = id;
    for (const frame of this.beforeSession.values()) this.handle(frame, emit);
    this.beforeSession.clear();
  }

  handle(frame: Event, emit: (event: Event) => void): boolean {
    if (frame.type !== 'od_opencode_tool') return false;
    if (this.closed || frame.version !== 1 || typeof frame.sessionID !== 'string'
      || typeof frame.callID !== 'string' || !frame.callID || typeof frame.tool !== 'string' || !frame.tool) return true;
    // The plugin callback can beat run.ts's asynchronous step_start writer.
    // Buffer that small window; only the native root session may reach the UI.
    if (!this.sessionId) {
      if (this.beforeSession.size < 128) this.beforeSession.set(`${frame.sessionID}:${frame.callID}`, frame);
      return true;
    }
    if (frame.sessionID !== this.sessionId) return true;
    const id = frame.callID;
    if (this.settled.has(id)) return true;
    const input: Event = {};
    if (typeof frame.path === 'string' && frame.path.length > 0 && frame.path.length < 8192) input.file_path = frame.path;
    const previous = this.pending.get(id);
    if (previous && previous.name === frame.tool && previous.input.file_path === input.file_path) return true;
    const state = { name: frame.tool, input, startedAt: previous?.startedAt ?? Date.now() };
    this.pending.set(id, state);
    emit({ type: 'tool_in_flight', id, ...state });
    return true;
  }

  complete(id: string): void { this.pending.delete(id); this.settled.add(id); }

  flush(emit: (event: Event) => void): void {
    this.closed = true;
    this.beforeSession.clear();
    for (const [id, state] of this.pending) {
      emit({ type: 'tool_use', id, ...state });
      emit({ type: 'tool_result', toolUseId: id, content: 'Tool stream ended before completion was reported.', isError: true });
      this.settled.add(id);
    }
    this.pending.clear();
  }
}

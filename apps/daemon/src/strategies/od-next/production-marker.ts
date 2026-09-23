/** A control line from the assistant, never a substring of quoted prose or a tool result. */
export class ProductionMarkerStream {
  private pending = '';
  private fence: string | null = null;
  private passthroughLine = false;
  private discardingLine = false;
  private matches = 0;
  private lastWasMarker = false;
  private lineTrusted = true;

  constructor(private readonly key: string) {}

  push(chunk: string, finishing = false, assistantText = true): string {
    this.lineTrusted &&= assistantText;
    this.pending += chunk;
    let output = '';
    let end: number;
    while ((end = this.pending.indexOf('\n')) >= 0) {
      const line = this.pending.slice(0, end + 1);
      this.pending = this.pending.slice(end + 1);
      output += this.line(line);
      this.lineTrusted = assistantText;
    }
    if (finishing) {
      output += this.line(this.pending);
      this.pending = '';
    } else if (this.pending.length > 4096) {
      // Bound buffering even for a malformed, unterminated control line.
      const reserved = /^ {0,3}<od-production-ready\b/i.test(this.pending);
      // A long code-fence opener still protects its subsequent lines.
      this.fence ??= /^ {0,3}(`{3,}|~{3,})/.exec(this.pending)?.[1] ?? null;
      this.discardingLine ||= reserved;
      this.passthroughLine = true;
      this.lastWasMarker = false;
      if (!this.discardingLine) output += this.pending;
      this.pending = '';
    }
    return output;
  }

  get ready(): boolean {
    return this.matches >= 1 && this.lastWasMarker;
  }

  private line(line: string): string {
    if (this.passthroughLine) {
      this.passthroughLine = false;
      const discard = this.discardingLine;
      this.discardingLine = false;
      return discard ? '' : line;
    }
    const trimmed = line.trim();
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    const inFence = this.fence !== null;
    if (fence) {
      if (!this.fence) this.fence = fence;
      else if (fence[0] === this.fence[0] && fence.length >= this.fence.length
        && /^ {0,3}(?:`+|~+)\s*$/.test(line)) this.fence = null;
    }
    if (trimmed) this.lastWasMarker = false;
    if (!inFence && !fence && /^ {0,3}<od-production-ready\b/i.test(line)) {
      const match = /^ {0,3}<od-production-ready key="([a-f0-9]+)"\s*\/>\s*$/.exec(line);
      if (this.lineTrusted && this.key && match?.[1] === this.key) {
        this.matches++;
        this.lastWasMarker = true;
      }
      return ''; // Invalid control lines are hidden too, but never authorize a continuation.
    }
    return line;
  }
}

// Daemon-side compatibility guard for older Vela/OpenCode stderr behavior.
// These lifecycle lines are not failures and should not become structured
// error events in Open Design. Real AMR/OpenCode failures should continue to
// arrive structured from Vela where possible; this filter only keeps known
// bootstrap noise out of user-visible and persisted stderr surfaces.
function isAmrOpenCodeBootstrapStderrLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    /^Performing one time database migration, may take a few minutes\.\.\.$/i.test(trimmed) ||
    /^sqlite-migration:(?:done|\d+(?:\.\d+)?%?)$/i.test(trimmed) ||
    /^Database migration complete\.?$/i.test(trimmed) ||
    /^Warning:\s*OPENCODE_SERVER_PASSWORD is not set;\s*server is unsecured\.?$/i.test(trimmed) ||
    /^opencode server listening on http:\/\/127\.0\.0\.1:\d+\/?$/i.test(trimmed)
  );
}

function coerceStderrChunk(chunk: unknown): string {
  if (chunk === null || chunk === undefined) return '';
  return typeof chunk === 'string' ? chunk : String(chunk);
}

export function createAgentStderrVisibilityFilter(agentId: string | undefined) {
  if (agentId !== 'amr') {
    return {
      write(chunk: unknown): string {
        return coerceStderrChunk(chunk);
      },
      flush(): string {
        return '';
      },
    };
  }

  let pendingLine = '';

  const nextLineBreakIndex = (text: string): number => {
    const newline = text.indexOf('\n');
    const carriage = text.indexOf('\r');
    if (newline === -1) return carriage;
    if (carriage === -1) return newline;
    return Math.min(newline, carriage);
  };

  const emitIfVisible = (line: string, separator = ''): string =>
    isAmrOpenCodeBootstrapStderrLine(line) ? '' : `${line}${separator}`;

  return {
    write(chunk: unknown): string {
      pendingLine += coerceStderrChunk(chunk);
      let output = '';
      while (pendingLine.length > 0) {
        const lineBreakIndex = nextLineBreakIndex(pendingLine);
        if (lineBreakIndex === -1) break;
        const line = pendingLine.slice(0, lineBreakIndex);
        let separator = pendingLine[lineBreakIndex] ?? '';
        let nextIndex = lineBreakIndex + 1;
        if (separator === '\r' && pendingLine[nextIndex] === '\n') {
          separator = '\r\n';
          nextIndex += 1;
        }
        pendingLine = pendingLine.slice(nextIndex);
        output += emitIfVisible(line, separator);
      }
      return output;
    },
    flush(): string {
      if (!pendingLine) return '';
      const output = emitIfVisible(pendingLine);
      pendingLine = '';
      return output;
    },
  };
}

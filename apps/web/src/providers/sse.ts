export type ParsedSseFrame =
  | { kind: 'event'; event: string; data: Record<string, unknown>; id?: string }
  | { kind: 'comment'; comment: string }
  | { kind: 'empty' };

export function parseSseFrame(frame: string): ParsedSseFrame | null {
  const lines = frame.split('\n');
  const comments: string[] = [];
  let event = 'message';
  let id: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line.startsWith(':')) {
      comments.push(line.slice(1).trimStart());
    } else if (line.startsWith('event: ')) {
      event = line.slice(7).trim();
    } else if (line.startsWith('id: ')) {
      id = line.slice(4).trim();
    } else if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6));
    }
  }

  if (dataLines.length === 0) {
    if (comments.length > 0) {
      return { kind: 'comment', comment: comments.join('\n') };
    }
    return { kind: 'empty' };
  }

  try {
    return { kind: 'event', event, data: JSON.parse(dataLines.join('\n')), ...(id ? { id } : {}) };
  } catch {
    return null;
  }
}

// Transport adapter for the per-turn memory-extraction fire
// (`POST /api/memory/extract`).
//
// Best-effort by contract: memory extraction must never block or fail the chat,
// so a rejected request is swallowed — the daemon's SSE bus catches the Memory
// tab up on the next event. The wire shape is the shared `ExtractMemoryRequest`
// DTO from `@open-design/contracts`.
import type { ExtractMemoryRequest } from '@open-design/contracts';

export async function postMemoryExtract(request: ExtractMemoryRequest): Promise<void> {
  try {
    await fetch('/api/memory/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    // Best-effort: memory extraction must never block the chat.
  }
}

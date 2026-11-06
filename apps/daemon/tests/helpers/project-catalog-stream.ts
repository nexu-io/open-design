import { expect } from 'vitest';

const SIGNAL = 'event: project-catalog-changed';

export async function openProjectCatalogStream(baseUrl: string) {
  const controller = new AbortController();
  const resp = await fetch(`${baseUrl}/api/project-catalog/events`, {
    signal: controller.signal,
  });
  expect(resp.status).toBe(200);
  expect(resp.headers.get('content-type')).toContain('text/event-stream');
  const reader = resp.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let consumed = 0;

  async function readUntil(predicate: () => boolean) {
    while (!predicate()) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`stream ended early; buffer so far:\n${buffer}`);
      buffer += decoder.decode(value, { stream: true });
    }
  }
  const signalCount = () => buffer.split(SIGNAL).length - 1;

  await readUntil(() => buffer.includes('event: ready'));
  return {
    get raw() {
      return buffer;
    },
    /** Resolves with the next signal frame the daemon has not yet delivered. */
    async nextSignal() {
      await readUntil(() => signalCount() > consumed);
      consumed += 1;
    },
    /**
     * Keep consuming signals until `check` observes the change. A signal may
     * legitimately belong to an earlier write of the same test, so what a
     * signal must guarantee is that the list is final by the time it lands.
     */
    async untilSeen(check: () => Promise<boolean>) {
      for (;;) {
        await this.nextSignal();
        if (await check()) return;
      }
    },
    async close() {
      controller.abort();
      await reader.cancel().catch(() => undefined);
    },
  };
}

export type ProjectCatalogStream = Awaited<ReturnType<typeof openProjectCatalogStream>>;

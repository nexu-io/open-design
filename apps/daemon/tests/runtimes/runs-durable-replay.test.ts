import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { finished } from 'node:stream/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatRunService } from '../../src/runtimes/runs.js';

type WireRecord = { id: number; event: string; data: unknown };
// The ts-nocheck service infers its initially empty event ring as never[].
// State the actual public emitted-record shape used by these replay assertions.
type FixtureRun = Omit<ReturnType<ReturnType<typeof createChatRunService>['create']>, 'events'> & {
  events: WireRecord[];
};
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'od-active-replay-'));
  const received: WireRecord[] = [];
  const emitted: WireRecord[] = [];
  const endedAt: number[] = [];
  const response = new EventEmitter();
  let cleanupCalls = 0;
  let onSend: (() => void) | undefined;
  let durableWriter: fs.WriteStream | null = null;
  const service = createChatRunService({
    createSseResponse: () => ({
      send(event: string, data: unknown, id: number) {
        received.push({ event, data, id });
        onSend?.();
        return true;
      },
      end() { endedAt.push(received.length); },
      cleanup() { cleanupCalls += 1; },
    }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    // The JS-style service default infers null; this is its existing persistence API.
    runsLogDir: directory as unknown as null,
  });
  const run = service.create({ projectId: 'project-switch', conversationId: 'conversation-a' }) as FixtureRun;
  run.status = 'running';
  const emit = (data: unknown) => {
    const record = service.emit(run, 'agent', data);
    if (!record) throw new Error('fixture event was rejected');
    durableWriter = run.eventsLogStream as fs.WriteStream | null;
    emitted.push({ id: record.id, event: record.event, data: record.data });
    return record.id;
  };
  const flush = async () => {
    const writer = run.eventsLogStream as fs.WriteStream | null;
    if (!writer) throw new Error('fixture requires an active durable event writer');
    await new Promise<void>((resolve, reject) => writer.write('', (error) => error ? reject(error) : resolve()));
  };
  cleanups.push(async () => {
    response.emit('close');
    if (durableWriter) {
      if (!durableWriter.writableEnded) durableWriter.end();
      await finished(durableWriter);
    }
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return {
    service, run, received, emitted, emit, flush, endedAt,
    journalPath: path.join(directory, run.id, 'events.jsonl'),
    get cleanupCalls() { return cleanupCalls; },
    disconnect() { response.emit('close'); },
    setOnSend(callback: () => void) { onSend = callback; },
    async attach(cursor = 0) {
      await service.stream(run, { get: () => null, query: { after: String(cursor) } }, response);
    },
    seedLongTurn() {
      emit({ type: 'text_delta', delta: "I'll research the visual direction and real assets first, then build." });
      emit({ type: 'tool_use', id: 'early-read', name: 'Read', input: { file_path: 'brief.md' } });
      for (let i = 0; i < 2005; i += 1) emit({ type: 'thinking_delta', delta: `thought ${i}\n` });
    },
    readJournal(): WireRecord[] {
      return fs.readFileSync(path.join(directory, run.id, 'events.jsonl'), 'utf8')
        .trim().split('\n').map((line) => JSON.parse(line));
    },
  };
}

describe('active run durable SSE replay', () => {
  it('restores the original text and tools when switching back after the default ring evicts them', async () => {
    const f = fixture();
    f.seedLongTurn();
    await f.flush();
    expect(f.run.events).toHaveLength(2000);
    expect(f.readJournal().map((record) => record.data)).toEqual(f.emitted.map((record) => record.data));

    await f.attach();

    expect(f.received).toEqual(f.emitted);
    expect(f.received[0]?.data).toMatchObject({ type: 'text_delta' });
    expect(f.received[1]?.data).toMatchObject({ type: 'tool_use', id: 'early-read' });
    expect(f.run.status).toBe('running');
  });

  it('fills a reconnect cursor gap from the journal instead of silently skipping evicted events', async () => {
    const f = fixture();
    f.seedLongTurn();
    await f.flush();
    const cursor = f.emitted[0]!.id;
    const firstRetained = f.run.events[0];
    if (!firstRetained) throw new Error('fixture requires the retained run tail');
    expect(firstRetained.id).toBeGreaterThan(cursor + 1);

    await f.attach(cursor);

    expect(f.received).toEqual(f.emitted.filter((record) => record.id > cursor));
    expect(f.received[0]?.data).toMatchObject({ type: 'tool_use', id: 'early-read' });
  });

  it('hands historical replay over to concurrent live events in order, exactly once, even across another ring rotation', async () => {
    const f = fixture();
    f.seedLongTurn();
    await f.flush();
    let deliveredDuringReplay = false;
    f.setOnSend(() => {
      if (deliveredDuringReplay) return;
      deliveredDuringReplay = true;
      // Emit synchronously at the consumer boundary: no sleeps or guessed IO timing.
      for (let i = 0; i < 2003; i += 1) f.emit({ type: 'text_delta', delta: `live ${i}` });
    });

    await f.attach();
    f.emit({ type: 'tool_use', id: 'live-delete', name: 'Delete', input: { file_path: 'b.jpg' } });

    expect(deliveredDuringReplay).toBe(true);
    expect(f.received).toEqual(f.emitted);
    expect(new Set(f.received.map((record) => record.id)).size).toBe(f.received.length);
    expect(f.received.at(-1)?.data).toMatchObject({ id: 'live-delete' });
  });

  it('delivers the complete history before ending when the run finishes during replay', async () => {
    const f = fixture();
    f.seedLongTurn();
    await f.flush();
    let finishedDuringReplay = false;
    f.setOnSend(() => {
      if (finishedDuringReplay) return;
      finishedDuringReplay = true;
      f.service.finish(f.run, 'succeeded', 0, null);
    });

    await f.attach();

    expect(f.received.slice(0, -1)).toEqual(f.emitted);
    expect(f.received.at(-1)).toMatchObject({ event: 'end', data: { status: 'succeeded' } });
    expect(f.endedAt).toEqual([f.emitted.length + 1]);
    expect(f.run.clients.size).toBe(0);
  });


  it('waits for the terminal writer flush when attachment happens immediately after finish', async () => {
    const f = fixture();
    f.seedLongTurn();
    // Deliberately no fixture flush: finish closes and nulls the active writer.
    f.service.finish(f.run, 'succeeded', 0, null);

    await f.attach();

    expect(f.received.slice(0, -1)).toEqual(f.emitted);
    expect(f.received.at(-1)).toMatchObject({ event: 'end', data: { status: 'succeeded' } });
    expect(f.endedAt).toEqual([f.emitted.length + 1]);
  });

  it('releases the replay subscription on disconnect without cancelling the active run', async () => {
    const f = fixture();
    f.seedLongTurn();
    await f.flush();
    f.setOnSend(() => f.disconnect());

    await f.attach();
    const countAtDisconnect = f.received.length;
    f.emit({ type: 'text_delta', delta: 'the agent continues after the browser leaves' });

    expect(countAtDisconnect).toBe(1);
    expect(f.received).toHaveLength(countAtDisconnect);
    expect(f.run.clients.size).toBe(0);
    expect(f.run.status).toBe('running');
  });

  it('disconnects only this replay when the active journal flush reports EIO', async () => {
    const f = fixture();
    f.seedLongTurn();
    await f.flush();
    const writer = f.run.eventsLogStream as fs.WriteStream | null;
    if (!writer) throw new Error('fixture requires an active journal writer');
    const listenerCounts = ['error', 'close', 'finish'].map((event) => writer.listenerCount(event));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const write = vi.spyOn(writer, 'write').mockImplementationOnce((chunk, ...args) => {
      expect(chunk).toBe('');
      const callback = args.at(-1);
      if (typeof callback !== 'function') throw new Error('expected the journal flush callback');
      callback(Object.assign(new Error('fixture journal flush failed'), { code: 'EIO' }));
      return false;
    });
    try {
      await f.attach();

      expect(f.received).toEqual([]);
      expect(f.endedAt).toEqual([0]);
      expect(f.run.clients.size).toBe(0);
      expect(f.cleanupCalls).toBe(1);
      expect(f.run.status).toBe('running');
      expect(['error', 'close', 'finish'].map((event) => writer.listenerCount(event))).toEqual(listenerCounts);
      expect(warning).toHaveBeenCalledTimes(1);
    } finally {
      write.mockRestore();
      warning.mockRestore();
    }
    // The failure belongs to the detached consumer; the agent can still write.
    f.emit({ type: 'text_delta', delta: 'continues after the failed replay' });
    await f.flush();
    expect(f.received).toEqual([]);
    expect(f.readJournal().at(-1)?.data).toMatchObject({ delta: 'continues after the failed replay' });
    expect(f.run.status).toBe('running');
  });

  it.each(['missing', 'corrupt'] as const)('releases the journal reader and subscription when the replay journal is %s', async (failure) => {
    const f = fixture();
    f.seedLongTurn();
    await f.flush();
    if (failure === 'missing') fs.unlinkSync(f.journalPath);
    else fs.writeFileSync(f.journalPath, 'invalid first journal line\n');
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const openReader = vi.spyOn(fs, 'createReadStream');
    try {
      await f.attach();

      expect(f.received).toEqual([]);
      expect(f.endedAt).toEqual([0]);
      expect(f.run.clients.size).toBe(0);
      expect(f.cleanupCalls).toBe(1);
      expect(f.run.status).toBe('running');
      expect(openReader).toHaveBeenCalledTimes(1);
      const opened = openReader.mock.results[0];
      if (opened?.type !== 'return') throw new Error('expected a real filesystem reader');
      expect(opened.value.destroyed).toBe(true);
      expect(warning).toHaveBeenCalledTimes(1);
    } finally {
      openReader.mockRestore();
      warning.mockRestore();
    }
  });

});

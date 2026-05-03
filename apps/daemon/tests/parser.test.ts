import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PanelEvent } from '@open-design/contracts';
import { parseCritiqueStream } from '../src/critique/parser.js';
import {
  MalformedBlockError,
  OversizeBlockError,
  MissingArtifactError,
} from '../src/critique/errors.js';

function fixture(name: string): string {
  return readFileSync(
    join(__dirname, '..', 'src', 'critique', '__fixtures__', 'v1', name),
    'utf8',
  );
}

async function* chunkify(s: string, size = 64): AsyncGenerator<string> {
  for (let i = 0; i < s.length; i += size) yield s.slice(i, i + size);
}

async function collect(iter: AsyncIterable<PanelEvent>): Promise<PanelEvent[]> {
  const out: PanelEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

describe('parseCritiqueStream -- happy', () => {
  const happy = fixture('happy-3-rounds.txt');

  it('emits run_started, exactly 3 round_end, and 1 ship for the happy fixture', async () => {
    const events = await collect(parseCritiqueStream(chunkify(happy), {
      runId: 't1', adapter: 'test', parserMaxBlockBytes: 262_144,
    }));
    expect(events.find(e => e.type === 'run_started')).toBeDefined();
    expect(events.filter(e => e.type === 'round_end').length).toBe(3);
    expect(events.filter(e => e.type === 'ship').length).toBe(1);
  });

  it('emits panelist_open before any panelist_dim within the same role and round', async () => {
    const events = await collect(parseCritiqueStream(chunkify(happy), {
      runId: 't1', adapter: 'test', parserMaxBlockBytes: 262_144,
    }));
    const opened = new Set<string>();
    for (const e of events) {
      if (e.type === 'panelist_open') opened.add(`${e.round}:${e.role}`);
      if (e.type === 'panelist_dim') {
        expect(opened.has(`${e.round}:${e.role}`)).toBe(true);
      }
    }
  });

  it('emits panelist_close after panelist_dim and panelist_must_fix for the same role/round', async () => {
    const events = await collect(parseCritiqueStream(chunkify(happy), {
      runId: 't1', adapter: 'test', parserMaxBlockBytes: 262_144,
    }));
    const lastEventForKey = new Map<string, string>();
    for (const e of events) {
      if (
        e.type === 'panelist_open' ||
        e.type === 'panelist_dim' ||
        e.type === 'panelist_must_fix' ||
        e.type === 'panelist_close'
      ) {
        lastEventForKey.set(`${e.round}:${e.role}`, e.type);
      }
    }
    for (const value of lastEventForKey.values()) {
      expect(value).toBe('panelist_close');
    }
  });

  it('happy fixture parses identically when chunked at 1 byte vs 64 bytes vs all-at-once', async () => {
    const a = await collect(parseCritiqueStream(chunkify(happy, 1),      { runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144 }));
    const b = await collect(parseCritiqueStream(chunkify(happy, 64),     { runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144 }));
    const c = await collect(parseCritiqueStream(chunkify(happy, 1 << 20),{ runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144 }));
    // Strip parser_warning because positions vary by chunk size
    const strip = (xs: PanelEvent[]) => xs.filter(e => e.type !== 'parser_warning');
    expect(strip(a)).toEqual(strip(b));
    expect(strip(b)).toEqual(strip(c));
  });

  it('ship event has shipped status and matches happy round=3, composite >= 8.0', async () => {
    const events = await collect(parseCritiqueStream(chunkify(happy), {
      runId: 't1', adapter: 'test', parserMaxBlockBytes: 262_144,
    }));
    const ship = events.find(e => e.type === 'ship');
    expect(ship).toBeDefined();
    if (ship && ship.type === 'ship') {
      expect(ship.status).toBe('shipped');
      expect(ship.round).toBe(3);
      expect(ship.composite).toBeGreaterThanOrEqual(8.0);
    }
  });
});

describe('parseCritiqueStream -- failure modes', () => {
  it('throws MalformedBlockError on unbalanced tags', async () => {
    const text = fixture('malformed-unbalanced.txt');
    await expect(collect(parseCritiqueStream(chunkify(text), {
      runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
    }))).rejects.toBeInstanceOf(MalformedBlockError);
  });

  it('throws OversizeBlockError when a single block exceeds the cap', async () => {
    const text = fixture('malformed-oversize.txt');
    await expect(collect(parseCritiqueStream(chunkify(text), {
      runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
    }))).rejects.toBeInstanceOf(OversizeBlockError);
  });

  it('throws MissingArtifactError when designer round 1 has no <ARTIFACT>', async () => {
    const text = fixture('missing-artifact.txt');
    await expect(collect(parseCritiqueStream(chunkify(text), {
      runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
    }))).rejects.toBeInstanceOf(MissingArtifactError);
  });

  it('emits parser_warning with kind=duplicate_ship and keeps the first SHIP', async () => {
    const text = fixture('duplicate-ship.txt');
    const events = await collect(parseCritiqueStream(chunkify(text), {
      runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
    }));
    expect(events.filter(e => e.type === 'ship').length).toBe(1);
    expect(
      events.find(e => e.type === 'parser_warning' && e.kind === 'duplicate_ship')
    ).toBeDefined();
  });
});

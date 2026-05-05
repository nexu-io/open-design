import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PanelEvent } from '@open-design/contracts/critique';
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

describe('parseCritiqueStream -- review-driven invariants', () => {
  it('rejects a PANELIST that appears before any <ROUND n="..."> opens', async () => {
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <PANELIST role="critic" score="6.4"><DIM name="contrast" score="4">x</DIM></PANELIST>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseCritiqueStream(chunkify(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
      })),
    ).rejects.toBeInstanceOf(MalformedBlockError);
  });

  it('clamps a panelist score against the run-declared scale, not 100', async () => {
    // scale=10 so a score of 42 is out of range and should clamp + emit a warning.
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>v1 draft</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
        <PANELIST role="critic" score="42">
          <DIM name="contrast" score="42">over scale</DIM>
        </PANELIST>
        <PANELIST role="brand" score="8"><DIM name="palette" score="8">ok</DIM></PANELIST>
        <PANELIST role="a11y" score="8"><DIM name="contrast" score="8">ok</DIM></PANELIST>
        <PANELIST role="copy" score="8"><DIM name="voice" score="8">ok</DIM></PANELIST>
        <ROUND_END n="1" composite="8" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
      </ROUND>
      <SHIP round="1" composite="8" status="shipped">
        <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>
        <SUMMARY>ok</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;
    const events = await collect(parseCritiqueStream(chunkify(stream), {
      runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
    }));
    const critic = events.find(
      e => e.type === 'panelist_close' && e.role === 'critic',
    );
    expect(critic).toBeDefined();
    if (critic && critic.type === 'panelist_close') {
      // Clamped to scale=10, not the legacy 100 ceiling.
      expect(critic.score).toBe(10);
    }
    const dim = events.find(
      e => e.type === 'panelist_dim' && e.role === 'critic' && e.dimName === 'contrast',
    );
    expect(dim).toBeDefined();
    if (dim && dim.type === 'panelist_dim') {
      expect(dim.dimScore).toBe(10);
    }
    expect(
      events.filter(e => e.type === 'parser_warning' && e.kind === 'score_clamped').length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('still ships when scale=20 and threshold=18 is below the cap', async () => {
    // Confirms scale plumbing flows past the parser without losing the value.
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="18" scale="20">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>scale-20 draft</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
        <PANELIST role="critic" score="19"><DIM name="hierarchy" score="19">strong</DIM></PANELIST>
        <PANELIST role="brand" score="18"><DIM name="palette" score="18">ok</DIM></PANELIST>
        <PANELIST role="a11y" score="18"><DIM name="contrast" score="18">ok</DIM></PANELIST>
        <PANELIST role="copy" score="18"><DIM name="voice" score="18">ok</DIM></PANELIST>
        <ROUND_END n="1" composite="18.4" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
      </ROUND>
      <SHIP round="1" composite="18.4" status="shipped">
        <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>
        <SUMMARY>ok</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;
    const events = await collect(parseCritiqueStream(chunkify(stream), {
      runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
    }));
    const run = events.find(e => e.type === 'run_started');
    expect(run).toBeDefined();
    if (run && run.type === 'run_started') expect(run.scale).toBe(20);
    expect(
      events.filter(e => e.type === 'parser_warning' && e.kind === 'score_clamped').length,
    ).toBe(0);
    expect(events.find(e => e.type === 'ship')).toBeDefined();
  });
});

describe('parseCritiqueStream -- per-block size enforcement (mrcfps review)', () => {
  // Yield the whole stream in one chunk, mimicking a transport that batches the
  // model output. Without per-block enforcement the body would be sliced and
  // emitted before drain returned, bypassing the post-drain buf-size check.
  async function* oneChunk(s: string): AsyncGenerator<string> { yield s; }

  it('throws OversizeBlockError for a complete oversized PANELIST arriving in one chunk', async () => {
    const cap = 4096;
    const giantNote = 'x'.repeat(cap + 1024);
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>${giantNote}</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
      </ROUND>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseCritiqueStream(oneChunk(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: cap,
      })),
    ).rejects.toBeInstanceOf(OversizeBlockError);
  });

  it('throws OversizeBlockError for the malformed-oversize fixture parsed all-at-once', async () => {
    const text = fixture('malformed-oversize.txt');
    await expect(
      collect(parseCritiqueStream(oneChunk(text), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
      })),
    ).rejects.toBeInstanceOf(OversizeBlockError);
  });

  it('throws OversizeBlockError for a complete oversized SHIP arriving in one chunk', async () => {
    const cap = 4096;
    const giantSummary = 'y'.repeat(cap + 512);
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>v1</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
        <PANELIST role="critic" score="8"><DIM name="contrast" score="8">ok</DIM></PANELIST>
        <PANELIST role="brand" score="8"><DIM name="palette" score="8">ok</DIM></PANELIST>
        <PANELIST role="a11y" score="8"><DIM name="contrast" score="8">ok</DIM></PANELIST>
        <PANELIST role="copy" score="8"><DIM name="voice" score="8">ok</DIM></PANELIST>
        <ROUND_END n="1" composite="8" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
      </ROUND>
      <SHIP round="1" composite="8" status="shipped">
        <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>
        <SUMMARY>${giantSummary}</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseCritiqueStream(oneChunk(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: cap,
      })),
    ).rejects.toBeInstanceOf(OversizeBlockError);
  });
});

describe('parseCritiqueStream -- v1 envelope and shape invariants (mrcfps review 2)', () => {
  async function* oneChunk(s: string): AsyncGenerator<string> { yield s; }

  it('throws MalformedBlockError when ROUND appears before any <CRITIQUE_RUN>', async () => {
    const stream = `<ROUND n="1">
      <PANELIST role="critic" score="6"><DIM name="contrast" score="4">x</DIM></PANELIST>
    </ROUND>`;
    await expect(
      collect(parseCritiqueStream(oneChunk(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
      })),
    ).rejects.toBeInstanceOf(MalformedBlockError);
  });

  it('throws MalformedBlockError when SHIP appears before any <CRITIQUE_RUN>', async () => {
    const stream = `<SHIP round="1" composite="8" status="shipped">
      <ARTIFACT mime="text/html"><![CDATA[<p>x</p>]]></ARTIFACT>
      <SUMMARY>x</SUMMARY>
    </SHIP>`;
    await expect(
      collect(parseCritiqueStream(oneChunk(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
      })),
    ).rejects.toBeInstanceOf(MalformedBlockError);
  });

  it('measures parserMaxBlockBytes as UTF-8 bytes, so multibyte content over the byte cap fails', async () => {
    const cap = 4096;
    // Each CJK char encodes to 3 UTF-8 bytes. 1500 chars = 4500 bytes, over the
    // 4096-byte cap, but the JS string length is only 1500, well under the cap.
    // The pre-fix code (string-length comparison) would let this through.
    const giant = '汉'.repeat(1500);
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>${giant}</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
      </ROUND>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseCritiqueStream(oneChunk(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: cap,
      })),
    ).rejects.toBeInstanceOf(OversizeBlockError);
  });

  it('throws MalformedBlockError when a PANELIST opener has no > before </PANELIST>', async () => {
    // The opening tag is missing its closing >. Without the headEnd-ordering
    // guard the parser would pick up the > of </PANELIST> as the opener end
    // and emit panelist events for an invalid block.
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="critic" score="8"</PANELIST>
      </ROUND>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseCritiqueStream(oneChunk(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
      })),
    ).rejects.toBeInstanceOf(MalformedBlockError);
  });
});

describe('parseCritiqueStream -- Defects 3+5 regressions', () => {
  async function* oneChunk(s: string): AsyncGenerator<string> { yield s; }

  it('SHIP before any ROUND_END throws MalformedBlockError (Defect 5)', async () => {
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <SHIP round="1" composite="9" status="shipped">
        <ARTIFACT mime="text/html"><![CDATA[<p>x</p>]]></ARTIFACT>
        <SUMMARY>skipped rounds</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseCritiqueStream(oneChunk(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
      })),
    ).rejects.toBeInstanceOf(MalformedBlockError);
  });

  it('SHIP without inner <ARTIFACT> throws MissingArtifactError (Defect 5)', async () => {
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>v1</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
        <PANELIST role="critic" score="9"><DIM name="h" score="9">ok</DIM></PANELIST>
        <PANELIST role="brand" score="9"><DIM name="v" score="9">ok</DIM></PANELIST>
        <PANELIST role="a11y" score="9"><DIM name="c" score="9">ok</DIM></PANELIST>
        <PANELIST role="copy" score="9"><DIM name="cl" score="9">ok</DIM></PANELIST>
        <ROUND_END n="1" composite="9" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
      </ROUND>
      <SHIP round="1" composite="9" status="shipped">
        <SUMMARY>no artifact block here</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseCritiqueStream(oneChunk(stream), {
        runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
      })),
    ).rejects.toBeInstanceOf(MissingArtifactError);
  });

  it('artifactRef is populated from parser options projectId+artifactId (Defect 3)', async () => {
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>v1</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
        <PANELIST role="critic" score="9"><DIM name="h" score="9">ok</DIM></PANELIST>
        <PANELIST role="brand" score="9"><DIM name="v" score="9">ok</DIM></PANELIST>
        <PANELIST role="a11y" score="9"><DIM name="c" score="9">ok</DIM></PANELIST>
        <PANELIST role="copy" score="9"><DIM name="cl" score="9">ok</DIM></PANELIST>
        <ROUND_END n="1" composite="9" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
      </ROUND>
      <SHIP round="1" composite="9" status="shipped">
        <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>
        <SUMMARY>done</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;
    const events = await collect(parseCritiqueStream(oneChunk(stream), {
      runId: 't', adapter: 'test', parserMaxBlockBytes: 262_144,
      projectId: 'p1', artifactId: 'a1',
    }));
    const ship = events.find(e => e.type === 'ship');
    expect(ship).toBeDefined();
    if (ship && ship.type === 'ship') {
      expect(ship.artifactRef.projectId).toBe('p1');
      expect(ship.artifactRef.artifactId).toBe('a1');
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { PanelEvent } from '@open-design/contracts/critique';
import {
  parseV1,
  extractArtifactBlock,
  indexOfOutsideCdata,
} from '../../../src/critique/parsers/v1.js';
import {
  MalformedBlockError,
  MissingArtifactError,
  OversizeBlockError,
} from '../../../src/critique/errors.js';

// ---------------------------------------------------------------------------
// Targeted unit coverage for the v1 streaming parser (parseV1 + the two
// pure helpers it exposes). The existing tests/parser.test.ts exercises the
// public facade parseCritiqueStream end-to-end; this file pins behaviors at
// the parser-internal level so a refactor that preserves the public happy
// path but breaks a single regex or boundary rule still goes red here.
// ---------------------------------------------------------------------------

async function* chunkify(s: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < s.length; i += size) yield s.slice(i, i + size);
}

async function* oneChunk(s: string): AsyncGenerator<string> {
  yield s;
}

async function collect(iter: AsyncIterable<PanelEvent>): Promise<PanelEvent[]> {
  const out: PanelEvent[] = [];
  for await (const e of iter) out.push(e);
  return out;
}

// Minimal opts builder so each test only passes the knobs it cares about.
function opts(over: Partial<Parameters<typeof parseV1>[1]> = {}) {
  return {
    runId: 'run-test',
    adapter: 'test-adapter',
    parserMaxBlockBytes: 262_144,
    ...over,
  };
}

// Wrap a body inside a complete, well-formed CRITIQUE_RUN/ROUND/SHIP envelope
// so individual block-level assertions can run without re-deriving the full
// scaffolding for every test.
function wrapRound1(roundBody: string, scale = 10, threshold = '8.0'): string {
  return `<CRITIQUE_RUN version="1" maxRounds="3" threshold="${threshold}" scale="${scale}">
  <ROUND n="1">
    <PANELIST role="designer">
      <NOTES>v1</NOTES>
      <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
    </PANELIST>
${roundBody}
    <ROUND_END n="1" composite="9" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
  </ROUND>
  <SHIP round="1" composite="9" status="shipped">
    <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>
    <SUMMARY>done</SUMMARY>
  </SHIP>
</CRITIQUE_RUN>`;
}

describe('parseV1 -- DIM_RE dimension extraction', () => {
  it('emits one panelist_dim per <DIM> match with name, score, and trimmed note', async () => {
    // Three DIMs inside one critic panelist; each must surface independently
    // with its own name/score/note. The regex is /g so multiple matches in
    // the same body must all be yielded, not just the first.
    const body = `    <PANELIST role="critic" score="7">
      <DIM name="contrast" score="6">low contrast on hero</DIM>
      <DIM name="hierarchy" score="7">  spacing reads ok  </DIM>
      <DIM name="typography" score="8">clean</DIM>
    </PANELIST>`;
    const events = await collect(parseV1(oneChunk(wrapRound1(body)), opts()));
    const dims = events.filter((e) => e.type === 'panelist_dim' && e.role === 'critic');
    expect(dims).toHaveLength(3);
    const names = dims.map((d) => (d.type === 'panelist_dim' ? d.dimName : ''));
    expect(names).toEqual(['contrast', 'hierarchy', 'typography']);
    // Note must be .trim()'d so the second DIM's surrounding whitespace is gone.
    const second = dims[1];
    expect(second?.type).toBe('panelist_dim');
    if (second?.type === 'panelist_dim') {
      expect(second.dimNote).toBe('spacing reads ok');
      expect(second.dimScore).toBe(7);
    }
  });

  it('emits panelist_dim with the round captured from the enclosing <ROUND>', async () => {
    // The dim event must carry the round number from the open ROUND envelope,
    // not a default or a re-derived value. Round 1 here.
    const body = `    <PANELIST role="brand" score="8">
      <DIM name="palette" score="8">ok</DIM>
    </PANELIST>`;
    const events = await collect(parseV1(oneChunk(wrapRound1(body)), opts()));
    const dim = events.find((e) => e.type === 'panelist_dim' && e.role === 'brand');
    expect(dim?.type).toBe('panelist_dim');
    if (dim?.type === 'panelist_dim') expect(dim.round).toBe(1);
  });
});

describe('parseV1 -- MUST_FIX_RE flag', () => {
  it('emits a panelist_must_fix event for each <MUST_FIX> block with trimmed text', async () => {
    // Two must-fix entries plus a DIM in the same body. The must-fix events
    // are independent of the dim events and both must surface.
    const body = `    <PANELIST role="a11y" score="6">
      <DIM name="contrast" score="6">ok</DIM>
      <MUST_FIX>   hero buttons fail WCAG AA   </MUST_FIX>
      <MUST_FIX>nav lacks landmark</MUST_FIX>
    </PANELIST>`;
    const events = await collect(parseV1(oneChunk(wrapRound1(body)), opts()));
    const fixes = events.filter(
      (e) => e.type === 'panelist_must_fix' && e.role === 'a11y',
    );
    expect(fixes).toHaveLength(2);
    if (fixes[0]?.type === 'panelist_must_fix') {
      expect(fixes[0].text).toBe('hero buttons fail WCAG AA');
      expect(fixes[0].round).toBe(1);
    }
    if (fixes[1]?.type === 'panelist_must_fix') {
      expect(fixes[1].text).toBe('nav lacks landmark');
    }
  });

  it('emits zero panelist_must_fix events when the body has none', async () => {
    const body = `    <PANELIST role="copy" score="9"><DIM name="voice" score="9">ok</DIM></PANELIST>`;
    const events = await collect(parseV1(oneChunk(wrapRound1(body)), opts()));
    expect(events.filter((e) => e.type === 'panelist_must_fix')).toHaveLength(0);
  });
});

describe('parseV1 -- score clamping against scoreScale', () => {
  it('clamps a negative panelist score to 0 and emits a score_clamped warning', async () => {
    // Negative scores are out of [0, scale]; the parser clamps to 0 and emits
    // a parser_warning so downstream consumers know composite math used the
    // clamped value.
    const body = `    <PANELIST role="critic" score="-5">
      <DIM name="contrast" score="-2">bad</DIM>
    </PANELIST>`;
    const events = await collect(parseV1(oneChunk(wrapRound1(body)), opts()));
    const close = events.find(
      (e) => e.type === 'panelist_close' && e.role === 'critic',
    );
    expect(close?.type).toBe('panelist_close');
    if (close?.type === 'panelist_close') expect(close.score).toBe(0);
    const warnings = events.filter(
      (e) => e.type === 'parser_warning' && e.kind === 'score_clamped',
    );
    // At least one warning each for the panelist score and the dim score.
    expect(warnings.length).toBeGreaterThanOrEqual(2);
  });

  it('clamps a panelist score that exceeds the declared scale and surfaces a warning', async () => {
    // scoreScale comes from <CRITIQUE_RUN scale="10">; anything above 10 must
    // clamp to 10 regardless of how large the raw value is.
    const body = `    <PANELIST role="critic" score="999"><DIM name="x" score="9">ok</DIM></PANELIST>`;
    const events = await collect(parseV1(oneChunk(wrapRound1(body)), opts()));
    const close = events.find(
      (e) => e.type === 'panelist_close' && e.role === 'critic',
    );
    expect(close?.type).toBe('panelist_close');
    if (close?.type === 'panelist_close') expect(close.score).toBe(10);
    expect(
      events.find(
        (e) => e.type === 'parser_warning' && e.kind === 'score_clamped',
      ),
    ).toBeDefined();
  });

  it('treats a non-numeric panelist score as 0 (NaN is out of range)', async () => {
    // Number("not-a-number") is NaN. isOutOfRange returns true for !isFinite,
    // and clampScore returns 0 for !isFinite, so the final score is 0.
    const body = `    <PANELIST role="critic" score="not-a-number"><DIM name="x" score="5">ok</DIM></PANELIST>`;
    const events = await collect(parseV1(oneChunk(wrapRound1(body)), opts()));
    const close = events.find(
      (e) => e.type === 'panelist_close' && e.role === 'critic',
    );
    expect(close?.type).toBe('panelist_close');
    if (close?.type === 'panelist_close') expect(close.score).toBe(0);
  });
});

describe('parseV1 -- byte cap (parserMaxBlockBytes) enforcement', () => {
  it('throws OversizeBlockError when a complete PANELIST block arrives over the cap', async () => {
    // Per-block check inside drain catches a complete oversized block before
    // its body is sliced and emitted; without it the events would leak past
    // the cap and the post-drain buf check would only catch unclosed runaways.
    const cap = 2048;
    const giant = 'x'.repeat(cap + 1024);
    const body = `    <PANELIST role="critic" score="8"><NOTES>${giant}</NOTES><DIM name="x" score="8">ok</DIM></PANELIST>`;
    await expect(
      collect(parseV1(oneChunk(wrapRound1(body)), opts({ parserMaxBlockBytes: cap }))),
    ).rejects.toBeInstanceOf(OversizeBlockError);
  });

  it('throws OversizeBlockError when an unclosed buffer exceeds the cap', async () => {
    // No closing </PANELIST>, so the per-block guard never fires; the post-
    // drain bufBytes check is the only line of defense and must trip.
    const cap = 1024;
    const giant = 'q'.repeat(cap + 512);
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>${giant}`;
    await expect(
      collect(parseV1(oneChunk(stream), opts({ parserMaxBlockBytes: cap }))),
    ).rejects.toBeInstanceOf(OversizeBlockError);
  });

  it('measures bytes in UTF-8 so multibyte content cannot bypass the cap by JS string length', async () => {
    // Each CJK char is 3 UTF-8 bytes. 1500 chars = 4500 bytes > 4096 cap,
    // but JS string length is 1500, well under the cap. The byte-aware check
    // must reject; a length-based check would let this through.
    const cap = 4096;
    const giant = '汉'.repeat(1500);
    const body = `    <PANELIST role="critic" score="8"><NOTES>${giant}</NOTES><DIM name="x" score="8">ok</DIM></PANELIST>`;
    await expect(
      collect(parseV1(oneChunk(wrapRound1(body)), opts({ parserMaxBlockBytes: cap }))),
    ).rejects.toBeInstanceOf(OversizeBlockError);
  });
});

describe('parseV1 -- SHIP guard emission and envelope rules', () => {
  it('emits exactly one ship event with status, round, summary, and artifactRef', async () => {
    const stream = wrapRound1(
      `    <PANELIST role="critic" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="brand" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="copy" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>`,
    );
    const events = await collect(
      parseV1(oneChunk(stream), opts({ projectId: 'pid', artifactId: 'aid' })),
    );
    const ships = events.filter((e) => e.type === 'ship');
    expect(ships).toHaveLength(1);
    const ship = ships[0];
    if (ship?.type === 'ship') {
      expect(ship.status).toBe('shipped');
      expect(ship.round).toBe(1);
      expect(ship.summary).toBe('done');
      // artifactRef must come straight from the parser options, not from the
      // <ARTIFACT> attrs or anywhere else.
      expect(ship.artifactRef.projectId).toBe('pid');
      expect(ship.artifactRef.artifactId).toBe('aid');
    }
  });

  it('invokes onArtifact with the round, mime, and decoded body before the ship event yields', async () => {
    // The side-channel callback must fire so the orchestrator can persist
    // bytes to disk before any consumer reacts to the ship event.
    const stream = wrapRound1(
      `    <PANELIST role="critic" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="brand" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="copy" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>`,
    );
    const captured: Array<{ round: number; mime: string; body: string }> = [];
    const events = await collect(
      parseV1(oneChunk(stream), opts({ onArtifact: (p) => captured.push(p) })),
    );
    expect(captured).toHaveLength(1);
    expect(captured[0]?.round).toBe(1);
    expect(captured[0]?.mime).toBe('text/html');
    expect(captured[0]?.body).toBe('<p>final</p>');
    // And the ship event must still be yielded after the callback fired.
    expect(events.find((e) => e.type === 'ship')).toBeDefined();
  });

  it('throws MalformedBlockError when SHIP arrives before any ROUND_END closes', async () => {
    // SHIP must not arrive before at least one round has completed, otherwise
    // the round-1 designer-artifact invariant could be bypassed.
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>v1</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
      </ROUND>
      <SHIP round="1" composite="9" status="shipped">
        <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>
        <SUMMARY>premature</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseV1(oneChunk(stream), opts())),
    ).rejects.toBeInstanceOf(MalformedBlockError);
  });

  it('emits a duplicate_ship parser_warning on the second SHIP and keeps the first', async () => {
    // Two complete SHIP blocks. shipSeen flips on the first; the second is
    // surfaced as a warning at its position and skipped (no second ship event).
    const stream = wrapRound1(
      `    <PANELIST role="critic" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="brand" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="copy" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>`,
    ).replace(
      '</CRITIQUE_RUN>',
      `  <SHIP round="1" composite="9" status="shipped">
    <ARTIFACT mime="text/html"><![CDATA[<p>second</p>]]></ARTIFACT>
    <SUMMARY>second</SUMMARY>
  </SHIP>
</CRITIQUE_RUN>`,
    );
    const events = await collect(parseV1(oneChunk(stream), opts()));
    expect(events.filter((e) => e.type === 'ship')).toHaveLength(1);
    expect(
      events.find(
        (e) => e.type === 'parser_warning' && e.kind === 'duplicate_ship',
      ),
    ).toBeDefined();
  });
});

describe('parseV1 -- multi-round streaming accumulation', () => {
  it('emits identical event sequences (modulo parser_warning) for 1, 7, and all-at-once chunkings', async () => {
    // Streaming parsers must accumulate state across chunk boundaries. Vary
    // the chunk size aggressively and compare. parser_warning carries a
    // position that depends on chunk timing, so strip it before comparing.
    const stream = wrapRound1(
      `    <PANELIST role="critic" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="brand" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="copy" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>`,
    );
    const strip = (xs: PanelEvent[]) => xs.filter((e) => e.type !== 'parser_warning');
    const one = strip(await collect(parseV1(chunkify(stream, 1), opts())));
    const seven = strip(await collect(parseV1(chunkify(stream, 7), opts())));
    const whole = strip(await collect(parseV1(oneChunk(stream), opts())));
    expect(one).toEqual(seven);
    expect(seven).toEqual(whole);
  });

  it('handles chunk boundaries that cut inside attribute values and CDATA bodies', async () => {
    // Worst-case chunk boundaries: 3 bytes per chunk slices through tag names,
    // attribute strings, and CDATA markers. The parser must wait for more bytes
    // (the `<` fallthrough in drain) and never emit a partial event.
    const stream = wrapRound1(
      `    <PANELIST role="critic" score="9"><DIM name="contrast" score="9">ok</DIM></PANELIST>
    <PANELIST role="brand" score="9"><DIM name="palette" score="9">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="9"><DIM name="contrast" score="9">ok</DIM></PANELIST>
    <PANELIST role="copy" score="9"><DIM name="voice" score="9">ok</DIM></PANELIST>`,
    );
    const events = await collect(parseV1(chunkify(stream, 3), opts()));
    expect(events.filter((e) => e.type === 'panelist_open')).toHaveLength(5);
    expect(events.filter((e) => e.type === 'panelist_close')).toHaveLength(5);
    expect(events.filter((e) => e.type === 'ship')).toHaveLength(1);
  });

  it('counts roundsClosed across multiple <ROUND> envelopes before SHIP', async () => {
    // Two rounds close before SHIP. SHIP must succeed (roundsClosed > 0) and
    // emit a single ship event tied to round 2.
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>v1</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT>
        </PANELIST>
        <PANELIST role="critic" score="6"><DIM name="x" score="6">low</DIM></PANELIST>
        <ROUND_END n="1" composite="6" must_fix="1" decision="continue"><REASON>iterate</REASON></ROUND_END>
      </ROUND>
      <ROUND n="2">
        <PANELIST role="designer"><NOTES>v2 notes only</NOTES></PANELIST>
        <PANELIST role="critic" score="9"><DIM name="x" score="9">strong</DIM></PANELIST>
        <ROUND_END n="2" composite="9" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
      </ROUND>
      <SHIP round="2" composite="9" status="shipped">
        <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>
        <SUMMARY>two rounds in</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;
    const events = await collect(parseV1(chunkify(stream, 16), opts()));
    expect(events.filter((e) => e.type === 'round_end')).toHaveLength(2);
    const ship = events.find((e) => e.type === 'ship');
    if (ship?.type === 'ship') expect(ship.round).toBe(2);
  });
});

describe('parseV1 -- unknown / garbage input', () => {
  it('emits parser_warning with kind=unknown_role for an unrecognized role and does not throw', async () => {
    // KNOWN_ROLES is closed at {designer, critic, brand, a11y, copy}. An
    // unknown role surfaces as a parser_warning and the block is skipped
    // without panelist_open / panelist_close events.
    const body = `    <PANELIST role="phantom" score="8"><DIM name="x" score="8">ok</DIM></PANELIST>
    <PANELIST role="critic" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="brand" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
    <PANELIST role="copy" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>`;
    const events = await collect(parseV1(oneChunk(wrapRound1(body)), opts()));
    expect(
      events.find(
        (e) => e.type === 'parser_warning' && e.kind === 'unknown_role',
      ),
    ).toBeDefined();
    // The phantom role contributes no open/close pair.
    const openRoles = events
      .filter((e) => e.type === 'panelist_open')
      .map((e) => (e.type === 'panelist_open' ? e.role : ''));
    expect(openRoles).not.toContain('phantom');
  });

  it('returns no events for an empty stream and never throws (no run started)', async () => {
    const events = await collect(parseV1(oneChunk(''), opts()));
    expect(events).toEqual([]);
  });

  it('emits run_started but throws MalformedBlockError when the run never closes', async () => {
    // A stream that opens CRITIQUE_RUN but never reaches </CRITIQUE_RUN> or
    // <SHIP> is a producer-side bug; the parser must surface it at end-of-
    // stream rather than swallow it silently.
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">`;
    await expect(
      collect(parseV1(oneChunk(stream), opts())),
    ).rejects.toBeInstanceOf(MalformedBlockError);
  });

  it('throws MalformedBlockError on a stray non-whitespace character inside CRITIQUE_RUN', async () => {
    // Once inside the envelope, the only legal top-level characters are
    // whitespace, `<` (start of a tag, possibly partial), or one of the
    // recognized tag openers. A bare letter triggers the malformed guard.
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      garbage`;
    await expect(
      collect(parseV1(oneChunk(stream), opts())),
    ).rejects.toBeInstanceOf(MalformedBlockError);
  });

  it('throws MissingArtifactError when round 1 closes without a designer ARTIFACT', async () => {
    // Round 1 designer must emit exactly one <ARTIFACT>. NOTES-only is an
    // illegal stream for round 1 even if every other panelist scored fine.
    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer"><NOTES>no artifact this round</NOTES></PANELIST>
        <PANELIST role="critic" score="9"><DIM name="x" score="9">ok</DIM></PANELIST>
        <ROUND_END n="1" composite="9" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
      </ROUND>
    </CRITIQUE_RUN>`;
    await expect(
      collect(parseV1(oneChunk(stream), opts())),
    ).rejects.toBeInstanceOf(MissingArtifactError);
  });
});

describe('parseV1 helpers -- extractArtifactBlock', () => {
  it('returns null when there is no <ARTIFACT> opener', () => {
    expect(extractArtifactBlock('<SUMMARY>none</SUMMARY>')).toBeNull();
  });

  it('extracts an inline (non-CDATA) body and reports blockEnd just past </ARTIFACT>', () => {
    const inner = `<ARTIFACT mime="text/html"><p>hi</p></ARTIFACT><SUMMARY>x</SUMMARY>`;
    const result = extractArtifactBlock(inner);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.body).toBe('<p>hi</p>');
      expect(result.attrText.trim()).toBe('mime="text/html"');
      // The slice that starts at blockEnd should begin with the SUMMARY tag.
      expect(inner.slice(result.blockEnd).startsWith('<SUMMARY>')).toBe(true);
    }
  });

  it('strips the CDATA wrapper and preserves a literal </ARTIFACT> inside the body', () => {
    const inner = `<ARTIFACT mime="text/html"><![CDATA[<script>const s = "</ARTIFACT>";</script>]]></ARTIFACT>`;
    const result = extractArtifactBlock(inner);
    expect(result).not.toBeNull();
    if (result) {
      expect(result.body).toBe(`<script>const s = "</ARTIFACT>";</script>`);
    }
  });

  it('returns null when CDATA opens but never terminates', () => {
    const inner = `<ARTIFACT mime="text/html"><![CDATA[<p>unterminated`;
    expect(extractArtifactBlock(inner)).toBeNull();
  });
});

describe('parseV1 helpers -- indexOfOutsideCdata', () => {
  it('finds the needle when no CDATA span is in the way', () => {
    expect(indexOfOutsideCdata('hello <SHIP> world', '<SHIP>')).toBe(6);
  });

  it('skips a needle that appears inside <![CDATA[ ... ]]> and finds the next one outside', () => {
    const src = `<![CDATA[ ignore <SHIP> me ]]> real <SHIP>`;
    const idx = indexOfOutsideCdata(src, '<SHIP>');
    expect(idx).toBe(src.lastIndexOf('<SHIP>'));
  });

  it('returns -1 when the only needle is inside an unterminated CDATA span', () => {
    expect(indexOfOutsideCdata('<![CDATA[<SHIP>', '<SHIP>')).toBe(-1);
  });

  it('honors the startOffset argument and does not search before it', () => {
    expect(indexOfOutsideCdata('<SHIP> later <SHIP>', '<SHIP>', 3)).toBe(13);
  });
});

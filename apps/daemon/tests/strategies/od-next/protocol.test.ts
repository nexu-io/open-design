import { describe, expect, it } from 'vitest';

import {
  OdNextMachineProtocolStream,
  createOdNextRunProtocol,
  passThroughOrdinaryAssistantText,
} from '../../../src/strategies/od-next/protocol.js';

const NO_DECLARATIONS = { nonDesignRequest: false, noFileWrites: false };

// A plan block the way a task frozen on an older strategy package still writes it.
const legacyPlan = {
  schema: 'open-design.plan-contract/v2',
  strategy: { id: 'od-next-strategy', version: '2.0.0', packageHash: 'a'.repeat(64), snapshotId: 'snapshot-1' },
  taskProfile: { goal: 'Build a prototype' },
  decisionSummary: { goal: 'Build a prototype' },
};

const legacyState = {
  schema: 'open-design.strategy-state/v2',
  route: 'full_plan',
  inputStage: 'request',
  outcome: 'plan_ready',
  executionMode: 'simple',
  reasonCodes: [],
};

function machineBlock(tag: string, value: unknown): string {
  return `<${tag}>\n${JSON.stringify(value)}\n</${tag}>`;
}

function pushInChunks(stream: OdNextMachineProtocolStream, text: string, size: number): string {
  let emitted = '';
  for (let index = 0; index < text.length; index += size) {
    emitted += stream.push(text.slice(index, index + size));
  }
  return emitted;
}

describe('OD Next machine protocol stream', () => {
  it('withholds reserved blocks across every chunk boundary and never returns machine bytes', () => {
    const text = [
      'Visible planning summary.',
      machineBlock('open-design-plan-contract', legacyPlan),
      machineBlock('open-design-runtime-state', legacyState),
      'Closing prose.',
    ].join('\n');
    for (const size of [1, 3, 7, 16, 64, text.length]) {
      const stream = new OdNextMachineProtocolStream();
      const emitted = pushInChunks(stream, text, size);
      const result = stream.finish();
      expect(result.visibleText, `chunk size ${size}`).toBe('Visible planning summary.\n\n\nClosing prose.');
      expect(emitted, `chunk size ${size}`).toBe(result.visibleText);
      expect(emitted).not.toContain('open-design');
      expect(result.declarationBlockSeen).toBe(true);
      expect(result.declarations).toEqual(NO_DECLARATIONS);
    }
  });

  it('reads the two declarations leniently and maps the older block vocabulary onto them', () => {
    const declared = new OdNextMachineProtocolStream();
    declared.push(`Answer.\n${machineBlock('open-design-runtime-state', { nonDesignRequest: true, noFileWrites: true, extra: 'ignored' })}`);
    expect(declared.finish()).toEqual({
      visibleText: 'Answer.\n',
      declarations: { nonDesignRequest: true, noFileWrites: true },
      declarationBlockSeen: true,
    });

    const legacyBlocked = new OdNextMachineProtocolStream();
    legacyBlocked.push(`Hi there.\n${machineBlock('open-design-runtime-state', { ...legacyState, outcome: 'blocked' })}`);
    expect(legacyBlocked.finish().declarations).toEqual({ nonDesignRequest: true, noFileWrites: false });

    const legacyPlanOnly = new OdNextMachineProtocolStream();
    legacyPlanOnly.push(`Plan only.\n${machineBlock('open-design-runtime-state', { ...legacyState, outcome: 'completed', executionIntent: 'plan_only' })}`);
    expect(legacyPlanOnly.finish().declarations).toEqual({ nonDesignRequest: false, noFileWrites: true });
  });

  it('accepts a fenced, prose-wrapped, or sloppily tagged block and ignores what it cannot read', () => {
    const fenced = new OdNextMachineProtocolStream();
    fenced.push(`Done.\n<open-design-runtime-state>\n\`\`\`json\n${JSON.stringify({ noFileWrites: true })}\n\`\`\`\n</open-design-runtime-state>`);
    expect(fenced.finish()).toMatchObject({ visibleText: 'Done.\n', declarations: { noFileWrites: true }, declarationBlockSeen: true });

    const wrapped = new OdNextMachineProtocolStream();
    wrapped.push(`Done.\n<open-design-runtime-state attr="x">\nHere it is: ${JSON.stringify({ nonDesignRequest: true })} thanks\n</open-design-runtime-state >`);
    expect(wrapped.finish()).toMatchObject({ visibleText: 'Done.\n', declarations: { nonDesignRequest: true }, declarationBlockSeen: true });

    const unreadable = new OdNextMachineProtocolStream();
    unreadable.push(`Done.\n<open-design-runtime-state>\nnot json at all\n</open-design-runtime-state>`);
    expect(unreadable.finish()).toEqual({ visibleText: 'Done.\n', declarations: NO_DECLARATIONS, declarationBlockSeen: false });

    const arrayBody = new OdNextMachineProtocolStream();
    arrayBody.push(`Done.\n<open-design-runtime-state>\n[1,2]\n</open-design-runtime-state>`);
    expect(arrayBody.finish()).toEqual({ visibleText: 'Done.\n', declarations: NO_DECLARATIONS, declarationBlockSeen: false });
  });

  it('carries no declarations for a reply without any block', () => {
    const stream = new OdNextMachineProtocolStream();
    stream.push('Plain answer with a `<open-design-runtime-state>` mention in code.');
    expect(stream.finish()).toEqual({
      visibleText: 'Plain answer with a `',
      declarations: NO_DECLARATIONS,
      declarationBlockSeen: false,
    });
  });

  it('does not treat Markdown headings or ordinary JSON as machine protocol', () => {
    const text = '## open design plan\n{"schema":"open-design.plan-contract/v2"}\n';
    const stream = new OdNextMachineProtocolStream();
    expect(stream.push(text)).toBe(text);
    expect(stream.finish()).toEqual({ visibleText: text, declarations: NO_DECLARATIONS, declarationBlockSeen: false });
  });

  it('merges several runtime-state blocks instead of refusing duplicates', () => {
    const stream = new OdNextMachineProtocolStream();
    stream.push([
      machineBlock('open-design-runtime-state', { nonDesignRequest: true }),
      machineBlock('open-design-runtime-state', { noFileWrites: true }),
    ].join('\n'));
    expect(stream.finish()).toEqual({
      visibleText: '\n',
      declarations: { nonDesignRequest: true, noFileWrites: true },
      declarationBlockSeen: true,
    });
  });

  it('withholds an unclosed or oversized block and drops stray or incomplete tags', () => {
    const unclosed = new OdNextMachineProtocolStream();
    unclosed.push('Summary\n<open-design-plan-contract>\n{"never":"closed"');
    expect(unclosed.finish()).toEqual({ visibleText: 'Summary\n', declarations: NO_DECLARATIONS, declarationBlockSeen: false });

    const oversized = new OdNextMachineProtocolStream({ maxMachineBlockBytes: 16 });
    oversized.push(`Summary\n${machineBlock('open-design-runtime-state', { noFileWrites: true, padding: 'x'.repeat(64) })}`);
    expect(oversized.finish()).toEqual({ visibleText: 'Summary\n', declarations: NO_DECLARATIONS, declarationBlockSeen: false });

    const stray = new OdNextMachineProtocolStream();
    stray.push('Before </open-design-runtime-state> after');
    expect(stray.finish().visibleText).toBe('Before  after');

    const incompleteTag = new OdNextMachineProtocolStream();
    incompleteTag.push('Before <open-design-runtime-state');
    expect(incompleteTag.finish().visibleText).toBe('Before ');
  });

  it('consumes an incomplete closing tag at EOF across every chunk boundary', () => {
    const text = `Summary\n${machineBlock('open-design-runtime-state', { noFileWrites: true })}`.replace(/>$/, '');
    for (const size of [1, 2, 5, text.length]) {
      const stream = new OdNextMachineProtocolStream();
      const emitted = pushInChunks(stream, text, size);
      const result = stream.finish();
      expect(emitted, `chunk size ${size}`).toBe('Summary\n');
      expect(result.visibleText).toBe('Summary\n');
      expect(result.declarations).toEqual({ nonDesignRequest: false, noFileWrites: true });
    }
  });

  it('leaves the ordinary Run path byte-for-byte unchanged', () => {
    const ordinary = 'Visible <open-design-runtime-state>{"not":"active"}</open-design-runtime-state>';
    expect(passThroughOrdinaryAssistantText(null, ordinary)).toBe(ordinary);

    const strategy = new OdNextMachineProtocolStream();
    expect(passThroughOrdinaryAssistantText(strategy, ordinary)).toBe('Visible ');
    expect(strategy.finish().visibleText).toBe('Visible ');
  });

  it('does not terminate suppression on a closing-tag string inside JSON', () => {
    const hostile = { ...legacyPlan, taskProfile: { goal: 'Never leak </open-design-plan-contract> machine bytes' } };
    const stream = new OdNextMachineProtocolStream();
    const visible = stream.push([
      'summary',
      machineBlock('open-design-plan-contract', hostile),
      machineBlock('open-design-runtime-state', { noFileWrites: true }),
    ].join('\n'));
    const result = stream.finish();
    expect(visible).toBe('summary\n\n');
    expect(result.visibleText).not.toContain('machine bytes');
    expect(result.declarations).toEqual({ nonDesignRequest: false, noFileWrites: true });
  });
});

describe('physical-run protocol output ownership', () => {
  it('emits the visible reply as it streams and returns the withheld tail at close', () => {
    const visible = 'Discuss this JSON: {"runtimeState":{"example":true}}.\n';
    const text = `${visible}${machineBlock('open-design-runtime-state', { noFileWrites: true })}`;
    const stream = createOdNextRunProtocol();
    let emitted = '';
    for (let index = 0; index < text.length; index += 7) emitted += stream.push(text.slice(index, index + 7));
    const finished = stream.finish();
    emitted += finished.visibleTail;
    expect(finished.parsed.visibleText).toBe(visible);
    expect(finished.parsed.declarations).toEqual({ nonDesignRequest: false, noFileWrites: true });
    expect(emitted).toBe(visible);
  });

  it('handles a close-time withheld text tail', () => {
    const stream = createOdNextRunProtocol();
    const text = 'Example: <open-design-runtime-sta';
    const emitted = stream.push(text);
    const finished = stream.finish();
    expect(finished.parsed.visibleText).toBe(text);
    expect(emitted + finished.visibleTail).toBe(text);
  });
});

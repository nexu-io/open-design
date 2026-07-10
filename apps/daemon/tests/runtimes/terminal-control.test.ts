import { describe, expect, it } from 'vitest';
import {
  stripTerminalControlSequences,
  TerminalControlSequenceStripper,
} from '../../src/runtimes/terminal-control.js';

describe('terminal control sequence stripping', () => {
  it('removes OSC title/progress updates from visible text', () => {
    const input = '\u001b]9;4;1\u0007hello \u001b]0;🐳 CodeWhale\u0007world';

    expect(stripTerminalControlSequences(input)).toBe('hello world');
  });

  it('removes CSI ANSI sequences from visible text', () => {
    const input = 'hello \u001b[31mred\u001b[0m world';

    expect(stripTerminalControlSequences(input)).toBe('hello red world');
  });

  it('buffers split OSC sequences so partial terminal noise does not leak', () => {
    const stripper = new TerminalControlSequenceStripper();

    expect(stripper.write('hello \u001b]0;🐳 Code')).toBe('hello ');
    expect(stripper.write('Whale\u0007world')).toBe('world');
    expect(stripper.flush()).toBe('');
  });
});

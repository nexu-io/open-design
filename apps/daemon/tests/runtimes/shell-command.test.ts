import { describe, expect, it } from 'vitest';
import {
  buildCommandShellCommand,
  buildGhShellCommand,
  buildLoginShellCommand,
  quotePosixShellArg,
} from '../../src/runtimes/shell-command.js';

describe('shell command helpers', () => {
  it('quotes empty, whitespace, and metacharacter-bearing arguments', () => {
    expect(quotePosixShellArg('')).toBe("''");
    expect(quotePosixShellArg("$(touch /tmp/pwned); 'quoted'\nnext")).toBe(
      "'$(touch /tmp/pwned); '\\''quoted'\\''\nnext'",
    );
  });

  it('builds GitHub and arbitrary commands with every token quoted', () => {
    expect(buildGhShellCommand(['auth', 'status', '--hostname', 'github.com'])).toBe(
      "'gh' 'auth' 'status' '--hostname' 'github.com'",
    );
    expect(buildCommandShellCommand('/tmp/agent', ['--name', 'a; rm -rf /'])).toBe(
      "'/tmp/agent' '--name' 'a; rm -rf /'",
    );
  });

  it('exports PATH as a quoted assignment before the command', () => {
    expect(buildLoginShellCommand("'gh' '--version'", '/tmp/bin:/opt/bin')).toBe(
      "export PATH='/tmp/bin:/opt/bin'; 'gh' '--version'",
    );
  });
});

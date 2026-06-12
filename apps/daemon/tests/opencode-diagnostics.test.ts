import { describe, expect, it } from 'vitest';
import { diagnoseOpenCodeCliFailure } from '../src/opencode-diagnostics.js';

describe('diagnoseOpenCodeCliFailure', () => {
  // Repro from #4201: a globally installed `opencode-cli` that predates the
  // flags Open Design now passes (`run --format json`) dumps its own help
  // text to stderr and exits 1. The surfaced error today is the raw
  // `exit 1 · stderr: , json) (default "text") -p, --prompt string ...`
  // help-fragment, which gives the user no indication that updating the CLI
  // is the fix.
  it('maps the outdated opencode-cli help-text dump to an update hint (#4201)', () => {
    const stderrTail =
      ', json) (default "text") ' +
      '-p, --prompt string Prompt to run in non-interactive mode ' +
      '-q, --quiet Hide spinner in non-interactive mode ' +
      '-v, --version Version.';

    const diagnostic = diagnoseOpenCodeCliFailure({
      agentId: 'opencode',
      exitCode: 1,
      stderrTail,
    });

    expect(diagnostic).not.toBeNull();
    expect(diagnostic?.message.toLowerCase()).toContain('opencode');
    expect(diagnostic?.message.toLowerCase()).toContain('too old');
    expect(diagnostic?.detail).toContain('npm i -g opencode-ai@latest');
    expect(diagnostic?.detail.toLowerCase()).toContain('does not update it for you');
    expect(diagnostic?.code).toBe('AGENT_CLI_OUTDATED');
  });

  it('includes the resolved binary path in the detail when available', () => {
    const diagnostic = diagnoseOpenCodeCliFailure({
      agentId: 'opencode',
      exitCode: 1,
      stderrTail:
        '-p, --prompt string Prompt to run in non-interactive mode ' +
        '-v, --version Version',
      resolvedBin: '/usr/local/bin/opencode-cli',
    });

    expect(diagnostic?.detail).toContain('/usr/local/bin/opencode-cli');
  });

  it('does not classify failures from a different agent id', () => {
    const diagnostic = diagnoseOpenCodeCliFailure({
      agentId: 'codex',
      exitCode: 1,
      stderrTail:
        '-p, --prompt string Prompt to run in non-interactive mode ' +
        '-q, --quiet Hide spinner in non-interactive mode',
    });

    expect(diagnostic).toBeNull();
  });

  it('does not fire on clean exits', () => {
    const diagnostic = diagnoseOpenCodeCliFailure({
      agentId: 'opencode',
      exitCode: 0,
      stderrTail:
        '-p, --prompt string Prompt to run in non-interactive mode',
    });

    expect(diagnostic).toBeNull();
  });

  it('does not false-positive on a single stray help-text substring', () => {
    // A model error that happens to mention a flag name once should not be
    // misclassified as an outdated-CLI help dump.
    const diagnostic = diagnoseOpenCodeCliFailure({
      agentId: 'opencode',
      exitCode: 1,
      stderrTail:
        'Model error: please pass --prompt explicitly when piping input',
    });

    expect(diagnostic).toBeNull();
  });

  it('does not fire on a generic non-help-text exit', () => {
    const diagnostic = diagnoseOpenCodeCliFailure({
      agentId: 'opencode',
      exitCode: 1,
      stderrTail: 'Error: provider returned 503 Service Unavailable',
    });

    expect(diagnostic).toBeNull();
  });
});

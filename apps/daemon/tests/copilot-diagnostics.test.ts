import { describe, expect, it } from 'vitest';

import { diagnoseCopilotCliFailure } from '../src/copilot-diagnostics.js';

describe('diagnoseCopilotCliFailure', () => {
  it('returns null for non-copilot agents', () => {
    expect(
      diagnoseCopilotCliFailure({
        agentId: 'claude',
        exitCode: 1,
        stderrTail: 'user_weekly_rate_limited',
      }),
    ).toBeNull();
  });

  it('maps Copilot rate-limit output to actionable guidance', () => {
    const diagnostic = diagnoseCopilotCliFailure({
      agentId: 'copilot',
      exitCode: 1,
      stdoutTail: '{"type":"result","success":false,"error":"user_weekly_rate_limited"}',
    });

    expect(diagnostic?.message).toContain('rate limit');
    expect(diagnostic?.detail).toContain('auto');
  });

  it('maps trusted-folder failures to config guidance', () => {
    const diagnostic = diagnoseCopilotCliFailure({
      agentId: 'copilot',
      exitCode: 1,
      stderrTail: 'Directory is not trusted by Copilot CLI',
    });

    expect(diagnostic?.message).toContain('project directory');
    expect(diagnostic?.detail).toContain('trustedFolders');
    expect(diagnostic?.detail).toContain('Open Design');
  });

  it('maps silent exit code 1 to trusted-folder troubleshooting', () => {
    const diagnostic = diagnoseCopilotCliFailure({
      agentId: 'copilot',
      exitCode: 1,
    });

    expect(diagnostic?.message).toContain('exited before producing diagnostics');
    expect(diagnostic?.detail).toContain('trustedFolders');
  });

  it('maps tool permission failures in JSON output to trusted-folder guidance', () => {
    const diagnostic = diagnoseCopilotCliFailure({
      agentId: 'copilot',
      exitCode: 1,
      stdoutTail:
        '{"type":"tool.execution_complete","data":{"success":false,"result":{"content":"access denied outside trusted folder"}}}',
    });

    expect(diagnostic?.message).toContain('project directory');
    expect(diagnostic?.detail).toContain('trustedFolders');
  });
});

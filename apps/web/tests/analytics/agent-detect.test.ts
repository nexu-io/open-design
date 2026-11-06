import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentInfo } from '@open-design/contracts';
import {
  reportAgentDetectDiagnostics,
  resetAgentDetectDiagnosticReporting,
} from '../../src/analytics/agent-detect';

function agent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'deepseek-harness',
    name: 'DeepSeek Harness',
    bin: 'dsh',
    available: false,
    ...overrides,
  };
}

describe('agent detection diagnostics reporting', () => {
  beforeEach(() => {
    resetAgentDetectDiagnosticReporting();
  });

  it('names the agent instead of collapsing it into "other"', () => {
    const track = vi.fn();
    reportAgentDetectDiagnostics(track, [
      agent({
        path: '/Users/someone/.local/bin/dsh',
        version: '0.1.0-rc.8',
        diagnostics: [
          { reason: 'untested-version', severity: 'warning', message: 'untested' },
        ],
      }),
    ]);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0]?.[0]).toBe('agent_detect_diagnostic');
    expect(track.mock.calls[0]?.[1]).toMatchObject({
      area: 'runtime_detection',
      cli_provider_id: 'deepseek_harness',
      reason: 'untested-version',
      severity: 'warning',
      agent_available: false,
      agent_version: '0.1.0-rc.8',
      has_path: true,
    });
  });

  // An agent binary path contains the OS username, so it must never leave the
  // machine. `has_path` carries the only thing the analysis needs: whether the
  // row was renderable at all.
  it('never sends the resolved path', () => {
    const track = vi.fn();
    reportAgentDetectDiagnostics(track, [
      agent({
        path: '/Users/someone/.local/bin/dsh',
        diagnostics: [{ reason: 'shim-broken', severity: 'error', message: 'broken' }],
      }),
    ]);

    expect(JSON.stringify(track.mock.calls[0]?.[1])).not.toContain('someone');
    expect(track.mock.calls[0]?.[1]).toMatchObject({ has_path: true });
  });

  // Detection runs on cold start and on every rescan. Counting each pass would
  // turn one broken install into dozens of events and make the number mean
  // "times Settings was opened" instead of "installs affected".
  it('reports one install once, however many times detection runs', () => {
    const track = vi.fn();
    const scanned = [
      agent({
        version: '0.1.0-rc.6',
        diagnostics: [{ reason: 'shim-broken', severity: 'error', message: 'broken' }],
      }),
    ];

    reportAgentDetectDiagnostics(track, scanned);
    reportAgentDetectDiagnostics(track, scanned);
    reportAgentDetectDiagnostics(track, scanned);

    expect(track).toHaveBeenCalledTimes(1);
  });

  // ...but a user who upgrades the CLI and still fails is a different fact.
  it('reports again when the version changed', () => {
    const track = vi.fn();
    const diagnostics: AgentInfo['diagnostics'] = [
      { reason: 'shim-broken', severity: 'error', message: 'broken' },
    ];

    reportAgentDetectDiagnostics(track, [agent({ version: '0.1.0-rc.6', diagnostics })]);
    reportAgentDetectDiagnostics(track, [agent({ version: '0.1.0-rc.8', diagnostics })]);

    expect(track).toHaveBeenCalledTimes(2);
  });

  it('ignores healthy agents and info-level notes', () => {
    const track = vi.fn();
    reportAgentDetectDiagnostics(track, [
      agent({ id: 'claude', available: true }),
      agent({
        id: 'codex',
        available: true,
        diagnostics: [{ reason: 'auth-unknown', severity: 'info', message: 'fyi' }],
      }),
    ]);

    expect(track).not.toHaveBeenCalled();
  });
});

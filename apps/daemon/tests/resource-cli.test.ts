import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runVelaCommandMock } = vi.hoisted(() => ({
  runVelaCommandMock: vi.fn(),
}));

vi.mock('../src/integrations/vela-command.js', () => ({
  runVelaCommand: runVelaCommandMock,
}));

import { runResource } from '../src/resource-cli.js';

describe('od resource Vela compatibility entry point', () => {
  beforeEach(() => {
    process.exitCode = undefined;
    runVelaCommandMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it('forwards resource arguments to the login-backed Vela CLI', async () => {
    runVelaCommandMock.mockResolvedValue('{"version":3}\n');
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runResource([
      'push',
      'project',
      'project-1',
      '/tmp/project-1',
      '--json',
    ]);

    expect(runVelaCommandMock).toHaveBeenCalledWith([
      'resource',
      'push',
      'project',
      'project-1',
      '/tmp/project-1',
      '--json',
    ]);
    expect(write).toHaveBeenCalledWith('{"version":3}\n');
  });

  it('shows Vela resource help when no subcommand is provided', async () => {
    runVelaCommandMock.mockResolvedValue('resource help\n');
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await runResource([]);

    expect(runVelaCommandMock).toHaveBeenCalledWith(['resource', '--help']);
  });

  it('surfaces Vela errors as a failed od command', async () => {
    runVelaCommandMock.mockRejectedValue(new Error('profile is not logged in'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runResource(['shared', '--json']);

    expect(error).toHaveBeenCalledWith('profile is not logged in');
    expect(process.exitCode).toBe(1);
  });
});

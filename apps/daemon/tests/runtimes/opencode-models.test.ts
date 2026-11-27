import { afterEach, describe, expect, it, vi } from 'vitest';

const execAgentFileMock = vi.hoisted(() => vi.fn());

vi.mock('../../src/runtimes/invocation.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/runtimes/invocation.js')>();
  return { ...actual, execAgentFile: execAgentFileMock };
});

import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import { opencodeAgentDef } from '../../src/runtimes/defs/opencode.js';
import { rememberLiveModels, resetLiveModelsForTests } from '../../src/runtimes/models.js';

const OPENCODE_2X_CAPS = {
  skipPermissions: false,
  autoApprove: true,
  workspaceDir: false,
  variantFlag: false,
  pureMode: false,
};

const OPENCODE_1X_CAPS = {
  skipPermissions: true,
  autoApprove: false,
  workspaceDir: true,
  variantFlag: true,
  pureMode: true,
};

function fetchModels(caps: Record<string, boolean> | null) {
  return opencodeAgentDef.fetchModels!('/opt/open-design/opencode', {}, Promise.resolve(caps));
}

afterEach(() => {
  execAgentFileMock.mockReset();
  agentCapabilities.delete('opencode');
  resetLiveModelsForTests();
});

describe('opencode model detection', () => {
  it('reads the plain 2.x catalog without probing --verbose', async () => {
    execAgentFileMock.mockResolvedValue({
      stdout: 'opencode/glm-5.3-flash-free\nopencode/big-pickle\n',
      stderr: '',
    });

    const models = await fetchModels(OPENCODE_2X_CAPS);

    // 2.x never runs the doomed `models --verbose` probe.
    expect(execAgentFileMock).not.toHaveBeenCalledWith(
      '/opt/open-design/opencode',
      ['models', '--verbose'],
      expect.anything(),
    );
    expect(execAgentFileMock).toHaveBeenCalledWith(
      '/opt/open-design/opencode',
      ['models'],
      expect.anything(),
    );
    expect(models?.map((model) => model.id)).toEqual([
      'default',
      'opencode/glm-5.3-flash-free',
      'opencode/big-pickle',
    ]);
  });

  it('takes 2.x variant metadata from the server catalog and forwards it as model#variant', async () => {
    execAgentFileMock.mockImplementation(async (_bin: string, args: string[]) => {
      if (args[0] === 'models') {
        return { stdout: 'opencode/glm-5.3-flash-free\nopencode/big-pickle\n', stderr: '' };
      }
      if (args[0] === 'api') {
        return {
          stdout: JSON.stringify([
            {
              providerID: 'opencode',
              modelID: 'glm-5.3-flash-free',
              variants: [{ id: 'low' }, { id: 'high' }, { id: 'max' }],
            },
            { providerID: 'opencode', modelID: 'big-pickle', variants: [] },
          ]),
          stderr: '',
        };
      }
      throw new Error(`unexpected argv: ${args.join(' ')}`);
    });

    const models = await fetchModels(OPENCODE_2X_CAPS);

    expect(execAgentFileMock).toHaveBeenCalledWith(
      '/opt/open-design/opencode',
      ['api', 'GET', '/api/model'],
      expect.anything(),
    );
    expect(models?.find((model) => model.id === 'opencode/glm-5.3-flash-free')?.reasoningOptions)
      .toEqual([
        { id: 'default', label: 'Default' },
        { id: 'low', label: 'low' },
        { id: 'high', label: 'high' },
        { id: 'max', label: 'max' },
      ]);
    expect(models?.find((model) => model.id === 'opencode/big-pickle')?.reasoningOptions)
      .toBeUndefined();

    // End to end: a detected 2.x catalog reaches buildArgs as `-m model#variant`
    // instead of being rejected for missing variant metadata.
    rememberLiveModels('opencode', models ?? []);
    agentCapabilities.set('opencode', OPENCODE_2X_CAPS);
    expect(opencodeAgentDef.buildArgs('', [], [], {
      model: 'opencode/glm-5.3-flash-free',
      reasoning: 'high',
    })).toEqual([
      'run',
      '--format',
      'json',
      '--auto',
      '-m',
      'opencode/glm-5.3-flash-free#high',
    ]);
  });

  it('keeps remembered 2.x variant metadata when the server catalog is unavailable', async () => {
    rememberLiveModels('opencode', [
      { id: 'default', label: 'Default (CLI config)' },
      {
        id: 'opencode/beam-free',
        label: 'opencode/beam-free',
        reasoningOptions: [
          { id: 'default', label: 'Default' },
          { id: 'max', label: 'max' },
        ],
      },
    ]);
    execAgentFileMock.mockImplementation(async (_bin: string, args: string[]) => {
      if (args[0] === 'models') return { stdout: 'opencode/beam-free\n', stderr: '' };
      throw Object.assign(new Error('api unavailable'), { stdout: '', stderr: 'server down' });
    });

    const models = await fetchModels(OPENCODE_2X_CAPS);

    expect(models?.find((model) => model.id === 'opencode/beam-free')?.reasoningOptions)
      .toEqual([
        { id: 'default', label: 'Default' },
        { id: 'max', label: 'max' },
      ]);
  });

  it('still reads 1.x variants from models --verbose and never calls the api', async () => {
    execAgentFileMock.mockResolvedValue({
      stdout: 'opencode/glm-5.3-flash-free\n{ "variants": { "high": {} } }\n',
      stderr: '',
    });

    const models = await fetchModels(OPENCODE_1X_CAPS);

    expect(execAgentFileMock).toHaveBeenCalledTimes(1);
    expect(execAgentFileMock).toHaveBeenCalledWith(
      '/opt/open-design/opencode',
      ['models', '--verbose'],
      expect.anything(),
    );
    expect(models?.find((model) => model.id === 'opencode/glm-5.3-flash-free')?.reasoningOptions)
      .toEqual([
        { id: 'default', label: 'Default' },
        { id: 'high', label: 'high' },
      ]);
  });

  it('parses the plain catalog when the capability probe could not identify the CLI', async () => {
    // OpenCode 2.0.24 rejects `models --verbose` by printing `models --help`
    // and exiting 1 with no "Unrecognized flag" text. Detection must not read
    // that rejection as "unknown failure" and drop to the static fallback.
    execAgentFileMock.mockImplementation(async (_bin: string, args: string[]) => {
      if (args[0] === 'models' && args[1] === '--verbose') {
        throw Object.assign(new Error('exit 1'), {
          stdout: 'DESCRIPTION\n  List all available models\n',
          stderr: '',
        });
      }
      if (args[0] === 'models') return { stdout: 'opencode/big-pickle\n', stderr: '' };
      throw new Error(`unexpected argv: ${args.join(' ')}`);
    });

    const models = await fetchModels(null);

    expect(models?.map((model) => model.id)).toEqual(['default', 'opencode/big-pickle']);
  });
});

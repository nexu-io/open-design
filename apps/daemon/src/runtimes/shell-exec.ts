import {
  buildCommandShellCommand,
  buildGhShellCommand,
  buildLoginShellCommand,
} from './shell-command.js';
import {
  execFileBuffered as defaultExecFileBuffered,
  type BufferedCommandOptions,
  type BufferedCommandResult,
} from './child-process.js';

export interface ShellCommandRunner {
  execFileBuffered(command: string, args: readonly string[], options?: BufferedCommandOptions): Promise<BufferedCommandResult>;
  execGhBuffered(args: readonly string[], options?: BufferedCommandOptions): Promise<BufferedCommandResult>;
  execCommandViaLoginShell(command: string, args: readonly string[], options?: BufferedCommandOptions): Promise<BufferedCommandResult>;
}

export function createShellCommandRunner(options: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  execFileBuffered?: typeof defaultExecFileBuffered;
} = {}): ShellCommandRunner {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const execFileBuffered = options.execFileBuffered ?? defaultExecFileBuffered;

  const run = (
    command: string,
    args: readonly string[],
    commandOptions: BufferedCommandOptions = {},
  ): Promise<BufferedCommandResult> => execFileBuffered(command, args, {
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
    ...commandOptions,
  });

  return {
    execFileBuffered: run,
    execGhBuffered(args, commandOptions = {}) {
      if (platform === 'win32') return run('gh', args, commandOptions);
      const shell = env.SHELL?.trim() || '/bin/zsh';
      return run(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
        env,
        ...commandOptions,
      });
    },
    execCommandViaLoginShell(command, args, commandOptions = {}) {
      if (platform === 'win32') return run(command, args, commandOptions);
      const shell = env.SHELL?.trim() || '/bin/zsh';
      return run(shell, ['-c', buildLoginShellCommand(buildCommandShellCommand(command, args))], {
        env,
        ...commandOptions,
      });
    },
  };
}

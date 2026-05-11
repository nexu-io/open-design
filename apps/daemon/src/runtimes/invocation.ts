import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createCommandInvocation } from '@open-design/platform';
import type { RuntimeExecOptions } from './types.js';

const execFileP = promisify(execFile);

export function execAgentFile(
  command: string,
  args: string[],
  options: RuntimeExecOptions = {},
) {
  const invocation = createCommandInvocation(
    options.env
      ? {
          command,
          args,
          env: options.env,
        }
      : {
          command,
          args,
        },
  );
  return execFileP(invocation.command, invocation.args, {
    ...options,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

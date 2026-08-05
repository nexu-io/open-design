import { runVelaCommand } from './integrations/vela-command.js';

/**
 * `od resource` is a compatibility entry point for the login-backed Vela
 * resource drive. Open Design intentionally owns no Resource Hub credentials
 * or content-addressed transfer implementation.
 */
export async function runResource(args: string[]): Promise<void> {
  try {
    const stdout = await runVelaCommand([
      'resource',
      ...(args.length > 0 ? args : ['--help']),
    ]);
    if (stdout) process.stdout.write(stdout);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'vela resource command failed');
    process.exitCode = 1;
  }
}

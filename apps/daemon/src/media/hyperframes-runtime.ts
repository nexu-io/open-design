import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

export const HYPERFRAMES_CLI_ENV = 'OD_HYPERFRAMES_BIN';

export function resolveHyperFramesCliPath({
  env = process.env,
  resolvePackage = require.resolve,
}: {
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  resolvePackage?: (id: string) => string;
} = {}): string {
  const configured = env[HYPERFRAMES_CLI_ENV]?.trim();
  if (configured) return configured;

  try {
    const manifestPath = resolvePackage('hyperframes/package.json');
    return path.join(path.dirname(manifestPath), 'bin', 'hyperframes.mjs');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Bundled HyperFrames CLI is unavailable. Reinstall Open Design so its pinned ` +
        `HyperFrames runtime and native dependencies match this platform. ${detail}`,
    );
  }
}

export function resolveHyperFramesNodeBin(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
  execPath: string = process.execPath,
): string {
  return env.OD_NODE_BIN?.trim() || execPath;
}

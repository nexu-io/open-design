import { access, constants } from 'node:fs/promises';

const VELA_RUNTIME_LAZY_ENV = 'OD_VELA_RUNTIME_LAZY';
const DEFAULT_VELA_RUNTIME_WAIT_MS = 120_000;
const DEFAULT_VELA_RUNTIME_POLL_MS = 100;

const pendingByBinary = new Map<string, Promise<void>>();

export function isLazyVelaRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[VELA_RUNTIME_LAZY_ENV] === '1';
}

async function executableExists(path: string): Promise<boolean> {
  try {
    await access(path, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait only for a Closure-owned lazy runtime; ordinary missing overrides fail immediately. */
export async function waitForLazyVelaRuntime(
  env: NodeJS.ProcessEnv = process.env,
  options: Readonly<{ pollMs?: number; timeoutMs?: number }> = {},
): Promise<void> {
  if (!isLazyVelaRuntime(env)) return;
  const binary = env.VELA_BIN?.trim();
  if (!binary || await executableExists(binary)) return;
  const existing = pendingByBinary.get(binary);
  if (existing != null) return await existing;
  const timeoutMs = options.timeoutMs ?? DEFAULT_VELA_RUNTIME_WAIT_MS;
  const pollMs = options.pollMs ?? DEFAULT_VELA_RUNTIME_POLL_MS;
  const pending = (async () => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await delay(pollMs);
      if (await executableExists(binary)) return;
    }
    throw new Error(`Vela runtime materialization timed out after ${timeoutMs}ms`);
  })().finally(() => {
    pendingByBinary.delete(binary);
  });
  pendingByBinary.set(binary, pending);
  return await pending;
}

import { runChatGptMcpStdio } from '../../../apps/daemon/src/mcp.js';

const DEFAULT_DAEMON_URL = 'http://127.0.0.1:7456';
const LOCAL_TEST_DAEMON_URL = 'http://127.0.0.1:18456';

async function isReachable(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/health`, {
      signal: AbortSignal.timeout(750),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveDaemonUrl(): Promise<string> {
  const candidates = [
    process.env.OD_DAEMON_URL,
    LOCAL_TEST_DAEMON_URL,
    DEFAULT_DAEMON_URL,
  ].filter((candidate): candidate is string => Boolean(candidate));
  for (const candidate of [...new Set(candidates)]) {
    if (await isReachable(candidate)) return candidate;
  }
  return process.env.OD_DAEMON_URL || DEFAULT_DAEMON_URL;
}

await runChatGptMcpStdio({ daemonUrl: await resolveDaemonUrl() });

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { networkInterfaces } from 'node:os';

import { parseMacosScutilProxyOutput, parseWindowsInternetSettingsProxyOutput } from '@open-design/platform';

const MAX_CONFIG_LENGTH = 4096;

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/** Keep endpoint correlation without exporting credentials, hostnames, paths or PAC URLs. */
function proxyEndpoint(value: string | undefined) {
  if (!value) return { configured: false };
  if (value.length > MAX_CONFIG_LENGTH) return { configured: true, valid: false };
  try {
    const url = new URL(value.includes('://') ? value : `http://${value}`);
    if (!['http:', 'https:', 'socks:', 'socks5:', 'socks5h:'].includes(url.protocol)) {
      return { configured: true, valid: false };
    }
    return {
      configured: true,
      valid: true,
      protocol: url.protocol.slice(0, -1),
      port: url.port || null,
      endpointFingerprint: fingerprint(`${url.protocol}//${url.host}`),
      loopback: ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname),
      credentialsPresent: Boolean(url.username || url.password),
    };
  } catch {
    return { configured: true, valid: false };
  }
}

/** Only this allowlist may enter diagnostics; never serialize an environment object. */
export function summarizeProxyEnvironment(env: NodeJS.ProcessEnv) {
  const bypass = (env.NO_PROXY ?? env.no_proxy ?? '').slice(0, MAX_CONFIG_LENGTH);
  return {
    http: proxyEndpoint(env.HTTP_PROXY ?? env.http_proxy),
    https: proxyEndpoint(env.HTTPS_PROXY ?? env.https_proxy),
    all: proxyEndpoint(env.ALL_PROXY ?? env.all_proxy),
    noProxy: {
      configured: Boolean(bypass),
      wildcard: bypass.trim() === '*',
      fingerprint: bypass ? fingerprint(bypass) : null,
    },
    nodeUseEnvProxy: env.NODE_USE_ENV_PROXY === '1',
  };
}

export type DiagnosticProxyEnvironment = ReturnType<typeof summarizeProxyEnvironment>;

export function diagnosticId(value: unknown): string | null {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value) ? value : null;
}

export type DiagnosticFailureCode = 'timeout' | 'aborted' | 'dns' | 'connection-refused' | 'tls' | 'proxy' | 'http' | 'other';

/** Error text, argv, stdout and stderr can contain secrets. Never retain them. */
export function diagnosticFailureCode(error: unknown): DiagnosticFailureCode {
  if (typeof error !== 'object' || error === null) return 'other';
  const candidate = error as { code?: unknown; name?: unknown; cause?: { code?: unknown } };
  const code = candidate.code ?? candidate.cause?.code;
  if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(String(code)) || candidate.name === 'TimeoutError') return 'timeout';
  if (code === 'ABORT_ERR' || candidate.name === 'AbortError') return 'aborted';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
  if (code === 'ECONNREFUSED') return 'connection-refused';
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'].includes(String(code))) return 'tls';
  const stderr = (error as { stderr?: unknown }).stderr;
  const tail = typeof stderr === 'string' ? stderr.slice(-4096) : '';
  if (/proxyconnect|proxy authentication required/i.test(tail)) return 'proxy';
  if (/context deadline exceeded|Client\.Timeout/i.test(tail)) return 'timeout';
  if (/x509:|certificate verify failed/i.test(tail)) return 'tls';
  if (/no such host/i.test(tail)) return 'dns';
  return 'other';
}

export interface SystemEnvironmentSnapshot {
  sampledAt: string;
  status: 'collected' | 'unavailable' | 'unsupported';
  systemProxy: DiagnosticProxyEnvironment | null;
  pacConfigured: boolean | null;
  daemonProxy: DiagnosticProxyEnvironment;
  interfaces: { ipv4: number; ipv6: number } | null;
}

function runSystemQuery(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: 1500, killSignal: 'SIGKILL', maxBuffer: 64 * 1024, windowsHide: true, encoding: 'utf8' }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/** On-demand only: no requests to the network, process scans or synchronous subprocesses. */
export async function collectSystemEnvironment(options: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  query?: typeof runSystemQuery;
  interfaces?: typeof networkInterfaces;
} = {}): Promise<SystemEnvironmentSnapshot> {
  const platform = options.platform ?? process.platform;
  const snapshot: SystemEnvironmentSnapshot = {
    sampledAt: new Date().toISOString(),
    status: 'unsupported',
    systemProxy: null,
    pacConfigured: null,
    daemonProxy: summarizeProxyEnvironment(options.env ?? process.env),
    interfaces: null,
  };
  try {
    const counts = { ipv4: 0, ipv6: 0 };
    for (const addresses of Object.values((options.interfaces ?? networkInterfaces)())) {
      for (const address of addresses ?? []) {
        if (address.internal) continue;
        if (address.family === 'IPv4') counts.ipv4 += 1;
        if (address.family === 'IPv6') counts.ipv6 += 1;
      }
    }
    snapshot.interfaces = counts;
    const query = options.query ?? runSystemQuery;
    if (platform === 'win32') {
      const output = await query('reg.exe', ['query', String.raw`HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings`]);
      snapshot.systemProxy = summarizeProxyEnvironment(parseWindowsInternetSettingsProxyOutput({
        proxyEnable: output, proxyServer: output, proxyOverride: output,
      }));
      snapshot.pacConfigured = /AutoConfigURL\s+REG_\w+\s+\S+/i.test(output);
      snapshot.status = 'collected';
    } else if (platform === 'darwin') {
      const output = await query('/usr/sbin/scutil', ['--proxy']);
      snapshot.systemProxy = summarizeProxyEnvironment(parseMacosScutilProxyOutput(output));
      snapshot.pacConfigured = /ProxyAutoConfigEnable\s*:\s*1/.test(output);
      snapshot.status = 'collected';
    }
  } catch {
    snapshot.status = 'unavailable';
  }
  return snapshot;
}

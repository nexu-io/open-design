import type { NextConfig } from 'next';
import { networkInterfaces } from 'node:os';
import { dirname, isAbsolute, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Daemon port the local Express server binds to (see apps/daemon/src/cli.ts). The
// dev-all launcher overrides OD_PORT after probing for a free port; we read
// the same env so /api, /artifacts, and /frames always reach the right
// daemon instance during `next dev`.
const DAEMON_PORT = Number(process.env.OD_PORT) || 7456;
const DAEMON_ORIGIN = `http://127.0.0.1:${DAEMON_PORT}`;

// The regular CLI build still ships as a static export so the `od` daemon can
// serve a single-process production build. Packaged desktop builds opt into a
// server runtime with OD_WEB_OUTPUT_MODE=server; in that mode the web sidecar
// owns the Next.js SSR server and proxies daemon routes at runtime. The
// packaged-size standalone spike uses OD_WEB_OUTPUT_MODE=standalone to ask
// Next.js for a traced standalone server while keeping the sidecar-owned daemon
// proxy in front of it at runtime.
const isProd = process.env.NODE_ENV !== 'development';
const webOutputMode = process.env.OD_WEB_OUTPUT_MODE;
const isServerOutput = webOutputMode === 'server' || webOutputMode === 'standalone';
const shouldStaticExport = isProd && !isServerOutput;

const WEB_ROOT = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = dirname(dirname(WEB_ROOT));
const toPosixPath = (value: string) => value.replaceAll('\\', '/');

function resolveDistDir(defaultValue: string) {
  if (process.env.OD_WEB_PROD === '1') return defaultValue;
  const configured = process.env.OD_WEB_DIST_DIR;
  if (!configured) return defaultValue;
  return toPosixPath(isAbsolute(configured) ? relative(WEB_ROOT, configured) || '.' : configured);
}

const DIST_DIR = resolveDistDir(isProd ? (shouldStaticExport ? 'out' : '.next') : '.next');

function resolveDevTsconfigPath() {
  const configured = process.env.OD_WEB_TSCONFIG_PATH;
  if (!configured) return undefined;
  return toPosixPath(isAbsolute(configured) ? relative(WEB_ROOT, configured) || 'tsconfig.json' : configured);
}

const DEV_TSCONFIG_PATH = resolveDevTsconfigPath();

function parseAllowedDevHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`http://${trimmed}`).hostname.toLowerCase();
    } catch {
      return null;
    }
  }
}

function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  if (!parts.every((part) => /^\d+$/.test(part))) return null;
  const octets = parts.map((part) => Number(part));
  if (!octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)) return null;
  return octets as [number, number, number, number];
}

function isPrivateLanIpv4(value: string): boolean {
  const octets = parseIpv4(value);
  if (octets == null) return false;
  const [a, b] = octets;
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function localPrivateLanHosts(): string[] {
  return Object.values(networkInterfaces())
    .flatMap((entries) => entries ?? [])
    .filter((entry) => entry.family === 'IPv4' && !entry.internal && isPrivateLanIpv4(entry.address))
    .map((entry) => entry.address);
}

function configuredAllowedDevHosts(): string[] {
  const configured = (process.env.OD_ALLOWED_DEV_ORIGINS ?? '')
    .split(',')
    .map(parseAllowedDevHost)
    .filter((host): host is string => host != null);

  const bindHost = parseAllowedDevHost(process.env.OD_HOST ?? '');
  return Array.from(new Set([
    '127.0.0.1',
    ...localPrivateLanHosts(),
    ...(bindHost != null && bindHost !== '0.0.0.0' && bindHost !== '::' ? [bindHost] : []),
    ...configured,
  ]));
}

const nextConfig: NextConfig = {
  allowedDevOrigins: configuredAllowedDevHosts(),
  outputFileTracingRoot: WORKSPACE_ROOT,
  reactStrictMode: true,
  turbopack: {
    root: WORKSPACE_ROOT,
  },
  ...(DEV_TSCONFIG_PATH ? { typescript: { tsconfigPath: DEV_TSCONFIG_PATH } } : {}),
  // Keep the bundle output predictable so the daemon's STATIC_DIR can point
  // at it without any glob trickery.
  distDir: DIST_DIR,
  ...(shouldStaticExport
    ? {
        output: 'export' as const,
        // `next export` skips trailing slashes by default; opting in keeps
        // the daemon's static fallback simple (every directory has its own
        // index.html on disk).
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : webOutputMode === 'standalone'
      ? {
        output: 'standalone' as const,
      }
      : !isProd
      ? {
        async rewrites() {
          // In dev we run the daemon on a sibling port; proxy the app API
          // proxy so the SPA can hit /api, /artifacts, and /frames without
          // CORS gymnastics. SSE on /api/chat works through this rewrite
          // because Next.js's dev server streams responses unbuffered.
          return [
            { source: '/api/:path*', destination: `${DAEMON_ORIGIN}/api/:path*` },
            { source: '/artifacts/:path*', destination: `${DAEMON_ORIGIN}/artifacts/:path*` },
            { source: '/frames/:path*', destination: `${DAEMON_ORIGIN}/frames/:path*` },
          ];
        },
        devIndicators: {
          position: 'bottom-right',
        },
      }
      : {}),
};

export default nextConfig;

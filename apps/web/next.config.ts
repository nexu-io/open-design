import type { NextConfig } from 'next';

// Daemon port the local Express server binds to (see apps/daemon/cli.js). The
// dev-all launcher overrides OD_PORT after probing for a free port; we read
// the same env so /api, /artifacts, and /frames always reach the right
// daemon instance during `next dev`.
const DAEMON_PORT = Number(process.env.OD_PORT) || 7456;
const DAEMON_ORIGIN = `http://127.0.0.1:${DAEMON_PORT}`;

// We ship as a static export so the existing `od` daemon can keep serving a
// single-process production build (out/ replaces the old dist/). Project IDs
// are unbounded user input, so we route everything through a single optional
// catch-all client page (`app/[[...slug]]/page.tsx`) that reads the URL at
// runtime — Next.js generates one shell HTML, the daemon falls back to it
// for any non-API request, and the existing client router renders the right
// view.
const isProd = process.env.NODE_ENV !== 'development';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  reactStrictMode: true,
  // Keep the bundle output predictable so the daemon's STATIC_DIR can point
  // at it without any glob trickery.
  distDir: isProd ? 'out' : '.next',
  ...(isProd
    ? {
        output: 'export' as const,
        // `next export` skips trailing slashes by default; opting in keeps
        // the daemon's static fallback simple (every directory has its own
        // index.html on disk).
        trailingSlash: true,
        images: { unoptimized: true },
      }
    : {
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
      }),
};

export default nextConfig;

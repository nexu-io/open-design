import { ClientApp } from './client-app';

// The whole product is a client-driven SPA: project IDs and file paths are
// unbounded user input, so we route every URL through this single optional
// catch-all and let the existing client router (src/router.ts, which reads
// window.location at runtime) decide what to render.
//
// For `output: 'export'` we return a single empty `slug` so Next.js emits
// one shell HTML at out/index.html; the daemon's SPA fallback (see
// apps/daemon/src/server.ts) serves it for any unknown non-API path so deep
// links still hydrate to the right view.
export function generateStaticParams() {
  return [{ slug: [] }];
}

export default function Page() {
  return <ClientApp />;
}

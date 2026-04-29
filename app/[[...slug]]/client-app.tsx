'use client';

import dynamic from 'next/dynamic';

// The product is a fully client-driven SPA, so every browser-only read stays
// inside the client bundle while Next still emits a static shell HTML.
const App = dynamic(() => import('../../src/App').then((m) => m.App), {
  ssr: false,
  loading: () => <div className="od-loading-shell">Loading OneShot Design...</div>,
});

export function ClientApp() {
  return <App />;
}

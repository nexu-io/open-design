import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const local = (file: string) => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  root: local('./'),
  plugins: [react(), tailwindcss()],
  define: { __STUDIO_VERSION__: JSON.stringify('0.9.7'), ...(!process.env.VITEST ? { 'import.meta.env.VITE_HYPERFRAMES_NO_TELEMETRY': JSON.stringify('1') } : {}) },
  resolve: { alias: { canvas: local('./src/shims/canvasBrowserStub.js') } },
  build: { outDir: 'build', assetsDir: 'editor-assets', emptyOutDir: true, sourcemap: true, chunkSizeWarningLimit: 4500 },
});

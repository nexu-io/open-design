// Documents the Express mount-prefix behavior that the probe-path fix
// relies on: app.use('/api', handler) strips '/api' from req.path, so
// the openProbePaths set must use the stripped form ('/health', not
// '/api/health'). The production regression is covered in
// api-token-guard.test.ts via startServer() + X-Forwarded-For.

import { describe, expect, it } from 'vitest';
import express from 'express';

describe('open probe paths', () => {
  it('Express strips mount prefix from req.path inside app.use("/api")', async () => {
    const app = express();
    const capturedPaths: string[] = [];

    app.use('/api', (req, _res, next) => {
      capturedPaths.push(req.path);
      next();
    });
    app.get('/api/health', (_req, res) => res.status(200).json({ ok: true }));

    const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const { port } = server.address() as { port: number };
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      await fetch(`${baseUrl}/api/health`);
      expect(capturedPaths).toContain('/health');
      expect(capturedPaths).not.toContain('/api/health');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

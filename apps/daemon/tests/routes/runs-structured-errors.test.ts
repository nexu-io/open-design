import express, { type Response } from 'express';
import type http from 'node:http';
import { describe, expect, it, vi } from 'vitest';

import { sendApiError } from '../../src/http/api-errors.js';
import {
  registerRunCreateRoute,
  sendStructuredRunCreateFailure,
} from '../../src/routes/runs.js';

describe('Run creation structured failures', () => {
  it('returns sanitized JSON when preparation throws at the HTTP boundary', async () => {
    const app = express();
    app.use(express.json());
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    registerRunCreateRoute(
      app,
      async () => {
        throw Object.assign(new Error('secret input at C:\\private\\prompt.txt'), { code: 'EPERM' });
      },
      sendApiError as Parameters<typeof registerRunCreateRoute>[2],
    );
    const server = await new Promise<http.Server>((resolve) => {
      const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
    });

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('missing test server address');
      const response = await fetch(`http://127.0.0.1:${address.port}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      const text = await response.text();

      expect(response.status).toBe(500);
      expect(response.headers.get('content-type')).toContain('application/json');
      expect(JSON.parse(text)).toMatchObject({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Run preparation failed.',
          requestId: expect.any(String),
        },
      });
      expect(text).not.toContain('private');
      expect(text).not.toContain('secret input');
    } finally {
      consoleError.mockRestore();
      await new Promise<void>((resolve, reject) => server.close((error) => {
        if (error) reject(error);
        else resolve();
      }));
    }
  });

  it('returns a traceable JSON error without exposing the underlying failure', () => {
    const sendApiError = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = {} as Response;

    try {
      sendStructuredRunCreateFailure(
        res,
        sendApiError,
        Object.assign(new Error('secret input at C:\\private\\prompt.txt'), { code: 'EPERM' }),
        'request-fixture-123',
      );

      expect(sendApiError).toHaveBeenCalledWith(
        res,
        500,
        'INTERNAL_ERROR',
        'Run preparation failed.',
        { requestId: 'request-fixture-123' },
      );
      expect(consoleError).toHaveBeenCalledWith(
        '[runs] preparation failed request=request-fixture-123 code=EPERM',
      );
      expect(JSON.stringify(sendApiError.mock.calls)).not.toContain('private');
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain('secret input');
    } finally {
      consoleError.mockRestore();
    }
  });
});

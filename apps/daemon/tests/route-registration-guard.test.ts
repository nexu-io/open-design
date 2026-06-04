import express from 'express';
import { describe, expect, it } from 'vitest';

import {
  guardedRouteKey,
  installRouteRegistrationGuard,
} from '../src/route-registration-guard.js';

describe('route registration guard', () => {
  it('tracks the sensitive extracted routes', () => {
    expect(guardedRouteKey('post', '/api/projects/:id/export/pdf')).toBe(
      'POST /api/projects/:id/export/pdf',
    );
    expect(guardedRouteKey('post', '/api/projects/:id/media/generate')).toBe(
      'POST /api/projects/:id/media/generate',
    );
    expect(guardedRouteKey('get', '/api/projects/:id/export/pdf')).toBeNull();
    expect(guardedRouteKey('post', '/api/runs')).toBeNull();
  });

  it('throws when a guarded route is registered twice', () => {
    const app = express();
    installRouteRegistrationGuard(app);
    app.post('/api/projects/:id/media/generate', (_req, res) => res.end());

    expect(() => {
      app.post('/api/projects/:id/media/generate', (_req, res) => res.end());
    }).toThrow(/duplicate guarded route registration: POST \/api\/projects\/:id\/media\/generate/);
  });

  it('does not blanket reject non-sensitive duplicate routes', () => {
    const app = express();
    installRouteRegistrationGuard(app);
    app.get('/api/runs', (_req, res) => res.end());

    expect(() => {
      app.get('/api/runs', (_req, res) => res.end());
    }).not.toThrow();
  });
});

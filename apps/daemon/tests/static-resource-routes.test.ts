import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isLocalSameOrigin } from '../src/origin-validation.js';
import { registerStaticResourceRoutes } from '../src/static-resource-routes.js';

describe('static resource mutation routes', () => {
  let server: http.Server;
  let baseUrl: string;
  let tempRoot: string;
  let catalogReadCount = 0;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'od-static-routes-'));
        const app = express();
        app.use(express.json({ limit: '4mb' }));
        registerStaticResourceRoutes(app, {
          http: {
            createSseResponse: () => undefined,
            isLocalSameOrigin,
            requireLocalDaemonRequest: (_req: unknown, _res: unknown, next: () => void) => next(),
            resolvedPortRef: {
              get current() {
                const address = server.address();
                return typeof address === 'object' && address ? address.port : 0;
              },
            },
            sendApiError: (res: express.Response, status: number, code: string, message: string) =>
              res.status(status).json({ error: message, code }),
            sendLiveArtifactRouteError: () => undefined,
            sendMulterError: () => undefined,
          },
          paths: {
            ARTIFACTS_DIR: path.join(tempRoot, 'artifacts'),
            BUNDLED_PETS_DIR: path.join(tempRoot, 'pets'),
            DESIGN_SYSTEMS_DIR: path.join(tempRoot, 'design-systems'),
            OD_BIN: path.join(tempRoot, 'od'),
            PROJECT_ROOT: tempRoot,
            PROJECTS_DIR: path.join(tempRoot, 'projects'),
            PROMPT_TEMPLATES_DIR: path.join(tempRoot, 'prompt-templates'),
            RUNTIME_DATA_DIR: path.join(tempRoot, 'data'),
            RUNTIME_DATA_DIR_CANONICAL: path.join(tempRoot, 'data'),
            SKILLS_DIR: path.join(tempRoot, 'skills'),
            USER_DESIGN_SYSTEMS_DIR: path.join(tempRoot, 'user-design-systems'),
            USER_SKILLS_DIR: path.join(tempRoot, 'user-skills'),
          },
          resources: {
            listAllDesignSystems: async () => {
              catalogReadCount += 1;
              return [];
            },
            listAllSkills: async () => {
              catalogReadCount += 1;
              return [];
            },
            mimeFor: () => 'application/octet-stream',
          },
        });

        server = app.listen(0, '127.0.0.1', () => {
          const addr = server.address() as { port: number };
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(
    () =>
      new Promise<void>((resolve) => {
        server.close(() => {
          fs.rmSync(tempRoot, { recursive: true, force: true });
          resolve();
        });
      }),
  );

  it.each([
    ['POST', '/api/skills/install'],
    ['DELETE', '/api/skills/demo-skill'],
    ['POST', '/api/design-systems/install'],
    ['DELETE', '/api/design-systems/demo-system'],
  ])('rejects cross-origin %s %s before catalog or filesystem work', async (method, route) => {
    catalogReadCount = 0;
    const init: RequestInit = {
      method,
      headers: {
        Origin: 'https://evil.example',
        'Content-Type': 'application/json',
      },
    };
    if (method === 'POST') {
      init.body = JSON.stringify({ source: 'local', path: tempRoot });
    }
    const res = await fetch(`${baseUrl}${route}`, init);

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: 'FORBIDDEN' });
    expect(catalogReadCount).toBe(0);
  });
});

// Daemon HTTP coverage for the page-patterns surface added in PR-1 of the
// page-patterns feature (see docs/plans/2026-05-21-page-patterns.md). The
// tests point the static-resource-routes harness at the real seed folder
// under <repo>/page-patterns/ so the snake_case → camelCase frontmatter
// projection is exercised end-to-end against the eight committed seeds.

import express from 'express';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isLocalSameOrigin } from '../src/origin-validation.js';
import { registerStaticResourceRoutes } from '../src/static-resource-routes.js';
import { listSkills } from '../src/skills.js';
import type { PagePatternListResponse, PagePatternResponse } from '@open-design/contracts';

// Resolve <repoRoot>/page-patterns by walking up from this test file.
// Mirrors apps/daemon/tests/skills.test.ts and prompts/system.test.ts.
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const PAGE_PATTERNS_ROOT = path.join(REPO_ROOT, 'page-patterns');

const EXPECTED_PATTERN_IDS = [
  'auth-login',
  'auth-signup',
  'board-list',
  'gallery-grid',
  'social-feed',
  'post-detail',
  'dashboard-metrics',
  'user-profile',
];

describe('/api/page-patterns routes', () => {
  let server: http.Server;
  let baseUrl: string;
  let tempRoot: string;

  beforeAll(
    () =>
      new Promise<void>((resolve) => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'od-page-patterns-routes-'));
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
            DESIGN_TEMPLATES_DIR: path.join(tempRoot, 'design-templates'),
            OD_BIN: path.join(tempRoot, 'od'),
            PROJECT_ROOT: REPO_ROOT,
            PROJECTS_DIR: path.join(tempRoot, 'projects'),
            PROMPT_TEMPLATES_DIR: path.join(tempRoot, 'prompt-templates'),
            RUNTIME_DATA_DIR: path.join(tempRoot, 'data'),
            RUNTIME_DATA_DIR_CANONICAL: path.join(tempRoot, 'data'),
            SKILLS_DIR: path.join(tempRoot, 'skills'),
            USER_DESIGN_SYSTEMS_DIR: path.join(tempRoot, 'user-design-systems'),
            USER_DESIGN_TEMPLATES_DIR: path.join(tempRoot, 'user-design-templates'),
            USER_SKILLS_DIR: path.join(tempRoot, 'user-skills'),
          },
          resources: {
            listAllDesignSystems: async () => [],
            listAllSkills: async () => [],
            listAllDesignTemplates: async () => [],
            // Real scanner pointed at the committed seeds so the example /
            // assets routes can resolve auth-login etc. via the shared
            // skill-like aggregator after the route registration extends it.
            listAllSkillLikeEntries: async () =>
              (await listSkills([PAGE_PATTERNS_ROOT])).map((entry) => ({
                ...entry,
                source: 'built-in' as const,
              })),
            listAllPagePatterns: async () => listSkills([PAGE_PATTERNS_ROOT]),
            mimeFor: () => 'text/html',
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

  it('GET /api/page-patterns returns all eight seed patterns', async () => {
    const res = await fetch(`${baseUrl}/api/page-patterns`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as PagePatternListResponse;
    expect(Array.isArray(body.patterns)).toBe(true);
    expect(body.patterns).toHaveLength(EXPECTED_PATTERN_IDS.length);
    const ids = new Set(body.patterns.map((p) => p.id));
    for (const expected of EXPECTED_PATTERN_IDS) {
      expect(ids.has(expected)).toBe(true);
    }
  });

  it('projects snake_case frontmatter into camelCase contract fields', async () => {
    const res = await fetch(`${baseUrl}/api/page-patterns`);
    const body = (await res.json()) as PagePatternListResponse;
    const login = body.patterns.find((p) => p.id === 'auth-login');
    expect(login, 'auth-login pattern present').toBeDefined();
    if (!login) return;

    expect(login.pageType).toBe('auth.login');
    expect(Array.isArray(login.pageInputs)).toBe(true);
    expect(login.pageInputs).toHaveLength(0);

    expect(Array.isArray(login.pageOutputs)).toBe(true);
    expect(login.pageOutputs).toHaveLength(3);
    for (const io of login.pageOutputs) {
      expect(typeof io.name).toBe('string');
      expect(['navigation', 'data', 'action']).toContain(io.kind);
      // `target_page_type` snake-case must not survive the projection.
      expect((io as any).target_page_type).toBeUndefined();
    }

    const submit = login.pageOutputs.find((o) => o.name === 'submit');
    expect(submit, '`submit` output present').toBeDefined();
    expect(submit?.targetPageType).toBe('dashboard.metrics');

    const reset = login.pageOutputs.find((o) => o.name === 'password_reset_link');
    expect(reset, '`password_reset_link` output present').toBeDefined();
    expect(reset?.targetPageType).toBeUndefined();
  });

  it('list response advertises hasBody and omits body / dir', async () => {
    const res = await fetch(`${baseUrl}/api/page-patterns`);
    const body = (await res.json()) as PagePatternListResponse;
    for (const pattern of body.patterns) {
      expect(pattern.hasBody).toBe(true);
      expect((pattern as any).body).toBeUndefined();
      expect((pattern as any).dir).toBeUndefined();
    }
  });

  it('GET /api/page-patterns/:id returns one pattern with body included', async () => {
    const ok = await fetch(`${baseUrl}/api/page-patterns/auth-login`);
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as PagePatternResponse;
    expect(body.pattern.id).toBe('auth-login');
    expect(body.pattern.pageType).toBe('auth.login');
    expect(typeof (body.pattern as any).body).toBe('string');
    expect((body.pattern as any).body.length).toBeGreaterThan(0);
    // Body should reference the Login layout from SKILL.md.
    expect((body.pattern as any).body).toMatch(/Login/i);

    const missing = await fetch(`${baseUrl}/api/page-patterns/does-not-exist`);
    expect(missing.status).toBe(404);
  });

  it('GET /api/page-patterns/:id/example serves the baked example.html', async () => {
    for (const id of ['auth-login', 'dashboard-metrics']) {
      const res = await fetch(`${baseUrl}/api/page-patterns/${id}/example`);
      expect(res.status, `${id} example status`).toBe(200);
      const html = await res.text();
      expect(html.toLowerCase().startsWith('<!doctype html>')).toBe(true);
    }
  });
});

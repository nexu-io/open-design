// @vitest-environment node

// OPEND-2617: the Web enters the project frame the moment Send is pressed, so
// POST /api/projects needs a hard ceiling. When preparation cannot finish in
// time the daemon must answer a typed, retryable 504 through the real HTTP
// boundary (web proxy included) and leave no project row behind, so the
// client can roll back to the composer instead of waiting indefinitely.

import { randomUUID } from 'node:crypto';

import { describe, expect, test } from 'vitest';

import { requestJson } from '@/vitest/http';
import { createSmokeSuite } from '@/vitest/suite';

type ProjectListResponse = { projects: Array<{ id: string }> };

describe('project create preparation deadline', () => {
  test('a stalled create answers 504 PROJECT_CREATE_PREPARATION_TIMEOUT and persists nothing', async () => {
    const suite = await createSmokeSuite('project-create-preparation-deadline');

    await suite.with.toolsDev(async ({ webUrl }) => {
      const base = webUrl.replace(/\/$/, '');
      const projectId = randomUUID();
      const response = await fetch(`${base}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: projectId,
          name: 'Deadline project',
          designSystemId: null,
          skillId: null,
          metadata: { kind: 'prototype' },
          pendingPrompt: 'Make a landing page for a coffee shop',
        }),
      });
      const body = await response.json() as {
        error?: { code?: string; retryable?: boolean; message?: string };
      };
      expect(response.status).toBe(504);
      expect(body.error?.code).toBe('PROJECT_CREATE_PREPARATION_TIMEOUT');
      expect(body.error?.retryable).toBe(true);

      const list = await requestJson<ProjectListResponse>(webUrl, '/api/projects');
      expect(list.projects.some((project) => project.id === projectId)).toBe(false);
    }, {
      // A 1ms ceiling makes every real preparation read overrun it; the
      // route's own accumulated-time check turns that into the 504.
      env: { OD_PROJECT_CREATE_PREPARATION_TIMEOUT_MS: '1' },
    });
  }, 180_000);
});

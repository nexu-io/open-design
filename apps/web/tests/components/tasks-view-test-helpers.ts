// @vitest-environment jsdom
// Shared test helpers for the TasksView split test files.
// This module is intentionally NOT matched by Vitest's test include glob;
// it is imported by the TasksView.*.test.tsx files only.
import { cleanup } from '@testing-library/react';
import { vi } from 'vitest';
import type {
  Routine,
  Project,
  ChatRunStatusResponse,
  CreatorContentProjectData,
  CreatorPerformanceProjectData,
  CreatorPerformanceSnapshot,
  CreatorReleasePackage,
  CreatorReleasePackageData,
  CreatorReleasePlatform,
} from '@open-design/contracts';

// `@open-design/contracts` does not export `CreatorProjectData`, and it is not
// part of the web app's ambient types, so the mock helper declares a minimal
// structural shape. Test files define their own local `CreatorProjectData`
// type; both are structurally compatible (tasks/activities arrays).
interface CreatorProjectData {
  tasks?: unknown[];
  activities?: unknown[];
}

function mockTasksViewFetch({
  routines = [],
  creatorProjects = [],
  creatorRuns = [],
  creatorProjectData = {},
  creatorMediaData = {},
  creatorContentData = {},
  creatorMediaFailures = [],
  creatorContentFailures = [],
  creatorReleaseData = {},
  creatorReleaseFailures = [],
  creatorPerformanceData = {},
  creatorPerformanceFailures = [],
  creatorPerformanceCreateError = false,
}: {
  routines?: Routine[];
  creatorProjects?: Project[];
  creatorRuns?: ChatRunStatusResponse[];
  creatorProjectData?: Record<string, CreatorProjectData>;
  creatorMediaData?: Record<string, { assets: Array<{ id: string; fileName: string; kind: string; relativePath: string; availability: string }>; taskLinks: Array<{ taskId: string; assetId: string }> }>;
  creatorContentData?: Record<string, CreatorContentProjectData>;
  creatorMediaFailures?: string[];
  creatorContentFailures?: string[];
  creatorReleaseData?: Record<string, CreatorReleasePackageData>;
  creatorReleaseFailures?: string[];
  creatorPerformanceData?: Record<string, CreatorPerformanceProjectData>;
  creatorPerformanceFailures?: string[];
  creatorPerformanceCreateError?: boolean;
} = {}) {
  const releaseStore: Record<string, CreatorReleasePackage[]> = {};
  for (const [projectId, data] of Object.entries(creatorReleaseData)) {
    releaseStore[projectId] = Array.isArray(data.releasePackages) ? data.releasePackages.map((release) => ({ ...release })) : [];
  }
  const performanceStore: Record<string, CreatorPerformanceSnapshot[]> = {};
  for (const [projectId, data] of Object.entries(creatorPerformanceData)) {
    performanceStore[projectId] = Array.isArray(data.snapshots) ? data.snapshots.map((snapshot) => ({ ...snapshot })) : [];
  }
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input.toString();
    if (url === '/api/routines' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ routines }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/projects' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ projects: creatorProjects }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/runs' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ runs: creatorRuns }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const creatorRead = /^\/api\/projects\/([^/]+)\/creator-workbench$/.exec(url);
    if (creatorRead && (!init || init.method === undefined)) {
      const projectId = decodeURIComponent(creatorRead[1]!);
      return new Response(JSON.stringify(creatorProjectData[projectId] ?? { tasks: [], activities: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const creatorMediaRead = /^\/api\/projects\/([^/]+)\/creator-media-assets$/.exec(url);
    if (creatorMediaRead && (!init || init.method === undefined)) {
      const projectId = decodeURIComponent(creatorMediaRead[1]!);
      if (creatorMediaFailures.includes(projectId)) return new Response(JSON.stringify({ error: 'media unavailable' }), { status: 503 });
      return new Response(JSON.stringify(creatorMediaData[projectId] ?? { roots: [], assets: [], taskLinks: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const creatorContentRead = /^\/api\/projects\/([^/]+)\/creator-content$/.exec(url);
    if (creatorContentRead && (!init || init.method === undefined)) {
      const projectId = decodeURIComponent(creatorContentRead[1]!);
      if (creatorContentFailures.includes(projectId)) return new Response(JSON.stringify({ error: 'content unavailable' }), { status: 503 });
      return new Response(JSON.stringify(creatorContentData[projectId] ?? { contentProjects: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    const releaseListRead = /^\/api\/projects\/([^/]+)\/creator-release-packages$/.exec(url);
    if (releaseListRead && (!init || init.method === undefined)) {
      const projectId = decodeURIComponent(releaseListRead[1]!);
      if (creatorReleaseFailures.includes(projectId)) return new Response(JSON.stringify({ error: 'release unavailable' }), { status: 503 });
      return new Response(JSON.stringify({ releasePackages: releaseStore[projectId] ?? [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (releaseListRead && init?.method === 'POST') {
      const projectId = decodeURIComponent(releaseListRead[1]!);
      const body = JSON.parse(String(init.body)) as { contentId: string; platform: string; title: string; coverAssetId?: string; exportAssetId?: string };
      const id = `creator-release:${(releaseStore[projectId]?.length ?? 0) + 1}`;
      const now = new Date().toISOString();
      const pkg: CreatorReleasePackage = {
        id, projectId, contentId: body.contentId, platform: body.platform as CreatorReleasePlatform,
        status: 'draft', title: body.title, description: '', tags: [],
        checklist: { contentComplete: false, exportConfirmed: false, coverConfirmed: false, metadataConfirmed: false, platformConfirmed: false },
        createdAt: now, updatedAt: now,
        ...(body.coverAssetId ? { coverAssetId: body.coverAssetId } : {}),
        ...(body.exportAssetId ? { exportAssetId: body.exportAssetId } : {}),
      };
      releaseStore[projectId] = [...(releaseStore[projectId] ?? []), pkg];
      return new Response(JSON.stringify({ releasePackage: pkg }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    const releaseExportRead = /^\/api\/projects\/([^/]+)\/creator-release-packages\/([^/]+)\/export$/.exec(url);
    if (releaseExportRead && (!init || init.method === undefined || init.method === 'GET')) {
      const projectId = decodeURIComponent(releaseExportRead[1]!);
      const releaseId = decodeURIComponent(releaseExportRead[2]!);
      const release = (releaseStore[projectId] ?? []).find((candidate) => candidate.id === releaseId);
      if (!release) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      const exportDoc = {
        ...release,
        content: { id: release.contentId, title: release.contentId },
        coverAsset: release.coverAssetId ? { id: release.coverAssetId, availability: 'available' } : null,
        exportAsset: release.exportAssetId ? { id: release.exportAssetId, availability: 'available' } : null,
      };
      return new Response(JSON.stringify(exportDoc), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const releaseItem = /^\/api\/projects\/([^/]+)\/creator-release-packages\/([^/]+)$/.exec(url);
    if (releaseItem && (init?.method === 'PATCH' || init?.method === 'DELETE')) {
      const projectId = decodeURIComponent(releaseItem[1]!);
      const releaseId = decodeURIComponent(releaseItem[2]!);
      const store = releaseStore[projectId] ?? [];
      const existing = store.find((candidate) => candidate.id === releaseId);
      if (!existing) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      if (init.method === 'DELETE') {
        releaseStore[projectId] = store.filter((candidate) => candidate.id !== releaseId);
        return new Response(null, { status: 204 });
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      const merged: CreatorReleasePackage = { ...existing, ...(body as Partial<CreatorReleasePackage>), projectId, id: releaseId };
      // Mirror the daemon status gate: ready/published require a complete checklist;
      // published additionally requires a valid publishedAt and publishedUrl.
      const checklist = merged.checklist ?? existing.checklist;
      const checklistComplete = !!checklist && (Object.values(checklist) as boolean[]).every(Boolean);
      if (merged.status === 'ready' && !checklistComplete) {
        return new Response(JSON.stringify({ error: 'ready requires all checklist items complete' }), { status: 400, headers: { 'content-type': 'application/json' } });
      }
      if (merged.status === 'published') {
        if (!checklistComplete) {
          return new Response(JSON.stringify({ error: 'published requires all checklist items complete' }), { status: 400, headers: { 'content-type': 'application/json' } });
        }
        if (!merged.publishedAt || !merged.publishedUrl) {
          return new Response(JSON.stringify({ error: 'published requires a valid publishedAt and publishedUrl' }), { status: 400, headers: { 'content-type': 'application/json' } });
        }
      }
      const updated: CreatorReleasePackage = merged;
      releaseStore[projectId] = store.map((candidate) => candidate.id === releaseId ? updated : candidate);
      return new Response(JSON.stringify({ releasePackage: updated }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    const performanceListRead = /^\/api\/projects\/([^/]+)\/creator-performance-snapshots$/.exec(url);
    if (performanceListRead && (!init || init.method === undefined || init.method === 'GET')) {
      const projectId = decodeURIComponent(performanceListRead[1]!);
      if (creatorPerformanceFailures.includes(projectId)) return new Response(JSON.stringify({ error: 'performance unavailable' }), { status: 503 });
      return new Response(JSON.stringify({ snapshots: performanceStore[projectId] ?? [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (performanceListRead && init?.method === 'POST') {
      const projectId = decodeURIComponent(performanceListRead[1]!);
      if (creatorPerformanceCreateError) return new Response(JSON.stringify({ error: 'performance create failed' }), { status: 500, headers: { 'content-type': 'application/json' } });
      const body = JSON.parse(String(init.body)) as { releaseId: string; capturedAt?: string; metrics: Record<string, number>; note?: string };
      const now = new Date().toISOString();
      const snapshot: CreatorPerformanceSnapshot = {
        id: `creator-performance:${(performanceStore[projectId]?.length ?? 0) + 1}`,
        projectId, releaseId: body.releaseId, source: 'manual',
        capturedAt: body.capturedAt ?? now, metrics: { ...body.metrics },
        ...(body.note && body.note.trim() ? { note: body.note.trim() } : {}),
        createdAt: now,
      };
      performanceStore[projectId] = [...(performanceStore[projectId] ?? []), snapshot];
      return new Response(JSON.stringify({ snapshot }), { status: 201, headers: { 'content-type': 'application/json' } });
    }
    const performanceItem = /^\/api\/projects\/([^/]+)\/creator-performance-snapshots\/([^/]+)$/.exec(url);
    if (performanceItem && init?.method === 'DELETE') {
      const projectId = decodeURIComponent(performanceItem[1]!);
      const snapshotId = decodeURIComponent(performanceItem[2]!);
      const store = performanceStore[projectId] ?? [];
      if (!store.some((candidate) => candidate.id === snapshotId)) return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'content-type': 'application/json' } });
      performanceStore[projectId] = store.filter((candidate) => candidate.id !== snapshotId);
      return new Response(null, { status: 204 });
    }
    if (url === '/api/automation-templates' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ templates: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-proposals?status=pending-review' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ proposals: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === '/api/automation-source-packets?limit=3' && (!init || init.method === undefined)) {
      return new Response(JSON.stringify({ packets: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 404 });
  }) as typeof fetch;
}

function countWriteRequests(): number {
  const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
  return fetchMock.mock.calls.filter((call) => {
    const method = (call[1] as RequestInit | undefined)?.method;
    return method === 'POST' || method === 'PATCH' || method === 'DELETE' || method === 'PUT';
  }).length;
}

// Shared environment-recovery helper. Each split file restores its own
// originalFetch / originalConfirm in its inline afterEach; this helper covers
// the parts that do not depend on per-file globals.
export function afterEachTasksViewCleanup(): void {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
}

export { mockTasksViewFetch, countWriteRequests };

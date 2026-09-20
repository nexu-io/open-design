// A document's preview behavior must not depend on its byte size.
//
// The daemon used to split every HTML preview route at a 2 MiB ceiling: at or
// below it the response was assembled in memory by one implementation, above it
// a second implementation streamed a hand-maintained copy of the same bridges
// into `<head>`. The two drifted —
// different placement, no title sanitizing, a fresh preview scope on every read,
// no Vite dist resolution, no Workspace-scoped asset URLs — and a new bridge
// added to one list silently never reached the other (#8208 had to be patched
// into the streamed list by hand).
//
// Every case below serves the SAME artifact twice: once small, once padded past
// the old ceiling with an inert comment. The pad is the only difference between
// the two files, so after taking the pad back out the two responses must be the
// same document — same bridges, in the same places relative to the author's own
// scripts, same title, same containment base and scope, same asset URLs.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PREVIEW_BUILD_FOCUS_READY_TYPE,
  PREVIEW_BUILD_FOCUS_SECTIONS_TYPE,
  buildPreviewBuildFocusBridge,
} from '@open-design/contracts/runtime/preview-build-focus';
import { ensureWorkspaceProject, openDatabase } from '../src/db.js';
import { startServer } from '../src/server.js';
import * as projectRoutes from '../src/routes/project/index.js';

const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom') as {
  JSDOM: new (html: string, options: Record<string, unknown>) => any;
};

/** The ceiling the daemon used to split preview behavior at. */
const FORMER_SPLIT_BYTES = 2 * 1024 * 1024;
/** Big enough that the old implementation took its streaming branch. */
const LARGE_PAD = 'x'.repeat(FORMER_SPLIT_BYTES + 4096);
const SMALL_PAD = 'x'.repeat(16);
const PAD_COMMENT = /<!-- x+ -->/u;

const AUTHORED_HEAD_SCRIPT = 'window.__authoredHeadRan = true;';
const AUTHORED_BODY_SCRIPT = 'window.__authoredBodyRan = true;';

/**
 * One artifact with everything a preview transform can act on: a title the PDF
 * filename sanitizer rewrites, a relative stylesheet and image, an authored
 * head script (guards must run before it), an authored body script (end-of-body
 * bridges must run after it), and a load-time navigation the redirect guard
 * keys off.
 */
function artifact(pad: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<title>~$Invoice: Q3/2026 &amp; more</title>',
    '<link rel="stylesheet" href="styles/site.css">',
    `<script>${AUTHORED_HEAD_SCRIPT}</script>`,
    '</head>',
    '<body>',
    '<main id="root"><h1>Studio Nine</h1><img src="assets/hero.png" alt=""></main>',
    `<!-- ${pad} -->`,
    `<script>${AUTHORED_BODY_SCRIPT} function go(){ location.replace("./next.html"); }</script>`,
    '</body>',
    '</html>',
  ].join('\n');
}

function viteEntry(pad: string): string {
  return [
    '<!doctype html><html><head><title>Vite app</title></head><body>',
    '<div id="app"></div>',
    `<!-- ${pad} -->`,
    '<script type="module" src="/src/main.tsx"></script>',
    '</body></html>',
  ].join('');
}

const VITE_DIST = [
  '<!doctype html><html><head><title>Built app</title>',
  '<script type="module" crossorigin src="/assets/index-abc123.js"></script>',
  '<link rel="stylesheet" crossorigin href="/assets/index-abc123.css">',
  '</head><body><div id="app"></div></body></html>',
].join('');

/** Exactly what FileViewer's URL-load transport asks for on a guarded artifact. */
const FILE_VIEWER_BRIDGES = [
  'scroll', 'selection', 'snapshot', 'observability', 'presentation',
  'sandbox', 'focus', 'redirect',
].map((token) => `odPreviewBridge=${token}`).join('&');

/** Every bridge marker the daemon knows how to inject, in no particular order. */
const KNOWN_BRIDGE_MARKERS = [
  'data-od-sandbox-shim',
  'data-od-preview-redirect-guard',
  'data-od-preview-observability',
  'data-od-preview-focus-guard',
  'data-od-preview-build-focus',
  'data-od-url-scroll-bridge',
  'data-od-url-selection-bridge',
  'data-od-url-snapshot-bridge',
  'data-od-deck-presentation-bridge',
  'data-od-preview-runtime',
  'data-od-project-preview-base',
  'data-od-preview-base-bridge',
];

interface PreviewProfile {
  status: number;
  /** Markers in document order, each tagged with where it sits. */
  injected: Array<{ marker: string; count: number; placement: string }>;
  title: string | null;
  baseHref: string | null;
  heroSrc: string | null;
  stylesheetHref: string | null;
  blocksLoadTimeRedirect: string | null;
}

function placementOf(html: string, index: number): string {
  const headScript = html.indexOf(AUTHORED_HEAD_SCRIPT);
  const bodyScript = html.indexOf(AUTHORED_BODY_SCRIPT);
  const bodyClose = html.lastIndexOf('</body>');
  if (headScript >= 0 && index < headScript) return 'before authored head script';
  if (bodyScript >= 0 && index > bodyScript && index < bodyClose) return 'after authored body script';
  return `elsewhere`;
}

/** What a preview document DOES, read back from the served bytes. */
function profile(status: number, html: string): PreviewProfile {
  const injected = KNOWN_BRIDGE_MARKERS
    .map((marker) => {
      const pattern = new RegExp(`<(?:script|base)\\b[^>]*\\s${marker}(?=[\\s>=])`, 'gu');
      const matches = [...html.matchAll(pattern)];
      return {
        marker,
        count: matches.length,
        index: matches[0]?.index ?? -1,
      };
    })
    .filter((entry) => entry.count > 0)
    .sort((left, right) => left.index - right.index)
    .map(({ marker, count, index }) => ({ marker, count, placement: placementOf(html, index) }));
  return {
    status,
    injected,
    title: /<title>([^<]*)<\/title>/u.exec(html)?.[1] ?? null,
    baseHref: /<base\b[^>]*\bhref="([^"]*)"/u.exec(html)?.[1] ?? null,
    heroSrc: /<img\b[^>]*\bsrc="([^"]*)"/u.exec(html)?.[1] ?? null,
    stylesheetHref: /<link\b[^>]*rel="stylesheet"[^>]*\bhref="([^"]*)"/u.exec(html)?.[1] ?? null,
    blocksLoadTimeRedirect: /var BLOCK_LOAD_TIME_SCRIPT_REDIRECT = (true|false);/u.exec(html)?.[1] ?? null,
  };
}

/**
 * Take the pad back out and erase the two identities that legitimately differ
 * between two different files: their names and their content digests.
 */
function normalize(html: string, names: Record<string, string>): string {
  let next = html.replace(PAD_COMMENT, '<!-- PAD -->');
  for (const [name, placeholder] of Object.entries(names)) next = next.split(name).join(placeholder);
  return next.replace(/sha256:[0-9a-f]{64}/gu, 'sha256:<document>');
}

describe('HTML preview behavior is independent of document size', () => {
  let server: http.Server;
  let baseUrl: string;
  const projectsToClean: string[] = [];
  const cleanupHeaders = new Map<string, Record<string, string>>();

  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    for (const id of projectsToClean.splice(0)) {
      const headers = cleanupHeaders.get(id);
      await fetch(`${baseUrl}/api/projects/${id}`, {
        method: 'DELETE',
        ...(headers ? { headers } : {}),
      }).catch(() => {});
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function createProject(): Promise<string> {
    const id = `preview-size-parity-${randomUUID()}`;
    const response = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, name: 'Preview size parity' }),
    });
    expect(response.ok).toBe(true);
    projectsToClean.push(id);
    return id;
  }

  async function writeFile(projectId: string, name: string, content: string): Promise<void> {
    const response = await fetch(`${baseUrl}/api/projects/${projectId}/files`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, content }),
    });
    expect(response.ok).toBe(true);
  }

  function workspaceHeaders(workspaceId: string, workspaceMemberId: string): Record<string, string> {
    return {
      'x-od-workspace-id': workspaceId,
      'x-od-workspace-member-id': workspaceMemberId,
      'x-od-workspace-type': 'personal',
      'x-od-workspace-role': 'member',
      'x-od-workspace-member-status': 'active',
      'x-od-workspace-lifecycle-state': 'active',
      'x-od-workspace-can-share-projects': 'true',
      'x-od-workspace-can-write-synced-files': 'true',
    };
  }

  function bindPersonalProject(projectId: string, workspaceId: string, workspaceMemberId: string): void {
    const dataDir = process.env.OD_DATA_DIR;
    if (!dataDir) throw new Error('OD_DATA_DIR is required by the daemon test harness');
    const db = openDatabase(process.cwd(), { dataDir });
    ensureWorkspaceProject(db, {
      projectId,
      workspaceId,
      visibility: 'personal',
      resourceState: 'active',
      createdByWorkspaceMemberId: workspaceMemberId,
      updatedByWorkspaceMemberId: workspaceMemberId,
      resourceHubResourceId: null,
      cloudTombstonedAt: null,
      syncState: 'local_only',
    });
    cleanupHeaders.set(projectId, workspaceHeaders(workspaceId, workspaceMemberId));
  }

  function hostRequest(requestPath: string, host: string): Promise<{ status: number; body: string }> {
    const target = new URL(baseUrl);
    return new Promise((resolve, reject) => {
      const request = http.request({
        hostname: target.hostname,
        port: target.port,
        path: requestPath,
        method: 'GET',
        headers: { Host: host },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      });
      request.on('error', reject);
      request.end();
    });
  }

  async function read(url: string): Promise<{ status: number; body: string }> {
    const response = await fetch(url);
    return { status: response.status, body: await response.text() };
  }

  /** The assertion every case shares: same profile, then same document. */
  function expectSameBehavior(
    small: { status: number; body: string },
    large: { status: number; body: string },
    names: Record<string, string>,
  ): void {
    expect(small.status).toBe(200);
    expect(large.body.length).toBeGreaterThan(FORMER_SPLIT_BYTES);
    const smallProfile = profile(small.status, normalize(small.body, names));
    const largeProfile = profile(large.status, normalize(large.body, names));
    // The profile is the readable diff; the document equality below is the
    // invariant, and catches any transform the profile does not name.
    expect(largeProfile).toEqual(smallProfile);
    expect(normalize(large.body, names)).toBe(normalize(small.body, names));
  }

  it('serves the FileViewer URL-load preview identically', async () => {
    const projectId = await createProject();
    await writeFile(projectId, 'small.html', artifact(SMALL_PAD));
    await writeFile(projectId, 'large.html', artifact(LARGE_PAD));

    const small = await read(`${baseUrl}/api/projects/${projectId}/raw/small.html?${FILE_VIEWER_BRIDGES}`);
    const large = await read(`${baseUrl}/api/projects/${projectId}/raw/large.html?${FILE_VIEWER_BRIDGES}`);

    // Spelled out so a failure names the user-visible symptom first.
    const smallProfile = profile(small.status, small.body);
    expect(smallProfile.title).toBe('Invoice- Q3-2026 - more');
    expect(profile(large.status, large.body).title).toBe(smallProfile.title);
    expectSameBehavior(small, large, { 'small.html': 'FILE', 'large.html': 'FILE' });
  });

  // OPEND-2283, for every size: a preview read that changes bytes on each
  // refetch reloads the iframe. The large document used to get a freshly
  // minted preview scope — and so a different `<base href>` — on every read.
  it('returns identical bytes for repeated reads of one large artifact', async () => {
    const projectId = await createProject();
    await writeFile(projectId, 'large.html', artifact(LARGE_PAD));
    const url = `${baseUrl}/api/projects/${projectId}/raw/large.html?${FILE_VIEWER_BRIDGES}`;

    const first = await read(url);
    const second = await read(url);

    expect(first.status).toBe(200);
    expect(profile(first.status, first.body).baseHref).toBeTruthy();
    expect(second.body === first.body).toBe(true);
  });

  it('serves the Design Files build-focus preview identically', async () => {
    const projectId = await createProject();
    await writeFile(projectId, 'small.html', artifact(SMALL_PAD));
    await writeFile(projectId, 'large.html', artifact(LARGE_PAD));

    const query = 'v=1&fr=1&odPreviewBridge=buildfocus';
    const small = await read(`${baseUrl}/api/projects/${projectId}/raw/small.html?${query}`);
    const large = await read(`${baseUrl}/api/projects/${projectId}/raw/large.html?${query}`);

    expectSameBehavior(small, large, { 'small.html': 'FILE', 'large.html': 'FILE' });
  });

  it('rewrites Workspace-scoped asset URLs identically', async () => {
    const workspaceId = `workspace-${randomUUID()}`;
    const workspaceMemberId = `member-${randomUUID()}`;
    const projectId = await createProject();
    await writeFile(projectId, 'small.html', artifact(SMALL_PAD));
    await writeFile(projectId, 'large.html', artifact(LARGE_PAD));
    bindPersonalProject(projectId, workspaceId, workspaceMemberId);

    const scope = new URLSearchParams({ workspaceId, workspaceMemberId }).toString();
    const small = await read(`${baseUrl}/api/projects/${projectId}/raw/small.html?${scope}&${FILE_VIEWER_BRIDGES}`);
    const large = await read(`${baseUrl}/api/projects/${projectId}/raw/large.html?${scope}&${FILE_VIEWER_BRIDGES}`);

    expect(profile(small.status, small.body).heroSrc).toContain(`workspaceId=${workspaceId}`);
    expectSameBehavior(small, large, { 'small.html': 'FILE', 'large.html': 'FILE' });
  });

  it('resolves a Vite dev entry to its build identically', async () => {
    const projectId = await createProject();
    await writeFile(projectId, 'small/index.html', viteEntry(SMALL_PAD));
    await writeFile(projectId, 'small/dist/index.html', VITE_DIST);
    await writeFile(projectId, 'large/index.html', viteEntry(LARGE_PAD));
    await writeFile(projectId, 'large/dist/index.html', VITE_DIST);

    const small = await read(`${baseUrl}/api/projects/${projectId}/raw/small/index.html?${FILE_VIEWER_BRIDGES}`);
    const large = await read(`${baseUrl}/api/projects/${projectId}/raw/large/index.html?${FILE_VIEWER_BRIDGES}`);

    expect(small.body).toContain('dist/assets/index-abc123.js');
    expect(large.body).toContain('dist/assets/index-abc123.js');
    // Both resolve to the same build, so the bodies are compared without a pad.
    const names = { 'small/': 'DIR/', 'large/': 'DIR/' };
    expect(profile(large.status, normalize(large.body, names)))
      .toEqual(profile(small.status, normalize(small.body, names)));
    expect(normalize(large.body, names)).toBe(normalize(small.body, names));
  });

  it('serves the powered preview identically', async () => {
    const projectId = await createProject();
    await writeFile(projectId, 'small.html', artifact(SMALL_PAD));
    await writeFile(projectId, 'large.html', artifact(LARGE_PAD));

    const small = await read(`${baseUrl}/api/projects/${projectId}/powered/small.html?${FILE_VIEWER_BRIDGES}`);
    const large = await read(`${baseUrl}/api/projects/${projectId}/powered/large.html?${FILE_VIEWER_BRIDGES}`);

    expectSameBehavior(small, large, { 'small.html': 'FILE', 'large.html': 'FILE' });
  });

  it('serves a historical version preview identically', async () => {
    const projectId = await createProject();
    await writeFile(projectId, 'small.html', artifact(SMALL_PAD));
    await writeFile(projectId, 'large.html', artifact(LARGE_PAD));

    const versionOf = async (name: string): Promise<string> => {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/files/${name}/versions`);
      expect(response.ok).toBe(true);
      const body = await response.json() as { versions: Array<{ id: string; current: boolean }> };
      const current = body.versions.find((version) => version.current) ?? body.versions[0];
      expect(current).toBeTruthy();
      return current!.id;
    };
    const smallVersion = await versionOf('small.html');
    const largeVersion = await versionOf('large.html');

    const query = 'odPreviewBridge=sandbox&odPreviewBridge=redirect&odPreviewBridge=focus';
    const small = await read(`${baseUrl}/api/projects/${projectId}/version-preview/${smallVersion}/small.html?${query}`);
    const large = await read(`${baseUrl}/api/projects/${projectId}/version-preview/${largeVersion}/large.html?${query}`);

    expectSameBehavior(small, large, { 'small.html': 'FILE', 'large.html': 'FILE' });
  });

  it('serves the scoped preview origin identically', async () => {
    const projectId = await createProject();
    await writeFile(projectId, 'small.html', artifact(SMALL_PAD));
    await writeFile(projectId, 'large.html', artifact(LARGE_PAD));

    const scoped = async (name: string) => {
      const response = await fetch(`${baseUrl}/api/projects/${projectId}/preview-url?file=${name}`);
      expect(response.ok).toBe(true);
      const body = await response.json() as { scopedOrigin?: { normalUrl: string } };
      expect(body.scopedOrigin?.normalUrl).toBeTruthy();
      const normalUrl = new URL(body.scopedOrigin!.normalUrl);
      const session = normalUrl.hostname.split('.')[0]!.replace(/^[np]-/u, '');
      const served = await hostRequest(
        `${normalUrl.pathname}?odPreviewBridge=sandbox&odPreviewBridge=focus&odPreviewBridge=redirect`,
        normalUrl.host,
      );
      return { served, session };
    };
    const small = await scoped('small.html');
    const large = await scoped('large.html');

    expectSameBehavior(small.served, large.served, {
      'small.html': 'FILE',
      'large.html': 'FILE',
      [small.session]: 'SESSION',
      [large.session]: 'SESSION',
    });
  });

  // One registry is what makes "a bridge reached only one path" impossible to
  // write. This asks for every registered bridge at once and checks each one
  // arrived in a large document exactly once, where the small one has it.
  it('installs every registered bridge into a large document where a small one gets it', async () => {
    const registry = (projectRoutes as Record<string, unknown>).URL_PREVIEW_BRIDGES as
      | ReadonlyArray<{ name: string; tokens: readonly string[]; marker: string }>
      | undefined;
    expect(registry, 'routes/project must export its URL preview bridge registry').toBeDefined();
    expect(registry!.length).toBeGreaterThan(0);

    const projectId = await createProject();
    await writeFile(projectId, 'small.html', artifact(SMALL_PAD));
    await writeFile(projectId, 'large.html', artifact(LARGE_PAD));
    const query = registry!.map((bridge) => `odPreviewBridge=${bridge.tokens[0]}`).join('&');

    const small = await read(`${baseUrl}/api/projects/${projectId}/raw/small.html?${query}`);
    const large = await read(`${baseUrl}/api/projects/${projectId}/raw/large.html?${query}`);
    const smallProfile = profile(small.status, small.body);
    const largeProfile = profile(large.status, large.body);

    for (const bridge of registry!) {
      const inSmall = smallProfile.injected.find((entry) => entry.marker === bridge.marker);
      const inLarge = largeProfile.injected.find((entry) => entry.marker === bridge.marker);
      expect(inSmall, `${bridge.name} in a small document`).toMatchObject({ count: 1 });
      expect(inLarge, `${bridge.name} in a large document`).toEqual(inSmall);
    }
  });
});

// Evidence for where the build-focus bridge may sit. Its end-of-body placement
// was justified as "must not run before the document it measures exists"; the
// streamed copy was put in `<head>` as "head-safe". Run the real script in a
// real parser both ways: if its DOM work waits for the document, the two
// placements report the same page.
describe('the build-focus bridge waits for the document wherever it is placed', () => {
  const page = [
    '<main><section><h2>Hero</h2><p>Lead</p></section>',
    '<section><h2>Pricing</h2><p>Plans</p></section>',
    '<section><h2>Contact</h2><p>Mail</p></section></main>',
  ].join('');

  async function sectionsReported(html: string): Promise<{ ready: boolean; labels: string[] }> {
    const posted: Array<{ type?: string; sections?: Array<{ label: string }> }> = [];
    const dom = new JSDOM(html, {
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window: any) {
        // jsdom does no layout; give every element a box so a section counts.
        window.Element.prototype.getBoundingClientRect = () => ({
          left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, x: 0, y: 0,
        });
        window.parent.postMessage = (message: unknown) => {
          posted.push(message as { type?: string });
        };
      },
    });
    await new Promise<void>((resolve) => dom.window.addEventListener('load', () => resolve()));
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
    dom.window.close();
    const sections = posted.filter((message) => message.type === PREVIEW_BUILD_FOCUS_SECTIONS_TYPE);
    return {
      ready: posted.some((message) => message.type === PREVIEW_BUILD_FOCUS_READY_TYPE),
      labels: (sections[0]?.sections ?? []).map((section) => section.label),
    };
  }

  it('reports every section of the page from <head> just as from the end of <body>', async () => {
    const bridge = buildPreviewBuildFocusBridge();
    const inHead = await sectionsReported(
      `<!doctype html><html><head>${bridge}</head><body>${page}</body></html>`,
    );
    const atBodyEnd = await sectionsReported(
      `<!doctype html><html><head></head><body>${page}${bridge}</body></html>`,
    );

    expect(atBodyEnd).toEqual({ ready: true, labels: ['Hero', 'Pricing', 'Contact'] });
    expect(inHead).toEqual(atBodyEnd);
  });
});

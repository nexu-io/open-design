import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { ChatRunStatusResponse } from '@open-design/contracts';
import { PNG } from 'pngjs';
import { expect } from 'vitest';

import { createFakeAgentRuntimes } from '../fake-agents.ts';
import { T } from '../timeouts.ts';
import type { E2eReport } from './report.ts';
import { PACKAGED_THUMBNAIL_HTML, PACKAGED_THUMBNAIL_PNG_A_BASE64, PACKAGED_THUMBNAIL_PNG_B_BASE64 } from '../../resources/packaged-thumbnail.ts';

type Inspect = (expression: string) => Promise<unknown>;
type Ref = { id: string; label: string; kind: string; snapshotId?: string; snapshotState: string; thumbnailUrl?: string };

/** Real packaged desktop only. This never writes a message, snapshot, or thumbnail. */
export async function verifyPackagedThumbnail(input: {
  inspect: Inspect;
  fixtureRoot: string;
  report: E2eReport;
  screenshot: (relpath: string) => Promise<void>;
}): Promise<void> {
  const { inspect, report } = input;
  const originalHref = await inspect('location.href');
  if (typeof originalHref !== 'string') throw new Error('desktop location unavailable');
  const prefix = 'thumbnail-binding';
  const journal: Array<{ path: string; method: string; status: number }> = [];
  async function request<T>(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST'): Promise<T> {
    const result = await inspect(`(async () => {
      const response = await fetch(${JSON.stringify(path)}, {
        method: ${JSON.stringify(method)}, cache: 'no-store',
        headers: {'Content-Type': 'application/json'},
        ${body === undefined ? '' : `body: ${JSON.stringify(JSON.stringify(body))},`}
      });
      const text = await response.text();
      return {status: response.status, text};
    })()`) as { status: number; text: string };
    journal.push({ path, method, status: result.status });
    expect(result.status, `${method} ${path}: ${result.text.slice(0, 500)}`).toBeGreaterThanOrEqual(200);
    expect(result.status, `${method} ${path}: ${result.text.slice(0, 500)}`).toBeLessThan(300);
    return JSON.parse(result.text) as T;
  }
  async function thumbnail(url: string): Promise<Buffer> {
    const result = await inspect(`(async () => {
      const response = await fetch(${JSON.stringify(url)}, {cache:'no-store'});
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      return {status: response.status, mime: response.headers.get('content-type'), base64: btoa(binary)};
    })()`) as { status: number; mime: string; base64: string };
    expect(result.status).toBe(200);
    expect(result.mime).toBe('image/png');
    return Buffer.from(result.base64, 'base64');
  }

  const resources = join(input.fixtureRoot, 'input');
  const html = PACKAGED_THUMBNAIL_HTML;
  const imageA = Buffer.from(PACKAGED_THUMBNAIL_PNG_A_BASE64, 'base64');
  const imageB = Buffer.from(PACKAGED_THUMBNAIL_PNG_B_BASE64, 'base64');
  await mkdir(resources, { recursive: true });
  await Promise.all([
    writeFile(join(resources, 'index.html'), html, 'utf8'),
    writeFile(join(resources, 'a.png'), imageA),
    writeFile(join(resources, 'b.png'), imageB),
  ]);
  // Freeze source input identity; these are source assets, never renderer output.
  await report.json(`${prefix}/input.json`, {
    htmlSha256: sha(html), imageASha256: sha(imageA), imageBSha256: sha(imageB),
    description: 'Derived filter/input/SVG reproduction, not the original full user page',
  });
  const original = await request<{ config: Record<string, unknown> }>('/api/app-config');
  const fake = await createFakeAgentRuntimes({ root: input.fixtureRoot, runtimeIds: ['codex'], recordInvocations: true });
  let passed = false;
  let hasPrimaryError = false;
  let primaryError: unknown;
  let phase = 'configure';
  let lastRun: ChatRunStatusResponse | null = null;
  try {
    await request('/api/app-config', {
      ...original.config,
      mode: 'daemon', agentId: 'codex', onboardingCompleted: true,
      odNextStrategyMode: 'off', skillId: null, designSystemId: null,
      agentCliEnv: {
        ...(original.config.agentCliEnv as Record<string, unknown> | undefined),
        codex: { ...fake.codex.env },
      },
    }, 'PUT');
    phase = 'create-project';
    const project = await request<{ project: { id: string }; conversationId: string }>('/api/projects', {
      id: `thumbnail-${randomUUID()}`, name: 'Packaged thumbnail binding', metadata: { kind: 'prototype' },
    });
    const projectPath = `/api/projects/${project.project.id}`;
    const conversationPath = `${projectPath}/conversations/${project.conversationId}`;
    const prompt = 'Create the packaged thumbnail filter SVG fixture';
    phase = 'create-run';
    const created = await request<{ runId: string }>('/api/runs', {
      projectId: project.project.id, conversationId: project.conversationId,
      clientRequestId: randomUUID(), agentId: 'codex', model: 'default', reasoning: 'default',
      message: prompt, currentPrompt: prompt, sessionMode: 'chat', skillId: null, designSystemId: null,
      // Omit assistantMessageId: the normal API owns both the message seed and pin.
    });
    phase = 'wait-natural-terminal';
    await expect.poll(async () => {
      const observed = await request<ChatRunStatusResponse>(`/api/runs/${created.runId}`);
      lastRun = observed;
      // A failed terminal satisfies the wait, then fails the assertion outside
      // poll. Throwing inside poll would hide its actual error until timeout.
      return observed.status === 'failed' || observed.status === 'canceled'
        || (observed.status === 'succeeded' && observed.childExited === true);
    }, { timeout: T.xlong, message: 'real child must finish naturally before snapshot verification' }).toBe(true);
    const terminal = await request<ChatRunStatusResponse>(`/api/runs/${created.runId}`);
    lastRun = terminal;
    expect(terminal.status, JSON.stringify(terminal)).toBe('succeeded');
    expect(terminal.childExited).toBe(true);
    expect(terminal.exitCode).toBe(0);
    expect(terminal.agentId).toBe('codex');
    expect(terminal.strategyTask).toBeUndefined();
    expect(terminal.projectId).toBe(project.project.id);
    expect(terminal.conversationId).toBe(project.conversationId);
    expect(terminal.assistantMessageId).toEqual(expect.any(String));
    await report.json(`${prefix}/run.json`, terminal);

    phase = 'wait-bound-snapshot';
    const refsPath = `${conversationPath}/messages/${terminal.assistantMessageId}/artifacts`;
    await expect.poll(async () => {
      const { artifacts } = await request<{ artifacts: Ref[] }>(refsPath);
      const htmlRef = artifacts.find((ref) => ref.label === 'index.html' && ref.kind === 'html');
      if (htmlRef?.snapshotState === 'failed') throw new Error(JSON.stringify(htmlRef));
      return htmlRef?.snapshotState;
    }, { timeout: T.xlong, message: 'real Electron thumbnail must become a durable ready ref' }).toBe('ready');
    const readyRefs = await request<{ artifacts: Ref[] }>(refsPath);
    const htmlRef = readyRefs.artifacts.find((ref) => ref.label === 'index.html' && ref.kind === 'html');
    if (!htmlRef?.snapshotId || !htmlRef.thumbnailUrl) throw new Error('ready HTML ref missing snapshot identity/thumbnail');
    const frozenRef = { ...htmlRef };
    const thumbnailUrl = htmlRef.thumbnailUrl;
    const snapshotPath = `${projectPath}/chat-artifact-snapshots/${htmlRef.snapshotId}`;
    const snapshot = await request<{ snapshot: Record<string, unknown> }>(snapshotPath);
    expect(snapshot.snapshot).toMatchObject({
      id: htmlRef.snapshotId, projectId: project.project.id,
      sourcePathAtCapture: 'index.html', state: 'ready',
    });
    const messages = await request<{ messages: Array<{ id: string; runId?: string; runStatus?: string; artifactRefs?: Ref[] }> }>(`${conversationPath}/messages`);
    const owner = messages.messages.find((message) => message.id === terminal.assistantMessageId);
    expect(owner).toMatchObject({ runId: created.runId, runStatus: 'succeeded' });
    expect(owner?.artifactRefs).toEqual(expect.arrayContaining([expect.objectContaining({ snapshotId: htmlRef.snapshotId })]));
    phase = 'verify-rendered-pixels';
    const png = await thumbnail(htmlRef.thumbnailUrl);
    await report.save(`${prefix}/captured-a.png`, png);
    await report.json(`${prefix}/before.json`, { frozenRef, snapshot, messages });
    expect(snapshot.snapshot.thumbnailDigest).toBe(`sha256:${sha(png)}`);
    const pixels = quadrantEvidence(png, imageA);
    await report.json(`${prefix}/pixels-a.json`, pixels);

    phase = 'mutate-source-and-verify-history';
    // Normal file mutation after a completed run; no write to historical messages or snapshots.
    await request(`${projectPath}/files`, { name: 'assets/a.png', content: imageB.toString('base64'), encoding: 'base64', overwrite: true });
    await request(`${projectPath}/files`, { name: 'index.html', content: html.replace('2809 image decode fixture', 'Source B now'), encoding: 'utf8', overwrite: true });
    const persistedB = await thumbnail(`${projectPath}/raw/assets/a.png`);
    expect(sha(persistedB)).toBe(sha(imageB));
    expect(sha(persistedB)).not.toBe(sha(imageA));
    await report.save(`${prefix}/source-b.png`, persistedB);
    const after = await request<{ artifacts: Ref[] }>(refsPath);
    expect(after.artifacts.find((ref) => ref.id === frozenRef.id)).toEqual(frozenRef);
    expect(await request(snapshotPath)).toEqual(snapshot);
    const afterPng = await thumbnail(thumbnailUrl);
    expect(sha(afterPng)).toBe(sha(png));
    quadrantEvidence(afterPng, imageA);

    phase = 'verify-visible-card-and-reload';
    const route = `/projects/${project.project.id}/conversations/${project.conversationId}`;
    // Trigger ordinary navigation then inspect the real Chat image, not an injected canvas/card.
    await inspect(`(() => { setTimeout(() => location.assign(${JSON.stringify(route)}), 0); return true; })()`);
    async function visibleCover(): Promise<unknown> {
      return inspect(`(() => Array.from(document.images).filter(image =>
        image.src.includes(${JSON.stringify(frozenRef.snapshotId)}) && image.getBoundingClientRect().width > 0
      ).map(image => ({src:image.src, complete:image.complete, width:image.naturalWidth, height:image.naturalHeight})))()`);
    }
    await expect.poll(visibleCover, { timeout: T.long }).toEqual(expect.arrayContaining([
      expect.objectContaining({ complete: true, width: PNG.sync.read(png).width, height: PNG.sync.read(png).height }),
    ]));
    await report.json(`${prefix}/card-before-reload.json`, await visibleCover());
    await input.screenshot(`${prefix}/card-before-reload.png`);
    await inspect('(() => { setTimeout(() => location.reload(), 0); return true; })()');
    await expect.poll(visibleCover, { timeout: T.long }).toEqual(expect.arrayContaining([
      expect.objectContaining({ complete: true, width: PNG.sync.read(png).width, height: PNG.sync.read(png).height }),
    ]));
    await report.json(`${prefix}/card-after-reload.json`, await visibleCover());
    await input.screenshot(`${prefix}/card-after-reload.png`);
    expect(await request(snapshotPath)).toEqual(snapshot);
    expect(sha(await thumbnail(thumbnailUrl))).toBe(sha(png));
    if (!fake.codex.invocation) throw new Error('CLI invocation recorder missing');
    const invocationText = await readFile(fake.codex.invocation.path, 'utf8');
    const writes = invocationText.trim().split('\n').filter(Boolean)
      .map((line: string) => JSON.parse(line) as { event?: string; nonce?: string })
      .filter((event) => event.event === 'thumbnail-written');
    expect(writes).toHaveLength(1);
    expect(writes[0]?.nonce).toBe(fake.codex.invocation.nonce);
    await report.json(`${prefix}/body-verified.json`, { runId: created.runId, project, frozenRef, snapshot, pixels, sourceChangedToB: true });
    phase = 'verified';
    passed = true;
  } catch (error) {
    hasPrimaryError = true;
    primaryError = error;
  } finally {
    const cleanupErrors: Array<{ step: string; error: unknown }> = [];
    async function cleanup(step: string, action: () => Promise<unknown>): Promise<void> {
      try { await action(); } catch (error) { cleanupErrors.push({ step, error }); }
    }
    await cleanup('save last run observation', () => report.json(`${prefix}/last-run.json`, { phase, run: lastRun }));
    // Saving diagnostics must not prevent the following configuration restore.
    const invocation = fake.codex.invocation;
    if (invocation) await cleanup('save CLI log', async () =>
      report.save(`${prefix}/cli-invocations.jsonl`, await readFile(invocation.path)));
    await cleanup('restore app config', () => request('/api/app-config', original.config, 'PUT'));
    await cleanup('restore desktop route', async () => {
      await inspect(`(() => { setTimeout(() => location.assign(${JSON.stringify(originalHref)}), 0); return true; })()`);
      await expect.poll(() => inspect('document.readyState === "complete" ? location.href : null'), { timeout: T.long }).toBe(originalHref);
    });
    await cleanup('save HTTP journal', () => report.json(`${prefix}/http-journal.json`, journal));
    // Preserve scratch on either business failure or failed cleanup for diagnosis.
    if (passed && cleanupErrors.length === 0) await cleanup('remove CLI fixture', () =>
      rm(input.fixtureRoot, { recursive: true, force: true }));
    await cleanup('save final result', () => report.json(`${prefix}/result.json`, {
      passed: passed && !hasPrimaryError && cleanupErrors.length === 0,
      phase, lastRun,
      primaryError: hasPrimaryError ? errorText(primaryError) : null,
      cleanupErrors: cleanupErrors.map(({ step, error }) => ({ step, error: errorText(error) })),
    }));
    if (cleanupErrors.length > 0) {
      console.error('packaged thumbnail cleanup failed', cleanupErrors.map(({ step, error }) => ({ step, error: errorText(error) })));
    }
    // Preserve the original assertion/transport failure, including a non-Error throw.
    // Cleanup errors still fail an otherwise successful test; none become a green skip.
    if (hasPrimaryError) throw primaryError;
    if (cleanupErrors.length > 0) throw new AggregateError(
      cleanupErrors.map(({ step, error }) => new Error(step, { cause: error })),
      'packaged thumbnail cleanup failed',
    );
  }
}

function errorText(error: unknown): string { return error instanceof Error ? error.stack ?? error.message : String(error); }

function sha(value: string | Buffer): string { return createHash('sha256').update(value).digest('hex'); }

function quadrantEvidence(bytes: Buffer, source: Buffer): unknown {
  const actual = PNG.sync.read(bytes);
  const reference = PNG.sync.read(source);
  // capturePage returns physical pixels; the product viewport is logical.
  // Allow pixel rounding at fractional display scales, not a different aspect ratio.
  const scale = actual.width / 1440;
  expect(scale).toBeGreaterThan(0);
  expect(Math.abs(actual.height - 900 * scale)).toBeLessThanOrEqual(1);
  const areaScale = scale * (actual.height / 900);
  let svgDarkPixels = 0;
  for (let y = Math.floor(32 * scale); y < Math.ceil(56 * scale); y++)
    for (let x = Math.floor(32 * scale); x < Math.ceil(56 * scale); x++) {
    const i = (y * actual.width + x) * 4;
    if ((actual.data[i] ?? 255) < 80 && (actual.data[i + 1] ?? 255) < 80
      && (actual.data[i + 2] ?? 255) < 80 && actual.data[i + 3] === 255) svgDarkPixels++;
  }
  expect(svgDarkPixels, 'original SVG search icon must survive the real render').toBeGreaterThan(15 * areaScale);
  const locations = [[16, 16], [48, 16], [16, 48], [48, 48]];
  const bounds = locations.map(([x, y]) => {
    if (x === undefined || y === undefined) throw new Error('invalid source sample');
    const offset = (y * reference.width + x) * 4;
    const color = Array.from(reference.data.subarray(offset, offset + 4));
    let count = 0, minX = actual.width, minY = actual.height, maxX = -1, maxY = -1;
    for (let py = 0; py < actual.height; py++) for (let px = 0; px < actual.width; px++) {
      const i = (py * actual.width + px) * 4;
      if (color.every((value, channel) => Math.abs((actual.data[i + channel] ?? -255) - value) <= 2)) {
        count++; minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
      }
    }
    expect(count, `source A quadrant ${color} absent from actual Electron PNG`).toBeGreaterThan(500 * areaScale);
    return { color, count, minX, minY, maxX, maxY };
  });
  const [tl, tr, bl, br] = bounds;
  if (!tl || !tr || !bl || !br) throw new Error('missing color quadrants');
  expect(tl.maxX).toBeLessThan(tr.minX); expect(bl.maxX).toBeLessThan(br.minX);
  expect(tl.maxY).toBeLessThan(bl.minY); expect(tr.maxY).toBeLessThan(br.minY);
  return { width: actual.width, height: actual.height, logicalViewport: { width: 1440, height: 900 }, scale, areaScale, svgDarkPixels, bounds };
}

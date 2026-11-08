/** Real process + production registrar; only the upstream transport is controlled. */
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { PassThrough } from 'node:stream';
import type { Express, Request, Response } from 'express';
import type { AppConfigPrefs } from '../../src/app-config.js';
import { registerVelaRoutes } from '../../src/routes/vela.js';

const dataDir = process.argv[2]!;
const placementKey = 'opend.home.campaign-modal';
const entry = 'export function mount() {}';
const digest = `sha256:${createHash('sha256').update(entry).digest('hex')}`;
const env = { VELA_CONTROL_KEY: 'ck-account-a', VELA_API_URL: 'http://runtime.invalid' };
let handler: (req: Request, res: Response) => Promise<void>;
const app = { get: () => {}, post: () => {}, all: (paths: string[], value: typeof handler) => {
  if (paths[0] === '/api/touchpoints/production-runtime') handler = value;
} } as unknown as Express;
const lifecycle = registerVelaRoutes(app, {
  paths: { RUNTIME_DATA_DIR: dataDir }, appConfig: { readAppConfig: async () => ({ agentCliEnv: {} }) as AppConfigPrefs }, http: {}, env,
});
function grant() {
  const now = Date.now();
  return {
    activityId: 'activity-1', deploymentId: 'deployment-1', touchpointDecisionId: 'decision-1',
    placementKey, serverTime: new Date(now).toISOString(), startsAt: new Date(now - 60_000).toISOString(),
    endsAt: new Date(now + 3_600_000).toISOString(), authorizationExpiresAt: new Date(now + 60_000).toISOString(),
    content: { id: 'version-1', placementKey, locale: 'en-US',
      manifest: { resources: ['entry.js'], placements: [{ key: placementKey, entry: 'entry.js' }] },
      manifestHash: 'sha256:manifest', entryPath: 'entry.js', entryDigest: digest, entryModule: entry,
      resources: [{ path: 'entry.js', digest, bytes: Buffer.from(entry).toString('base64') }],
      runtime: { kind: 'web-component', apiVersion: 1 }, buildIdentity: { fingerprint: 'process-fixture' },
    },
  };
}
const original = { writeFileSync: fs.writeFileSync, writeSync: fs.writeSync, renameSync: fs.renameSync,
  rmSync: fs.rmSync, unlinkSync: fs.unlinkSync, fsyncSync: fs.fsyncSync, openSync: fs.openSync,
  readFileSync: fs.readFileSync, readdirSync: fs.readdirSync };
const refusal = () => { throw Object.assign(new Error('injected child-only storage failure'), { code: 'EACCES' }); };
function inject(fault?: string) {
  if (fault === 'assembly-read') fs.readFileSync = ((file, ...args) => {
    if (String(file).includes('/assemblies/')) return refusal();
    return Reflect.apply(original.readFileSync, fs, [file, ...args]);
  }) as typeof fs.readFileSync;
  if (fault === 'assembly-enumeration') fs.readdirSync = ((file, ...args) => {
    if (String(file).endsWith('/assemblies')) return refusal();
    return Reflect.apply(original.readdirSync, fs, [file, ...args]);
  }) as typeof fs.readdirSync;
  if (fault === 'rename') fs.renameSync = ((source, target) => {
    if (String(target).includes('/assemblies/')) return refusal();
    return original.renameSync(source, target);
  }) as typeof fs.renameSync;
  if (fault === 'delete') { fs.rmSync = refusal; fs.unlinkSync = refusal; }
  if (fault === 'all') {
    fs.writeFileSync = refusal; fs.writeSync = refusal; fs.renameSync = refusal;
    fs.rmSync = refusal; fs.unlinkSync = refusal; fs.fsyncSync = refusal;
    fs.openSync = ((file: fs.PathLike, flags: fs.OpenMode, ...rest: [fs.Mode?]) => {
      if (typeof flags === 'number' || flags !== 'r') return refusal();
      return original.openSync(file, flags, ...rest);
    }) as typeof fs.openSync;
  }
}
let response: { status: number; body?: unknown; fault?: string | undefined } | null = null;
let dispatches = 0;
let authorizations = 0;
// No network or upstream authorization in the fresh/offline process.
http.request = ((_url: URL, _options: unknown, callback: (stream: PassThrough) => void) => {
  dispatches++;
  const next = response;
  const request = Object.assign(new EventEmitter(), {
    destroyed: false, setTimeout: () => {}, write: () => {},
    end() { queueMicrotask(() => {
      if (!next) { request.emit('error', new Error('offline transport')); request.emit('close'); return; }
      if (next.status === 200) authorizations++;
      inject(next.fault); // Fault AFTER the durable pre-dispatch marker.
      const stream = Object.assign(new PassThrough(), { statusCode: next.status, headers: { 'content-type': 'application/json' }, complete: true });
      callback(stream); stream.end(JSON.stringify(next.body ?? {}));
      stream.once('end', () => request.emit('close'));
    }); },
    destroy(this: EventEmitter & { destroyed: boolean }) { if (!this.destroyed) { this.destroyed = true; this.emit('error', new Error('aborted')); this.emit('close'); } },
  });
  return request;
}) as unknown as typeof http.request;
async function call(locale = 'en-US', account = 'a', events = false, held = false) {
  env.VELA_CONTROL_KEY = `ck-account-${account}`;
  const route = '/api/touchpoints/production-runtime';
  const url = events ? `${route}/events` : `${route}?placementKey=${placementKey}&locale=${locale}${held ? '&heldContentId=version-1&heldContentLocale=en-US' : ''}`;
  const req = Object.assign(new EventEmitter(), { method: events ? 'POST' : 'GET', path: events ? `${route}/events` : route, url, headers: {}, body: {}, query: {} });
  const chunks: Buffer[] = [];
  const res = Object.assign(new PassThrough(), { statusCode: 200, headersSent: false,
    status(code: number) { this.statusCode = code; return this; }, setHeader() {}, json(this: PassThrough, body: unknown) { this.end(JSON.stringify(body)); return this; },
  });
  res.on('data', chunk => chunks.push(Buffer.from(chunk)));
  const done = new Promise<Record<string, unknown>>(resolve => res.once('finish', () => resolve(JSON.parse(Buffer.concat(chunks).toString()))));
  await handler!(req as unknown as Request, res as unknown as Response);
  return done;
}
process.on('message', async (message: { command: string; status?: number; fault?: string; events?: boolean; held?: boolean; trimmed?: boolean }) => {
  try {
    if (message.command === 'seed') {
      response = { status: 200, body: grant() };
      await call(); await call('zh-TW'); await call('en-US', 'b');
    } else if (message.command === 'refuse') {
      response = { status: message.status ?? 410, fault: message.fault, body: { error: 'production_runtime_revoked', receipt: {
        activityId: 'activity-1', deploymentId: 'deployment-1', contentVersionId: 'version-1', touchpointDecisionId: 'decision-1',
      } } };
      await call('en-US', 'a', message.events, message.held);
    } else if (message.command === 'recover') {
      Object.assign(fs, original);
    } else if (message.command === 'fresh') {
      const full = grant();
      const { content, ...envelope } = full;
      response = { status: 200, body: message.trimmed ? { ...envelope, contentOmitted: true, contentId: content.id, contentLocale: content.locale } : full };
      await call();
    } else if (message.command === 'pre-fault') {
      inject(message.fault); response = { status: 200, body: grant() }; await call();
    } else if (message.command === 'close') {
      const first = lifecycle.close(); const second = lifecycle.close();
      if (first !== second) throw new Error('close is not idempotent');
      await first;
    }
    response = null;
    const key = await call(); const alias = await call('zh-TW'); const account = await call('en-US', 'b');
    process.send?.({ command: message.command, pid: process.pid, key: key.deploymentId ?? null,
      alias: alias.deploymentId ?? null, account: account.deploymentId ?? null, dispatches, authorizations, keySchedule: key.endsAt ?? null });
  } catch (error) { process.send?.({ command: message.command, pid: process.pid, error: String(error) }); }
});
process.send?.({ command: 'ready', pid: process.pid });

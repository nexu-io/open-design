import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { buildAutomaticDiagnostics } from '@open-design/diagnostics';
import { DiagnosticConsentFence } from '../src/services/diagnostic-consent.js';
import { automaticDiagnosticsConsent, appConfigDir } from '../src/app-config.js';

it('never backfills content written while disabled after opting in and restarting', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostic-consent-'));
  try {
    const log = join(dir, 'daemon.log'); await writeFile(log, 'private while disabled\n');
    const source = { name: 'logs/daemon.log', absolutePath: log, kind: 'text' as const };
    const fence = new DiagnosticConsentFence(dir, false);
    fence.change(true); await fence.baseline([source]);
    await appendFile(log, 'newly consented failure\n');
    const reopened = new DiagnosticConsentFence(dir, true);
    const result = await buildAutomaticDiagnostics({ directory: join(dir, 'bundle'), incidentId: 'incident', summary: {}, sources: await reopened.apply([source]) });
    const archive = Buffer.concat(await Promise.all(result.manifest.chunks.map((c) => readFile(join(dir, 'bundle', String(c.index))))));
    const text = gunzipSync(archive).toString();
    expect(text).not.toContain('private while disabled'); expect(text).toContain('newly consented failure');
    expect(result.manifest.completeness).toBe('partial');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

it('fails closed for corrupt preferences instead of restoring telemetry defaults', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'diagnostic-prefs-'));
  const prior = process.env.OD_DATA_DIR; process.env.OD_DATA_DIR = dir;
  try {
    const file = join(appConfigDir(dir), 'app-config.json');
    await writeFile(file, '{broken'); expect(automaticDiagnosticsConsent(dir)).toBe(false);
    await writeFile(file, '{"telemetry":{"metrics":true,"content":false}}'); expect(automaticDiagnosticsConsent(dir)).toBe(false);
    await writeFile(file, '{"telemetry":{"metrics":true,"content":true}}'); expect(automaticDiagnosticsConsent(dir)).toBe(true);
  } finally {
    if (prior === undefined) delete process.env.OD_DATA_DIR; else process.env.OD_DATA_DIR = prior;
    await rm(dir, { recursive: true, force: true });
  }
});

// OPEND-3371. The daemon holds the bytes of a content package it has already
// downloaded, so a steady-state production refresh can ask Vela to omit them.
//
// Every case here exists to pin the same property from a different angle: the
// cache is allowed to say "no", and it is never allowed to say something wrong.
// A miss, a corrupted blob, a digest that does not describe its own bytes, an
// unwritable data directory — each has to leave the caller in exactly the
// position it would be in with no cache at all.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTouchpointContentCache } from '../src/routes/touchpoint-content-cache.js';

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const base64 = (value: string) => Buffer.from(value, 'utf8').toString('base64');

const SHARED = 'export const shared = 1;';
const MODAL_ENTRY = "import './shared.js'; export function mount(root) { root.textContent = 'modal'; }";
const BADGE_ENTRY = "import './shared.js'; export function mount(root) { root.textContent = 'badge'; }";

const manifest = (placementKey: string, entry: string) => ({
  formatVersion: 2,
  runtimeKind: 'web-component',
  runtimeApiVersion: 1,
  platformWrapperVersion: 'vela-touchpoint-wrapper-v1',
  sdkVersion: 'vela-touchpoint-sdk-v1',
  contentLine: 'production',
  placements: [
    {
      key: placementKey,
      entry,
      resources: ['shared.js'],
      locales: ['en-US'],
      requiredCapabilities: [],
      staticActions: [],
    },
  ],
  resources: [entry, 'shared.js'],
  images: [],
});

const content = (placementKey: string, entryPath: string, entryModule: string) => ({
  id: 'version-1',
  placementKey,
  locale: 'en-US',
  manifest: manifest(placementKey, entryPath),
  manifestHash: digest(JSON.stringify(manifest(placementKey, entryPath))),
  entryPath,
  entryDigest: digest(entryModule),
  entryModule,
  resources: [
    { path: entryPath, digest: digest(entryModule), bytes: base64(entryModule) },
    { path: 'shared.js', digest: digest(SHARED), bytes: base64(SHARED) },
  ],
  runtime: {
    kind: 'web-component',
    apiVersion: 1,
    wrapperVersion: 'vela-touchpoint-wrapper-v1',
    sdkVersion: 'vela-touchpoint-sdk-v1',
  },
  buildIdentity: { fingerprint: 'fixed' },
});

/** Today's full response, in today's field order. */
const fullResponse = (placementKey: string, entryPath: string, entryModule: string) => ({
  deploymentId: 'deployment-1',
  activityId: 'activity-1',
  snapshotHash: 'sha256:snapshot',
  artifactHash: 'sha256:artifact',
  manifestHash: 'sha256:manifest',
  placementKey,
  requiredCapabilities: [],
  staticActions: [],
  testContext: null,
  content: content(placementKey, entryPath, entryModule),
  serverTime: '2026-09-18T00:00:00.000Z',
  startsAt: '2026-09-18T00:00:00.000Z',
  endsAt: '2026-09-19T00:00:00.000Z',
  authorizationExpiresAt: '2026-09-18T01:00:00.000Z',
  touchpointDecisionId: 'decision-1',
});

/** The C3 trimmed response: the same object with `content` replaced in place. */
const trimmedResponse = (full: Record<string, unknown>) => {
  const trimmed: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(full)) {
    if (field === 'content') trimmed.contentOmitted = true;
    else trimmed[field] = value;
  }
  return trimmed;
};

const MODAL = { placementKey: 'opend.home.campaign-modal', locale: 'en-US' } as const;
const BADGE = { placementKey: 'opend.home.account-badge', locale: 'en-US' } as const;

let dataDir: string;
beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'od-touchpoint-cache-'));
});
afterEach(() => {
  try {
    fs.chmodSync(path.join(dataDir, 'touchpoint-content-cache'), 0o700);
  } catch {
    /* the directory may not exist, or may already be writable */
  }
  rmSync(dataDir, { recursive: true, force: true });
});

const blobsDir = () => path.join(dataDir, 'touchpoint-content-cache', 'blobs');

describe('touchpoint content cache', () => {
  it('rebuilds a trimmed response into the full one, field for field', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    expect(cache.held(MODAL)).toBeNull();
    cache.remember(MODAL, full);
    expect(cache.held(MODAL)).toEqual({ heldContentId: 'version-1', heldContentLocale: 'en-US' });
    const rebuilt = cache.reassemble(MODAL, trimmedResponse(full));
    expect(rebuilt).toEqual(full);
    // Field order too: the browser parses the same object shape it does today,
    // and `contentOmitted` never reaches it.
    expect(JSON.stringify(rebuilt)).toBe(JSON.stringify(full));
    expect(Object.keys(rebuilt ?? {})).not.toContain('contentOmitted');
  });

  it('stores one copy of a resource two placements share', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    cache.remember(BADGE, fullResponse(BADGE.placementKey, 'badge.js', BADGE_ENTRY));
    // Two distinct entries plus the one `shared.js` both of them import.
    expect(fs.readdirSync(blobsDir()).sort()).toHaveLength(3);
    expect(cache.reassemble(MODAL, trimmedResponse(fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY)))).toEqual(
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY),
    );
    expect(cache.reassemble(BADGE, trimmedResponse(fullResponse(BADGE.placementKey, 'badge.js', BADGE_ENTRY)))).toEqual(
      fullResponse(BADGE.placementKey, 'badge.js', BADGE_ENTRY),
    );
  });

  it('refuses to rebuild from a blob whose bytes no longer match its digest', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    cache.remember(MODAL, full);
    const [corrupted] = fs.readdirSync(blobsDir());
    fs.writeFileSync(path.join(blobsDir(), corrupted as string), base64('tampered'));
    expect(cache.reassemble(MODAL, trimmedResponse(full))).toBeNull();
  });

  it('does not offer content it can no longer read', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    rmSync(blobsDir(), { recursive: true, force: true });
    expect(cache.held(MODAL)).toBeNull();
  });

  it('ignores an unreadable assembly record', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    cache.remember(MODAL, full);
    const assemblies = path.join(dataDir, 'touchpoint-content-cache', 'assemblies');
    for (const file of fs.readdirSync(assemblies))
      fs.writeFileSync(path.join(assemblies, file), 'not json');
    expect(cache.held(MODAL)).toBeNull();
    expect(cache.reassemble(MODAL, trimmedResponse(full))).toBeNull();
  });

  it('stores nothing from a response whose digest does not describe its own bytes', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    full.content.resources[1] = {
      path: 'shared.js',
      digest: digest(SHARED),
      bytes: base64('something else entirely'),
    };
    cache.remember(MODAL, full);
    expect(cache.held(MODAL)).toBeNull();
  });

  it('survives a data directory it cannot write to', () => {
    const root = path.join(dataDir, 'touchpoint-content-cache');
    fs.mkdirSync(root, { recursive: true });
    fs.chmodSync(root, 0o500);
    const cache = createTouchpointContentCache(dataDir);
    expect(() =>
      cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY)),
    ).not.toThrow();
    expect(cache.held(MODAL)).toBeNull();
  });

  it('keeps two data roots from seeing each other', () => {
    const other = mkdtempSync(path.join(tmpdir(), 'od-touchpoint-cache-b-'));
    try {
      const a = createTouchpointContentCache(dataDir);
      const b = createTouchpointContentCache(other);
      a.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
      expect(a.held(MODAL)).not.toBeNull();
      expect(b.held(MODAL)).toBeNull();
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it('derives its whole layout from the data root it is given', () => {
    const cache = createTouchpointContentCache(dataDir);
    cache.remember(MODAL, fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY));
    const root = path.join(dataDir, 'touchpoint-content-cache');
    expect(fs.existsSync(root)).toBe(true);
    expect(fs.readdirSync(root).sort()).toEqual(['assemblies', 'blobs', 'modules']);
  });
});

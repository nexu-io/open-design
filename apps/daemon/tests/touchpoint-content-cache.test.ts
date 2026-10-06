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

// 25 bytes, deliberately not a multiple of three: its base64 form therefore
// carries padding, which is what makes appended garbage invisible to Node's
// tolerant decoder. A fixture whose length divides by three would fold the
// garbage into the decode, break the digest, and pass for the wrong reason.
const SHARED = 'export const shared = 1;\n';
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

// One (environment, account). OPEND-3436 isolates the whole store by it, so
// every key here names the same one and the cases go on being about content.
const SCOPE = 'account-1@https://amr-api.example';
const MODAL = { scope: SCOPE, placementKey: 'opend.home.campaign-modal', locale: 'en-US' } as const;
const BADGE = { scope: SCOPE, placementKey: 'opend.home.account-badge', locale: 'en-US' } as const;
/** What a daemon holding today's fixture would have offered upstream before asking. */
const HELD_V1 = { heldContentId: 'version-1', heldContentLocale: 'en-US' } as const;

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

/** The one scope directory the fixtures in this file write into. */
const scopeDir = () => {
  const root = path.join(dataDir, 'touchpoint-content-cache');
  const [only] = fs.existsSync(root) ? fs.readdirSync(root) : [];
  return path.join(root, only ?? 'missing-scope');
};
const blobsDir = () => path.join(scopeDir(), 'blobs');
const assembliesDir = () => path.join(scopeDir(), 'assemblies');
/** The file a digest names, so a case can damage one specific blob rather than whichever one readdir happens to list first. */
const blobFile = (value: string) => path.join(blobsDir(), value.slice('sha256:'.length));

describe('touchpoint content cache', () => {
  it('rebuilds a trimmed response into the full one, field for field', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    expect(cache.held(MODAL)).toBeNull();
    cache.remember(MODAL, full);
    expect(cache.held(MODAL)).toEqual({ heldContentId: 'version-1', heldContentLocale: 'en-US' });
    const rebuilt = cache.reassemble(MODAL, HELD_V1, trimmedResponse(full));
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
    expect(cache.reassemble(MODAL, HELD_V1, trimmedResponse(fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY)))).toEqual(
      fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY),
    );
    expect(cache.reassemble(BADGE, HELD_V1, trimmedResponse(fullResponse(BADGE.placementKey, 'badge.js', BADGE_ENTRY)))).toEqual(
      fullResponse(BADGE.placementKey, 'badge.js', BADGE_ENTRY),
    );
  });

  it('refuses to rebuild against a version it was not asked to hold', () => {
    const cache = createTouchpointContentCache(dataDir);
    const first = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    cache.remember(MODAL, first);
    const held = cache.held(MODAL);
    expect(held).toEqual(HELD_V1);
    // A concurrent full response for the same placement lands while the first
    // attempt is still on the wire, and replaces the record under it.
    const second = JSON.parse(JSON.stringify(first)) as typeof first;
    second.content.id = 'version-2';
    cache.remember(MODAL, second);
    // The server trimmed its answer against version-1 and nothing else, so
    // version-2's bytes do not belong behind version-1's decision metadata --
    // however internally consistent each half is on its own.
    expect(cache.reassemble(MODAL, held!, trimmedResponse(first))).toBeNull();
  });

  it('still rebuilds when the server answered in a fallback locale', () => {
    const cache = createTouchpointContentCache(dataDir);
    const requested = { scope: SCOPE, placementKey: MODAL.placementKey, locale: 'zh-CN' } as const;
    // Vela resolves a placement locale through [requested, base language,
    // en-US], so a zh-CN request is legitimately answered with en-US content.
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    cache.remember(requested, full);
    const held = cache.held(requested);
    // What the daemon offers upstream is what it actually holds, not what it
    // asked for. Binding reassembly to the requested locale instead would
    // strand every placement the server answers through a fallback.
    expect(held).toEqual({ heldContentId: 'version-1', heldContentLocale: 'en-US' });
    expect(cache.reassemble(requested, held!, trimmedResponse(full))).toEqual(full);
  });

  it('refuses to rebuild from a blob whose bytes no longer match its digest', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    cache.remember(MODAL, full);
    const [corrupted] = fs.readdirSync(blobsDir());
    fs.writeFileSync(path.join(blobsDir(), corrupted as string), base64('tampered'));
    expect(cache.reassemble(MODAL, HELD_V1, trimmedResponse(full))).toBeNull();
  });

  it('refuses a blob whose stored bytes are not exactly the bytes its digest names', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    cache.remember(MODAL, full);
    // Node's base64 decoder silently drops every character outside the
    // alphabet, so a digest taken over the decoded view never covered these
    // bytes -- while the file, and whatever the cache hands back, still
    // carries them. The browser's `atob` is not tolerant the same way.
    fs.appendFileSync(blobFile(digest(SHARED)), 'GARBAGEXX');
    expect(cache.reassemble(MODAL, HELD_V1, trimmedResponse(full))).toBeNull();
  });

  it('hands back only bytes a browser can decode', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    cache.remember(MODAL, full);
    fs.appendFileSync(blobFile(digest(SHARED)), 'GARBAGEXX');
    const rebuilt = cache.reassemble(MODAL, HELD_V1, trimmedResponse(full)) as
      | { content: { resources: Array<{ bytes: string }> } }
      | null;
    // Either the cache refuses (it does now), or every resource it vouches for
    // survives the decoder the browser actually uses. What must never happen is
    // a package the daemon calls verified and the browser rejects.
    for (const resource of rebuilt?.content.resources ?? [])
      expect(() => atob(resource.bytes)).not.toThrow();
  });

  it('repairs a damaged blob the next time it holds the real bytes', () => {
    const cache = createTouchpointContentCache(dataDir);
    const full = fullResponse(MODAL.placementKey, 'modal.js', MODAL_ENTRY);
    cache.remember(MODAL, full);
    fs.writeFileSync(blobFile(digest(SHARED)), base64('tampered'));
    // The damage has to be real before its repair means anything.
    expect(cache.reassemble(MODAL, HELD_V1, trimmedResponse(full))).toBeNull();
    // This is the fallback's full response arriving: the one moment the daemon
    // holds the correct bytes for that blob again. Refusing to write them is
    // what turns one damaged file into a permanent trimmed-then-full round.
    cache.remember(MODAL, full);
    expect(cache.reassemble(MODAL, HELD_V1, trimmedResponse(full))).toEqual(full);
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
    const assemblies = assembliesDir();
    for (const file of fs.readdirSync(assemblies))
      fs.writeFileSync(path.join(assemblies, file), 'not json');
    expect(cache.held(MODAL)).toBeNull();
    expect(cache.reassemble(MODAL, HELD_V1, trimmedResponse(full))).toBeNull();
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
    // One directory per (environment, account), and the three layers inside it.
    expect(fs.readdirSync(root)).toHaveLength(1);
    expect(fs.readdirSync(scopeDir()).sort()).toEqual(['assemblies', 'blobs', 'modules']);
  });
});

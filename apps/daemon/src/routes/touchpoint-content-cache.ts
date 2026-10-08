import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  touchpointCachedIdentityOf,
  touchpointScheduleAllowsDisplay,
  touchpointScheduleHasEnded,
  touchpointScheduleOf,
  touchpointWithdrawalReclaims,
  TOUCHPOINT_OFFLINE_REPLAY_FIELD,
  type TouchpointCachedIdentity,
  type TouchpointOfflineReplayReason,
  type TouchpointSchedule,
} from '@open-design/contracts/api/touchpointOffline';

/**
 * Local store for touchpoint content bytes and the schedule they were
 * authorized under.
 *
 * It started (OPEND-3371) as a bandwidth optimization: hold the bytes of a
 * content package the daemon already downloaded so a steady-state production
 * refresh can ask Vela to omit them. OPEND-3436 added the second half —
 * the store now also holds the server's own `startsAt`/`endsAt`/`serverTime`/
 * `authorizationExpiresAt`, the activity/deployment/content identity, and the
 * decision envelope — so that a client which cannot reach the runtime at all
 * can go on showing the activity it was already authorized for, and stop the
 * moment that authorization runs out.
 *
 * Three layers:
 *
 *   - blobs, addressed by their own digest, so the four placements of one
 *     activity naturally share `shared.js` / `theme.css`;
 *   - an assembly record per (scope, placementKey, requested locale), naming
 *     the manifest, the entry, the path → digest map that puts a `content`
 *     object back together, and the schedule/identity above;
 *   - a scope directory per (environment, account), because a cache that one
 *     account can read into another's session is not a cache, it is a leak.
 *
 * What is deliberately NOT here: any opinion about WHICH activity should be
 * shown while the server is REACHABLE. The server re-decides that on every
 * request, so a cache can never pin a withdrawn or superseded activity onto
 * the screen. Offline is the one case where this store answers, and it answers
 * only from the last thing the server itself said, inside the window the server
 * itself set.
 *
 * Every operation is best-effort by construction. A miss, an unreadable file, a
 * digest that does not match, a read-only data directory — each one returns
 * `null` (or does nothing) and the caller falls back to the full request it
 * would have made anyway. "The cache broke, so the campaign did not show" must
 * not be a reachable state.
 */

/**
 * `scope` is the (environment, account) this record belongs to. It is opaque
 * here: the route computes it, this module only refuses to look across it.
 */
export type TouchpointContentKey = Readonly<{
  scope: string;
  placementKey: string;
  locale: string;
}>;
export type HeldContentRef = Readonly<{ heldContentId: string; heldContentLocale: string }>;

export interface TouchpointContentCache {
  /** The (id, locale) pair to offer upstream for this placement, if one is fully held. */
  held(key: TouchpointContentKey): HeldContentRef | null;
  /**
   * Rebuild a `contentOmitted` response into a full one, or `null` when the
   * bytes for `held` are not available. `held` is the pair THIS attempt offered
   * upstream; passing it is what binds the answer to the question it answers.
   */
  reassemble(
    key: TouchpointContentKey,
    held: HeldContentRef,
    trimmed: Record<string, unknown>,
  ): Record<string, unknown> | null;
  /** Record the content of a full response for later reassembly. Never throws. */
  remember(key: TouchpointContentKey, response: unknown): void;
  /**
   * The whole decision to answer with while the runtime is unreachable, or
   * `null` when there is nothing this store may put on the screen.
   *
   * Also the moment expired records are reclaimed: a schedule that has closed
   * is deleted here rather than waiting for a network round trip that, by
   * definition, is not coming.
   */
  replayOffline(
    key: TouchpointContentKey,
    reason: TouchpointOfflineReplayReason,
  ): Record<string, unknown> | null;
  /**
   * Act on a 410 the runtime returned for this placement, and report whether
   * the package was destroyed. `body` is the parsed 410 body, or `null` when it
   * could not be read; the rule for which of those reclaim lives in
   * `touchpointWithdrawalReclaims`.
   */
  forgetWithdrawn(key: TouchpointContentKey, body: unknown): boolean;
}

/**
 * Cache-record shape version. A record written by another version is ignored,
 * not migrated — so the OPEND-3436 schedule fields cannot be absent from a
 * record this build is willing to read, and a v1 record simply costs one
 * refetch.
 */
const ASSEMBLY_VERSION = 2;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;
/**
 * One content package is bounded by the same budget the web host enforces.
 *
 * Exported so the proxy that buffers a decision body sizes its own ceiling
 * against this number rather than inventing a second one: a body that cannot
 * fit this budget is not assemblable, whoever is measuring it.
 */
export const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

type CachedResource = Readonly<{ path: string; digest: string }>;
/**
 * When the decision was fetched, and the furthest forward this record has ever
 * been read.
 *
 * `observedAt` is a high-water mark and only ever increases. It is the half of
 * the elapsed measurement that survives a restart: an in-process monotonic
 * reading cannot see a clock that was wound back while the daemon was not
 * running, and that is exactly the window in which an ended activity would
 * otherwise come back.
 */
type CachedClock = Readonly<{ fetchedAt: number; observedAt: number }>;
type AssemblyRecord = Readonly<{
  version: number;
  scope: string;
  placementKey: string;
  contentId: string;
  locale: string;
  manifest: unknown;
  manifestHash: string;
  entryPath: string;
  entryDigest: string;
  runtime: unknown;
  buildIdentity: unknown;
  resources: readonly CachedResource[];
  /** `null` when the decision did not carry a complete, coherent schedule. */
  schedule: TouchpointSchedule | null;
  /** `null` when the decision did not carry a complete activity identity. */
  identity: TouchpointCachedIdentity | null;
  clock: CachedClock;
  /**
   * The decision as the server framed it, with `content` replaced by
   * `contentOmitted: true`.
   *
   * Storing the envelope rather than a curated subset is what keeps an offline
   * replay indistinguishable from the real thing: `requiredCapabilities`,
   * `staticActions`, `snapshotHash` and every other field the browser validates
   * come back exactly as the server sent them, including fields added to the
   * protocol after this code was written.
   */
  envelope: Record<string, unknown>;
}>;

/**
 * Whether a stored record still describes the content an attempt negotiated.
 *
 * The server trimmed its answer against exactly one (content id, locale): the
 * pair the daemon offered when it sent that request. The record on disk is
 * mutable -- a concurrent full response for the same placement replaces it --
 * so a record that has moved on names DIFFERENT bytes. Splicing those into an
 * answer the server framed for the old version puts one campaign's content
 * behind another campaign's decision id, and nothing downstream can see it:
 * the browser verifies only that the content is internally consistent, and
 * each half is. Reassembly is valid against the version it was negotiated for
 * and no other.
 *
 * The locale compared is the one the daemon OFFERED, not the one it asked for.
 * Vela resolves a placement locale through [requested, base language, en-US],
 * so a zh-CN request can legitimately be answered -- and cached -- as en-US,
 * and `held` reports that faithfully. Comparing the requested locale here
 * would strand every placement the server answers through a fallback.
 */
const recordStillHolds = (record: AssemblyRecord, held: HeldContentRef): boolean =>
  record.contentId === held.heldContentId && record.locale === held.heldContentLocale;

const sha256 = (bytes: Buffer): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
/** Digest strings are the only thing that ever names a file here, so a path never escapes the root. */
const blobName = (digest: string): string | null =>
  DIGEST_PATTERN.test(digest) ? digest.slice('sha256:'.length) : null;
const keyName = (key: TouchpointContentKey): string =>
  createHash('sha256').update(`${key.placementKey}\u0000${key.locale}`).digest('hex');
/**
 * The directory that holds one (environment, account)'s whole cache.
 *
 * Isolating at the DIRECTORY level, rather than only inside the record key, is
 * what makes the blob pool per-account too. A shared pool would make one
 * account's reclamation pass have to reason about another account's records to
 * stay correct, and would let a digest collision-free but privacy-relevant
 * artifact outlive the session that fetched it.
 */
const scopeName = (scope: string): string =>
  createHash('sha256').update(scope).digest('hex').slice(0, 32);

export function createTouchpointContentCache(runtimeDataDir: string): TouchpointContentCache {
  // Derived from the daemon's resolved data root (AGENTS.md "Daemon data
  // directory contract"), never from cwd, app name, port or namespace name.
  const root = path.join(runtimeDataDir, 'touchpoint-content-cache');
  /**
   * An anchor for measuring elapsed time inside this process, immune to the
   * wall clock being stepped while the daemon runs.
   *
   * Paired with the persisted `observedAt` mark, this gives the same
   * `max(monotonic, wall)` shape the web host uses: the monotonic term keeps a
   * backwards step from freezing the measurement, the persisted term keeps a
   * restart from forgetting what was already observed. Dropping either one
   * re-opens the cheat it closes.
   */
  const bootWall = Date.now();
  const bootMonotonic = performance.now();
  /** Per-key: the highest time this process adopted, and the monotonic reading it was adopted at. */
  const marks = new Map<string, { wall: number; at: number }>();
  const nowEstimate = (): number =>
    Math.max(Date.now(), Math.round(bootWall + (performance.now() - bootMonotonic)));

  const scopeRoot = (scope: string) => path.join(root, scopeName(scope));
  const blobsDirFor = (scope: string) => path.join(scopeRoot(scope), 'blobs');
  const modulesDirFor = (scope: string) => path.join(scopeRoot(scope), 'modules');
  const assembliesDirFor = (scope: string) => path.join(scopeRoot(scope), 'assemblies');
  const assemblyFile = (key: TouchpointContentKey) =>
    path.join(assembliesDirFor(key.scope), `${keyName(key)}.json`);

  const writeFileAtomically = (file: string, data: string | Buffer): void => {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    const temporary = path.join(dir, `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
    try {
      fs.writeFileSync(temporary, data);
      fs.renameSync(temporary, file);
    } catch (error) {
      try {
        fs.rmSync(temporary, { force: true });
      } catch {
        /* the temp file is already gone or unremovable; neither changes the outcome */
      }
      throw error;
    }
  };

  const parseAssembly = (file: string, expect?: TouchpointContentKey): AssemblyRecord | null => {
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!isRecord(parsed) || parsed.version !== ASSEMBLY_VERSION) return null;
      const record = parsed as unknown as AssemblyRecord;
      if (
        (expect && (record.placementKey !== expect.placementKey || record.scope !== expect.scope)) ||
        typeof record.scope !== 'string' ||
        !record.scope ||
        typeof record.contentId !== 'string' ||
        !record.contentId ||
        typeof record.locale !== 'string' ||
        !record.locale ||
        typeof record.entryPath !== 'string' ||
        !DIGEST_PATTERN.test(record.entryDigest ?? '') ||
        typeof record.manifestHash !== 'string' ||
        // `rebuild` dereferences this with `Object.entries`. A record that is
        // valid JSON of the right version but structurally damaged here would
        // otherwise throw from inside the proxy's upstream error handlers,
        // where nothing catches it — turning a documented cache miss into a
        // dead daemon. Everything this module reads unguarded is validated
        // here, so a damaged record is a miss and never an exception.
        !isRecord(record.envelope) ||
        !isRecord(record.clock) ||
        typeof record.clock.fetchedAt !== 'number' ||
        typeof record.clock.observedAt !== 'number' ||
        !Array.isArray(record.resources) ||
        record.resources.some(
          (resource) =>
            !isRecord(resource) ||
            typeof resource.path !== 'string' ||
            !resource.path ||
            !DIGEST_PATTERN.test(String(resource.digest)),
        )
      )
        return null;
      return record;
    } catch {
      return null;
    }
  };

  const readAssembly = (key: TouchpointContentKey): AssemblyRecord | null =>
    parseAssembly(assemblyFile(key), key);

  /**
   * Writes one content-addressed blob, overwriting whatever is already there.
   *
   * Skipping a file that already exists is the tempting shortcut, because the
   * name IS the digest and a present file "should" therefore already hold
   * exactly these bytes. A file damaged after it was written keeps its name
   * though, and `remember` is the only moment the daemon holds the correct
   * bytes for it: every other round it is answering from a trimmed reply that
   * carries no content at all. Skipping therefore converts one damaged blob
   * into a permanent "offer the held version, fail to rebuild it, refetch in
   * full" cycle that costs more than having no cache at all, and nothing in
   * this module reports it. Rewriting is idempotent, atomic, and only ever
   * reached on a full response — never on the steady-state trimmed one.
   */
  const storeBlob = (dir: string, digest: string, data: Buffer): boolean => {
    const name = blobName(digest);
    if (!name) return false;
    writeFileAtomically(path.join(dir, name), data);
    return true;
  };

  /**
   * Reads one stored blob and re-verifies the FILE against the digest that
   * named it, then encodes it the way the caller needs it.
   *
   * The digest has to be a statement about the bytes on disk, not about a
   * lossy view of them. Hashing a decode of the file while returning the file
   * was both: Node's base64 decoder drops every character outside the
   * alphabet, anywhere in the input and not merely after the padding, so those
   * characters never reached the hash -- yet they were handed back to the
   * caller and forwarded to the browser. `atob` is WHATWG forgiving-base64 and
   * strips ASCII whitespace only, so it throws on them, the placement fails to
   * mount, and no fallback is reached because this function reported success.
   *
   * Blobs are therefore stored as the bytes their digest names and re-encoded
   * on the way out, which makes `sha256(file) === digest` an exact claim about
   * everything this function returns.
   */
  const readVerifiedBlob = (dir: string, digest: string, as: 'base64' | 'utf8'): string | null => {
    const name = blobName(digest);
    if (!name) return null;
    try {
      const stored = fs.readFileSync(path.join(dir, name));
      return sha256(stored) === digest ? stored.toString(as) : null;
    } catch {
      return null;
    }
  };

  /**
   * Every assembly file in a scope except one, so a reclamation pass can ask
   * who ELSE is still referencing a digest before unlinking it.
   */
  const siblingAssemblies = (scope: string, exclude: string): AssemblyRecord[] => {
    const dir = assembliesDirFor(scope);
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return [];
    }
    const records: AssemblyRecord[] = [];
    for (const name of names) {
      const file = path.join(dir, name);
      if (file === exclude || !name.endsWith('.json')) continue;
      const record = parseAssembly(file);
      if (record) records.push(record);
    }
    return records;
  };

  const unlink = (file: string): void => {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* a blob that cannot be removed is wasted disk, never a wrong answer */
    }
  };

  /**
   * Deletes one record and the bytes NOTHING else still needs.
   *
   * The blob pool is shared by digest on purpose: one activity's four
   * placements legitimately point at the same `shared.js`, and so can two
   * different activities that were built from the same component. Reclaiming
   * by digest without asking the surviving records first is therefore a data
   * corruption bug, not a leak: the file disappears while another record still
   * names it, and that record's next `held()` reports a package it cannot
   * rebuild.
   *
   * The survivors are read AFTER the record is unlinked, so a record being
   * written concurrently can only be missed in one direction — a blob it needs
   * may be removed a moment after it was written. That degrades to a refetch
   * (`held` checks existence before offering anything), never to a package
   * assembled out of the wrong bytes.
   */
  const reclaim = (key: TouchpointContentKey, record: AssemblyRecord): void => {
    const file = assemblyFile(key);
    unlink(file);
    const live = new Set<string>();
    for (const sibling of siblingAssemblies(key.scope, file)) {
      live.add(sibling.entryDigest);
      for (const resource of sibling.resources) live.add(resource.digest);
    }
    const blobs = blobsDirFor(key.scope);
    const modules = modulesDirFor(key.scope);
    for (const resource of record.resources) {
      if (live.has(resource.digest)) continue;
      const name = blobName(resource.digest);
      if (name) unlink(path.join(blobs, name));
    }
    if (!live.has(record.entryDigest)) {
      const entry = blobName(record.entryDigest);
      if (entry) unlink(path.join(modules, entry));
    }
  };

  /**
   * The record for a key, after retiring it if its window has closed.
   *
   * Expiry is evaluated on every read rather than on a timer, because the
   * cases that matter — a device asleep past the end of an activity, a daemon
   * that was not running, a client with no network to ask — are exactly the
   * ones where no timer of ours ever fired. `null` therefore means "nothing to
   * show", and by the time it is returned the bytes are already gone.
   */
  const liveRecord = (
    key: TouchpointContentKey,
  ): { record: AssemblyRecord; schedule: TouchpointSchedule; now: number } | null => {
    const record = readAssembly(key);
    if (!record) return null;
    const schedule = record.schedule ? touchpointScheduleOf(record.schedule) : null;
    if (!schedule) return null;
    const file = assemblyFile(key);
    const anchor = marks.get(file);
    // Without a current-process anchor, a startup behind the persisted local
    // clock hides an unknown amount of downtime. Keep the bytes available for
    // online reassembly, but refuse offline authority until remember() records
    // a fresh server decision. Check bootWall, not today's wall time: waiting
    // for the clock to catch up cannot recover the missing elapsed time.
    if (!anchor && bootWall < record.clock.observedAt) return null;
    // The high-water mark alone cannot measure time while the wall clock sits
    // BEHIND it: `max` pins `now` to the mark, `elapsed` stops growing, and an
    // activity keeps its authority for as long as the clock stays wound back.
    // Anchoring the mark to this process's monotonic reading is what makes the
    // wait count. The anchor is per key and per process — a mark adopted for
    // one placement is not evidence about another, and nothing survives a
    // restart except the persisted mark itself.
    const monotonicNow = performance.now();
    const projected = anchor ? anchor.wall + (monotonicNow - anchor.at) : 0;
    const now = Math.max(record.clock.observedAt, projected, nowEstimate());
    marks.set(file, { wall: now, at: monotonicNow });
    if (now > record.clock.observedAt) {
      try {
        writeFileAtomically(
          assemblyFile(key),
          JSON.stringify({ ...record, clock: { ...record.clock, observedAt: now } }),
        );
      } catch {
        /* an un-advanceable mark is a weaker guarantee, never a wrong one */
      }
    }
    const elapsed = Math.max(0, now - record.clock.fetchedAt);
    const effective = Date.parse(schedule.serverTime) + elapsed;
    if (touchpointScheduleHasEnded(schedule, effective)) {
      reclaim(key, record);
      return null;
    }
    return { record, schedule, now: effective };
  };

  return {
    held(key) {
      const record = readAssembly(key);
      if (!record) return null;
      // Offering an (id, locale) the daemon cannot actually rebuild would turn
      // every later refresh into a trimmed response plus a second full request.
      for (const resource of record.resources) {
        const name = blobName(resource.digest);
        if (!name || !fs.existsSync(path.join(blobsDirFor(key.scope), name))) return null;
      }
      const entry = blobName(record.entryDigest);
      if (!entry || !fs.existsSync(path.join(modulesDirFor(key.scope), entry))) return null;
      return { heldContentId: record.contentId, heldContentLocale: record.locale };
    },

    reassemble(key, held, trimmed) {
      const record = readAssembly(key);
      if (!record || !recordStillHolds(record, held)) return null;
      return rebuild(key, record, trimmed);
    },

    replayOffline(key, reason) {
      const live = liveRecord(key);
      if (!live) return null;
      const { record, schedule, now } = live;
      if (!record.identity || !touchpointScheduleAllowsDisplay(schedule, now)) return null;
      const full = rebuild(key, record, record.envelope);
      if (!full) return null;
      const effectiveServerTime = new Date(now).toISOString();
      // The two rewritten timing fields, and only those two. See the contract
      // in `@open-design/contracts/api/touchpointOffline` for why each one is
      // rewritten rather than echoed.
      full.serverTime = effectiveServerTime;
      full.authorizationExpiresAt = schedule.endsAt;
      full[TOUCHPOINT_OFFLINE_REPLAY_FIELD] = {
        reason,
        cachedServerTime: schedule.serverTime,
        effectiveServerTime,
      };
      return full;
    },

    forgetWithdrawn(key, body) {
      const record = readAssembly(key);
      if (!record || !touchpointWithdrawalReclaims(body, record.identity)) return false;
      reclaim(key, record);
      return true;
    },

    remember(key, response) {
      try {
        if (!isRecord(response)) return;
        const content = response.content;
        if (!isRecord(content)) return;
        const {
          id,
          placementKey,
          locale,
          manifest,
          manifestHash,
          entryPath,
          entryDigest,
          entryModule,
          resources,
          runtime,
          buildIdentity,
        } = content;
        if (
          typeof id !== 'string' ||
          !id ||
          placementKey !== key.placementKey ||
          typeof locale !== 'string' ||
          !locale ||
          typeof manifestHash !== 'string' ||
          typeof entryPath !== 'string' ||
          typeof entryDigest !== 'string' ||
          typeof entryModule !== 'string' ||
          !Array.isArray(resources)
        )
          return;
        const entryBytes = Buffer.from(entryModule, 'utf8');
        if (!blobName(entryDigest) || sha256(entryBytes) !== entryDigest) return;
        const stored: CachedResource[] = [];
        const blobsDir = blobsDirFor(key.scope);
        const modulesDir = modulesDirFor(key.scope);
        const pending: Array<{ dir: string; digest: string; data: Buffer }> = [
          { dir: modulesDir, digest: entryDigest, data: entryBytes },
        ];
        let total = entryBytes.byteLength;
        for (const resource of resources) {
          if (!isRecord(resource)) return;
          const { path: resourcePath, digest, bytes } = resource;
          if (
            typeof resourcePath !== 'string' ||
            !resourcePath ||
            typeof digest !== 'string' ||
            typeof bytes !== 'string' ||
            !blobName(digest)
          )
            return;
          const raw = Buffer.from(bytes, 'base64');
          total += raw.byteLength;
          // A digest that does not describe its own bytes means the daemon
          // cannot vouch for this package; store none of it rather than a
          // package the browser's own verifier would reject.
          if (total > MAX_CONTENT_BYTES || sha256(raw) !== digest) return;
          // Store the bytes the digest names, not a text encoding of them.
          pending.push({ dir: blobsDir, digest, data: raw });
          stored.push({ path: resourcePath, digest });
        }
        for (const blob of pending) {
          if (!storeBlob(blob.dir, blob.digest, blob.data)) return;
        }
        // The envelope is the decision minus its content, which is exactly the
        // shape `reassemble` splices content back into — so an offline replay
        // and a trimmed-response rebuild go through one code path.
        const envelope: Record<string, unknown> = {};
        for (const [field, value] of Object.entries(response)) {
          if (field === 'content') envelope.contentOmitted = true;
          else envelope[field] = value;
        }
        const fetchedAt = nowEstimate();
        const record: AssemblyRecord = {
          version: ASSEMBLY_VERSION,
          scope: key.scope,
          placementKey: key.placementKey,
          contentId: id,
          locale,
          manifest,
          manifestHash,
          entryPath,
          entryDigest,
          runtime,
          buildIdentity,
          resources: stored,
          // Both of these REPLACE. Neither is merged with, widened by, or
          // max()'d against whatever was stored before, and that is a decision
          // rather than an omission: this record is a copy of one answer the
          // server gave, and a copy that reserves the right to keep the more
          // generous half of two answers is not a copy of either.
          //
          // The mistake it is worth naming, because it reads as the careful
          // option: `max(cached.endsAt, fresh.endsAt)`, to "avoid shortening
          // display by accident". It converts every early finish an operator
          // orders into a no-op for every client that already cached the long
          // version. Vela's own lease renewal takes `greatest()` and is right
          // to — a grant the SERVER issues must never move backwards under a
          // slow request — but that is the server defending its own monotonic
          // guarantee, not a client deciding which of the server's answers it
          // prefers. Opposite directions, on purpose.
          schedule: touchpointScheduleOf(response),
          identity: touchpointCachedIdentityOf(response),
          clock: { fetchedAt, observedAt: fetchedAt },
          envelope,
        };
        writeFileAtomically(assemblyFile(key), JSON.stringify(record));
        // A fresh server answer establishes its own elapsed-time baseline,
        // including after an uncertain restart or a corrected device clock.
        marks.set(assemblyFile(key), { wall: fetchedAt, at: performance.now() });
      } catch {
        /* A cache that cannot be written changes nothing the caller has to act on. */
      }
    },
  };

  /**
   * Splices this record's content back into a decision envelope.
   *
   * Shared by the trimmed-response path and the offline replay, so the object
   * the browser parses has the same field order — `content` exactly where
   * `contentOmitted` stood — whichever way it was produced.
   */
  function rebuild(
    key: TouchpointContentKey,
    record: AssemblyRecord,
    envelope: Record<string, unknown>,
  ): Record<string, unknown> | null {
    const resources: Array<{ path: string; digest: string; bytes: string }> = [];
    let total = 0;
    for (const resource of record.resources) {
      const bytes = readVerifiedBlob(blobsDirFor(key.scope), resource.digest, 'base64');
      if (bytes === null) return null;
      total += bytes.length;
      if (total > MAX_CONTENT_BYTES * 2) return null;
      resources.push({ path: resource.path, digest: resource.digest, bytes });
    }
    const entryModule = readVerifiedBlob(modulesDirFor(key.scope), record.entryDigest, 'utf8');
    if (entryModule === null) return null;
    const content = {
      id: record.contentId,
      placementKey: record.placementKey,
      locale: record.locale,
      manifest: record.manifest,
      manifestHash: record.manifestHash,
      entryPath: record.entryPath,
      entryDigest: record.entryDigest,
      entryModule,
      resources,
      runtime: record.runtime,
      buildIdentity: record.buildIdentity,
    };
    const full: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(envelope)) {
      if (field === 'contentOmitted') full.content = content;
      else full[field] = value;
    }
    if (!('content' in full)) full.content = content;
    return full;
  }
}

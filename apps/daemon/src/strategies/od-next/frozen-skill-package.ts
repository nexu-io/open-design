import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import {
  lstat,
  mkdir,
  open,
  realpath,
  rm,
  writeFile,
  type FileHandle,
} from 'node:fs/promises';
import path from 'node:path';

import type Database from 'better-sqlite3';

import { parseFrontmatter } from '../../design-systems/frontmatter.js';
import {
  findSkillById,
  resolveSkillId,
  splitDerivedSkillId,
  type SkillInfo,
} from '../../skills.js';

type SqliteDb = Database.Database;

export const OD_NEXT_FROZEN_SKILL_PACKAGE_SCHEMA =
  'open-design.od-next-frozen-skill-package/v1' as const;
const MAX_SKILL_COUNT = 8;
const MAX_SIDE_FILE_COUNT = 32;
const MAX_SKILL_BODY_BYTES = 256 * 1024;
const MAX_SKILL_MANIFEST_BYTES = 256 * 1024;
const MAX_SIDE_FILE_BYTES = 256 * 1024;
const MAX_PACKAGE_BYTES = 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const SIDE_FILE_REFERENCE = /\b(?:assets|references|scripts|examples)\/[A-Za-z0-9._/-]+\b/g;
/**
 * Shape a canonical id must have before it may be adopted from a manifest the
 * caller resolved itself (see `ResolvedFrozenSkillSourceV1`).
 *
 * The Bundle joins selected ids with `,` into one `skill_names` attribute and
 * the parser splits them back on `,`, so an adopted id carrying a comma or
 * whitespace would silently round-trip as two names. Catalogue ids keep their
 * existing looser rule: they were already minted by `listSkills`.
 */
const ADOPTABLE_CANONICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export interface FrozenSkillFileV1 {
  path: string;
  bytesBase64: string;
  byteLength: number;
  digest: string;
}

export interface FrozenSkillSelectionV1 {
  canonicalId: string;
  name: string;
  body: string;
  bodyByteLength: number;
  bodyDigest: string;
  files: FrozenSkillFileV1[];
}

export interface FrozenSkillPackageV1 {
  schema: typeof OD_NEXT_FROZEN_SKILL_PACKAGE_SCHEMA;
  identity: string;
  selections: FrozenSkillSelectionV1[];
}

interface FrozenSkillCaptureIoHooks {
  /** Internal deterministic race hook used only by focused filesystem tests. */
  afterOpen?: (filePath: string) => void | Promise<void>;
}

export class InvalidFrozenSkillPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFrozenSkillPackageError';
  }
}

export function normalizeSelectedSkillIds(input: {
  skillId?: unknown;
  skillIds?: unknown;
}): string[] {
  const raw = [
    ...(typeof input.skillId === 'string' ? [input.skillId] : []),
    ...(Array.isArray(input.skillIds) ? input.skillIds : []),
  ];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') {
      throw new InvalidFrozenSkillPackageError('Selected Skill ids must be strings.');
    }
    const requested = value.trim();
    if (!requested) continue;
    const canonical = resolveSkillId(requested);
    if (typeof canonical !== 'string' || !canonical.trim()) {
      throw new InvalidFrozenSkillPackageError(`Selected Skill ${requested} has no canonical id.`);
    }
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push(canonical);
  }
  if (normalized.length > MAX_SKILL_COUNT) {
    throw new InvalidFrozenSkillPackageError(
      `OD Next accepts at most ${MAX_SKILL_COUNT} explicitly selected Skills.`,
    );
  }
  return normalized;
}

export async function captureFrozenSkillPackage(input: {
  skillId?: unknown;
  skillIds?: unknown;
  catalog: readonly SkillInfo[];
  ioHooks?: FrozenSkillCaptureIoHooks;
}): Promise<FrozenSkillPackageV1> {
  return captureFrozenSkillPackageFromSelections({
    skills: resolveSelectedCatalogSkills(input),
    ioHooks: input.ioHooks,
  });
}

/**
 * Resolve explicitly selected Skill ids against a catalogue listing.
 *
 * Split out from capture so a caller that mixes selection channels can decide
 * what an unavailable Skill means for it. Capture itself has no opinion: it
 * freezes the entries it is handed.
 */
export function resolveSelectedCatalogSkills(input: {
  skillId?: unknown;
  skillIds?: unknown;
  catalog: readonly SkillInfo[];
}): SkillInfo[] {
  const resolved: SkillInfo[] = [];
  for (const canonicalId of normalizeSelectedSkillIds(input)) {
    const skill = findSkillById(input.catalog, canonicalId);
    if (!skill) {
      throw new InvalidFrozenSkillPackageError(`Selected Skill ${canonicalId} is unavailable.`);
    }
    resolved.push(skill);
  }
  return resolved;
}

/**
 * Capture one package from every channel a session selected a Skill through.
 *
 * A task has exactly one frozen package, so the channels have to converge
 * before capture rather than each producing a package of its own: the package
 * identity is a digest over the whole selection list, and two packages would
 * mean two identities for one task. `skills` come from the Skill catalogue
 * (the composer's @-mention popover, `od run --skill`); `sources` are
 * skill-like folders the caller resolved itself (an official example card).
 *
 * Order is authority order, and it survives into `skill_names` and into the
 * body order the model reads: a Skill the user named explicitly precedes
 * material that came along with a card they picked.
 */
export async function captureFrozenSkillPackageFromSelections(input: {
  skills?: readonly SkillInfo[] | undefined;
  sources?: readonly ResolvedFrozenSkillSourceV1[] | undefined;
  ioHooks?: FrozenSkillCaptureIoHooks | undefined;
}): Promise<FrozenSkillPackageV1> {
  const targets: FrozenSkillCaptureTarget[] = [
    ...(input.skills ?? []).map((skill) => ({
      dir: skill.dir,
      label: `Selected Skill ${skill.id}`,
      name: skill.name,
      identity: { kind: 'catalog' as const, canonicalId: skill.id },
    })),
    ...(input.sources ?? []).map((source) => ({
      dir: source.dir,
      label: source.label ?? `Selected Skill source ${path.basename(source.dir)}`,
      name: source.name,
      identity: {
        kind: 'declared' as const,
        ...(source.expectedManifestDigest
          ? { expectedManifestDigest: source.expectedManifestDigest }
          : {}),
      },
    })),
  ];
  if (targets.length > MAX_SKILL_COUNT) {
    throw new InvalidFrozenSkillPackageError(
      `OD Next accepts at most ${MAX_SKILL_COUNT} explicitly selected Skills.`,
    );
  }
  return captureTargets(targets, input.ioHooks);
}

/**
 * A skill-like folder the caller has already resolved, for entry points whose
 * material does not live in a Skill catalogue.
 *
 * The official example cards are the first such entry point. Their folders sit
 * under `plugins/_official/examples/`, deliberately outside the skill-like
 * roots, so the 183 shipped examples never appear in the Skill picker or in
 * any other consumer of that catalogue. Capture therefore takes the resolved
 * folder rather than an id plus a catalogue to look it up in — a new entry
 * point adds a resolver, not a catalogue root.
 *
 * The canonical id is ADOPTED from the folder's own SKILL.md, by exactly the
 * rule `listSkills` uses (`frontmatter.name` falling back to the folder
 * basename, then alias resolution). It is deliberately NOT the caller's
 * catalogue id: those are two namespaces. An example card's plugin id is
 * `example-web-prototype` while its SKILL.md declares `web-prototype`, so
 * forcing the plugin id onto the selection would reject every shipped example.
 * The plugin id belongs on `metadata.exampleBinding.pluginId`; the id the model
 * sees in `skill_names` is the Skill's own name.
 *
 * Adoption does not weaken the freeze. The catalogue entry point cross-checks
 * the declared name because the caller's id came from an earlier, separate
 * listing pass — that check catches a folder swapped between listing and
 * capture. Here the caller hands over the directory itself, and the read is
 * already bracketed by the realpath / `O_NOFOLLOW` / dev-ino fencing below, so
 * the manifest is read inside the fence rather than claimed outside it.
 * `expectedManifestDigest` is the caller's optional stronger check.
 */
export interface ResolvedFrozenSkillSourceV1 {
  /** Absolute path of the directory that holds SKILL.md. */
  dir: string;
  /** Display name recorded on the selection and used as its body heading. */
  name: string;
  /**
   * sha256 (`sha256:<hex>`) of the raw SKILL.md bytes the caller read when it
   * resolved this source. When present, capture refuses a manifest whose bytes
   * no longer reproduce it: the caller's binding pinned a specific example and
   * a changed manifest is a stale binding, not a silent substitution. Omit it
   * only when the caller never recorded one.
   */
  expectedManifestDigest?: string;
  /** Human label used in this source's error messages. */
  label?: string;
}

/**
 * Capture already-resolved skill-like folders into a frozen package.
 *
 * Sibling of `captureFrozenSkillPackage`: same bounds, same digests, same
 * `O_NOFOLLOW` / TOCTOU guarantees, same package identity — only the way a
 * selection is named differs (see `ResolvedFrozenSkillSourceV1`).
 */
export async function captureFrozenSkillPackageFromSources(input: {
  sources: readonly ResolvedFrozenSkillSourceV1[];
  ioHooks?: FrozenSkillCaptureIoHooks;
}): Promise<FrozenSkillPackageV1> {
  return captureFrozenSkillPackageFromSelections({
    sources: input.sources,
    ioHooks: input.ioHooks,
  });
}

async function captureTargets(
  targets: readonly FrozenSkillCaptureTarget[],
  ioHooks?: FrozenSkillCaptureIoHooks,
): Promise<FrozenSkillPackageV1> {
  const selections: FrozenSkillSelectionV1[] = [];
  let packageBytes = 0;
  for (const target of targets) {
    const selection = await captureSelection(target, ioHooks);
    packageBytes += selection.bodyByteLength;
    packageBytes += selection.files.reduce((sum, file) => sum + file.byteLength, 0);
    if (packageBytes > MAX_PACKAGE_BYTES) {
      throw new InvalidFrozenSkillPackageError(
        `Frozen Skill package exceeds ${MAX_PACKAGE_BYTES} bytes.`,
      );
    }
    selections.push(selection);
  }
  return createFrozenSkillPackage(selections);
}

export function createEmptyFrozenSkillPackage(): FrozenSkillPackageV1 {
  return createFrozenSkillPackage([]);
}

function createFrozenSkillPackage(
  selections: FrozenSkillSelectionV1[],
): FrozenSkillPackageV1 {
  const packageWithoutIdentity = {
    schema: OD_NEXT_FROZEN_SKILL_PACKAGE_SCHEMA,
    selections,
  };
  return {
    ...packageWithoutIdentity,
    identity: digestUtf8(canonicalJson(packageIdentityInput(packageWithoutIdentity))),
  };
}

export function migrateFrozenSkillPackageStore(db: SqliteDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS strategy_task_frozen_skill_packages (
      task_execution_id TEXT PRIMARY KEY,
      schema TEXT NOT NULL,
      identity TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      FOREIGN KEY(task_execution_id) REFERENCES strategy_task_executions(task_execution_id)
        ON DELETE CASCADE
    );
  `);
}

export function insertFrozenSkillPackage(
  db: SqliteDb,
  taskExecutionId: string,
  frozen: FrozenSkillPackageV1,
): void {
  const verified = verifyFrozenSkillPackage(frozen);
  db.prepare(`
    INSERT INTO strategy_task_frozen_skill_packages (
      task_execution_id, schema, identity, payload_json
    ) VALUES (?, ?, ?, ?)
  `).run(taskExecutionId, verified.schema, verified.identity, canonicalJson(verified));
}

export function getFrozenSkillPackage(
  db: SqliteDb,
  taskExecutionId: string,
): FrozenSkillPackageV1 {
  const row = db.prepare(`
    SELECT schema, identity, payload_json AS payloadJson
      FROM strategy_task_frozen_skill_packages
     WHERE task_execution_id = ?
  `).get(taskExecutionId) as {
    schema?: unknown;
    identity?: unknown;
    payloadJson?: unknown;
  } | undefined;
  if (!row) {
    throw new InvalidFrozenSkillPackageError(
      'Mapped OD Next task is missing its frozen Skill package.',
    );
  }
  if (
    row.schema !== OD_NEXT_FROZEN_SKILL_PACKAGE_SCHEMA
    || typeof row.identity !== 'string'
    || typeof row.payloadJson !== 'string'
  ) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package row is malformed.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payloadJson);
  } catch {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package JSON is malformed.');
  }
  const verified = verifyFrozenSkillPackage(parsed);
  if (verified.identity !== row.identity || canonicalJson(verified) !== row.payloadJson) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package identity is tampered.');
  }
  return verified;
}

/**
 * The frozen Skill roster for the Bundle's `context/frozen_skill_package` slot:
 * identity, digests and the side-file roster, with no Skill body.
 *
 * Bodies are a separate product (see `resolveFrozenSkillBundleBodies`) because
 * the spec places them in `session_skills/user_selected_skills`, while this
 * audit roster belongs with the other frozen input identities.
 *
 * Returns '' when the user selected no Skill: an empty roster carries only a
 * schema string and a digest of nothing, so the slot is omitted rather than
 * emitted empty — the same no-empty-slot rule the spec mandates for
 * `attachments`. The package identity itself stays verifiable through the
 * persisted strategy task record.
 */
export function renderFrozenSkillRosterContext(frozen: FrozenSkillPackageV1): string {
  const verified = verifyFrozenSkillPackage(frozen);
  if (verified.selections.length === 0) return '';
  return canonicalJson({
    schema: verified.schema,
    identity: verified.identity,
    selectedSkills: verified.selections.map((selection) => ({
      id: selection.canonicalId,
      materializedRoot: frozenSkillMaterializedRoot(verified, selection),
      bodyDigest: selection.bodyDigest,
      bodyBytes: selection.bodyByteLength,
      files: selection.files.map((file) => ({
        path: file.path,
        digest: file.digest,
        bytes: file.byteLength,
      })),
    })),
  });
}

/**
 * The frozen user-selected Skill bodies for the Bundle's
 * `session_skills/user_selected_skills` slot, or null when the user selected
 * none so the optional slot is omitted entirely.
 */
export function resolveFrozenSkillBundleBodies(
  frozen: FrozenSkillPackageV1,
): { skillNames: string[]; body: string } | null {
  const verified = verifyFrozenSkillPackage(frozen);
  if (verified.selections.length === 0) return null;
  return {
    skillNames: verified.selections.map((selection) => selection.canonicalId),
    body: verified.selections.map((selection) => [
      `# ${selection.name}`,
      `Frozen identity: ${selection.canonicalId}@${selection.bodyDigest}`,
      `Frozen side-file root: ${frozenSkillMaterializedRoot(verified, selection)}`,
      selection.body,
    ].join('\n\n')).join('\n\n'),
  };
}

export async function materializeFrozenSkillPackage(input: {
  frozen: FrozenSkillPackageV1;
  cwd: string;
}): Promise<string[]> {
  const frozen = verifyFrozenSkillPackage(input.frozen);
  const aliasRoot = path.join(input.cwd, '.od-skills');
  await assertDestinationRoot(aliasRoot);
  await mkdir(aliasRoot, { recursive: true });
  const materialized: string[] = [];
  for (const selection of frozen.selections) {
    const segment = frozenSkillMaterializedRoot(frozen, selection).slice('.od-skills/'.length);
    const destination = path.join(aliasRoot, segment);
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    await writeFile(path.join(destination, 'SKILL.md'), selection.body, {
      encoding: 'utf8',
      flag: 'wx',
    });
    for (const file of selection.files) {
      const target = path.join(destination, ...file.path.split('/'));
      await mkdir(path.dirname(target), { recursive: true });
      const bytes = Buffer.from(file.bytesBase64, 'base64');
      await writeFile(target, bytes, { flag: 'wx' });
    }
    materialized.push(`.od-skills/${segment}`);
  }
  return materialized;
}

interface FrozenSkillCaptureTarget {
  /** Absolute directory that holds SKILL.md. */
  dir: string;
  /** Human label used in every error message raised for this capture. */
  label: string;
  /** Display name recorded on the selection. */
  name: string;
  /**
   * How this capture establishes the selection's canonical id.
   *
   * `catalog` — the caller looked the Skill up in a catalogue keyed by id, so
   * the manifest must still declare that id; a folder swapped between the
   * listing pass and this read is caught here.
   *
   * `declared` — the caller resolved the folder itself, so there is no earlier
   * claim to cross-check and the id is adopted from the manifest read inside
   * the fence. See `ResolvedFrozenSkillSourceV1`.
   */
  identity:
    | { kind: 'catalog'; canonicalId: string }
    | { kind: 'declared'; expectedManifestDigest?: string };
}

async function captureSelection(
  target: FrozenSkillCaptureTarget,
  ioHooks?: FrozenSkillCaptureIoHooks,
): Promise<FrozenSkillSelectionV1> {
  const rootStat = await lstat(target.dir).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) {
    throw new InvalidFrozenSkillPackageError(`${target.label} root is not a real directory.`);
  }
  let canonicalParent: string;
  let root: string;
  try {
    [canonicalParent, root] = await Promise.all([
      realpath(path.dirname(target.dir)),
      realpath(target.dir),
    ]);
  } catch {
    throw new InvalidFrozenSkillPackageError(`${target.label} root is unavailable.`);
  }
  const rootAfter = await lstat(target.dir).catch(() => null);
  if (
    root !== path.join(canonicalParent, path.basename(target.dir))
    || !rootAfter?.isDirectory()
    || rootAfter.isSymbolicLink()
    || !sameFileSnapshot(rootStat, rootAfter)
  ) {
    throw new InvalidFrozenSkillPackageError(`${target.label} root changed while freezing.`);
  }
  const manifestPath = path.join(root, 'SKILL.md');
  const rawBytes = await readBoundedNoFollow({
    root,
    rootIdentity: rootStat,
    filePath: manifestPath,
    maxBytes: MAX_SKILL_MANIFEST_BYTES,
    label: `${target.label} manifest`,
    ...(ioHooks ? { ioHooks } : {}),
  });
  const parsed = parseFrontmatter(rawBytes.toString('utf8'));
  const declaredName = typeof parsed.data.name === 'string' && parsed.data.name.trim()
    ? parsed.data.name.trim()
    : null;
  const canonicalId = target.identity.kind === 'catalog'
    ? verifiedCatalogCanonicalId(target.identity.canonicalId, declaredName, target.label)
    : adoptedCanonicalId({
        declaredName,
        root,
        rawBytes,
        label: target.label,
        ...(target.identity.expectedManifestDigest
          ? { expectedManifestDigest: target.identity.expectedManifestDigest }
          : {}),
      });
  const body = parsed.body;
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  if (bodyBytes > MAX_SKILL_BODY_BYTES) {
    throw new InvalidFrozenSkillPackageError(`${target.label} body is too large.`);
  }
  // NO CONTENT GUARD HERE, DELIBERATELY.
  //
  // This body is user-chosen material, not a first-party strategy asset. The
  // planning/Build-only guard (`assertOdNextPlanningBuildOnlyV2`) used to run
  // on it and was removed, because measured against real content it protected
  // almost nothing while rejecting most of the corpus it was applied to:
  //
  //  - It is 15 English regexes. The same sentence passes or fails purely on
  //    language: "After the build, run through the checklist and fix any
  //    defects." is rejected; its exact Chinese translation is accepted.
  //  - It false-positives on prose that merely names a banned word. The
  //    shipped `html-ppt` manifest says NOT to repeat a form as a markdown
  //    checklist, and is rejected for saying so. 47 of the 183 shipped example
  //    manifests trip it, including all three default cards.
  //  - It only ever saw SKILL.md. `captureSideFile` never checked side files,
  //    so a `references/checklist.md` — the actual shape of the default cards
  //    — always bypassed it anyway.
  //
  // Nothing downstream depended on it: the serializer asserts only that
  // `userSelectedSkills` names at least one Skill and has a non-empty body.
  // The guard stays where its corpus is controlled and it does work — the
  // first-party recipe assets, via `verifyOdNextRecipeV2`.
  //
  // Instruction conflicts between a user-selected Skill and the strategy are
  // resolved by the priority order stated in the core system prompt
  // (`plugins/_official/scenarios/od-next-strategy/assets/core-system-prompt.md`),
  // not by filtering tokens at assembly time.
  const roster = explicitSideFileRoster(body);
  if (roster.length > MAX_SIDE_FILE_COUNT) {
    throw new InvalidFrozenSkillPackageError(`${target.label} references too many side files.`);
  }
  const files: FrozenSkillFileV1[] = [];
  for (const relativePath of roster) {
    if (await sideFileIsSkippable(root, relativePath)) continue;
    files.push(await captureSideFile(root, rootStat, relativePath, ioHooks));
  }
  return {
    canonicalId,
    name: target.name,
    body,
    bodyByteLength: bodyBytes,
    bodyDigest: digestUtf8(body),
    files,
  };
}

function verifiedCatalogCanonicalId(
  canonicalId: string,
  declaredName: string | null,
  label: string,
): string {
  const declaredId = declaredName ?? canonicalId;
  const manifestOwnerId = splitDerivedSkillId(canonicalId)?.parentId ?? canonicalId;
  if (resolveSkillId(declaredId) !== manifestOwnerId) {
    throw new InvalidFrozenSkillPackageError(`${label} identity changed while freezing.`);
  }
  return canonicalId;
}

function adoptedCanonicalId(input: {
  declaredName: string | null;
  root: string;
  rawBytes: Buffer;
  label: string;
  expectedManifestDigest?: string;
}): string {
  if (
    input.expectedManifestDigest
    && digestBytes(input.rawBytes) !== input.expectedManifestDigest
  ) {
    throw new InvalidFrozenSkillPackageError(
      `${input.label} manifest no longer matches the digest recorded when it was bound.`,
    );
  }
  // Same derivation `listSkills` uses, so a folder outside the skill-like
  // roots gets the id it would have had inside them.
  const adopted = resolveSkillId(input.declaredName ?? path.basename(input.root));
  if (typeof adopted !== 'string' || !ADOPTABLE_CANONICAL_ID.test(adopted)) {
    throw new InvalidFrozenSkillPackageError(
      `${input.label} declares no usable Skill name.`,
    );
  }
  return adopted;
}

/**
 * Should this referenced side file be left out rather than carried?
 *
 * The side-file roster is regex-derived from prose, so a Skill can name a path
 * it does not actually ship: a stale link, an illustrative path, a filename
 * inside a code sample. `example-hyperframes` does exactly that today — its
 * SKILL.md links `references/transitions/catalog.md`, which now ships
 * flattened as `references/transitions.md`.
 *
 * Two conditions mean "not carryable", and neither is a signal about this
 * Skill's safety:
 *
 * - **Absent.** A path that resolves to nothing was never part of the Skill.
 * - **Over budget.** A file past {@link MAX_SIDE_FILE_BYTES} is a bundled
 *   binary the roster happened to name — `example-open-design-landing` links a
 *   multi-hundred-KB `assets/hero.png`. It is too large to carry, which says
 *   nothing about whether the Skill's prose is worth carrying.
 *
 * Either way the file is skipped, because one dead link or one oversized
 * screenshot must not delete the entire Skill from the task. A path that IS
 * there and within budget but is a symlink, sits behind a symlinked directory,
 * or changes while being read is a tamper signal and still fails the whole
 * capture through `captureSideFile` — the size read here is a cheap pre-check,
 * never the authority: `readBoundedNoFollow` re-enforces the same limit on the
 * bytes it actually reads.
 *
 * Anything this probe cannot classify is reported as carryable, so that real
 * bounded no-follow read — not this pre-check — makes the decision.
 */
async function sideFileIsSkippable(root: string, relativePath: string): Promise<boolean> {
  const segments = relativePath.split('/');
  let cursor = root;
  for (const [index, segment] of segments.entries()) {
    cursor = path.join(cursor, segment);
    let stat;
    try {
      stat = await lstat(cursor);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') return true;
      return false;
    }
    // A symlink anywhere on the path is a tamper signal, never an absence.
    if (stat.isSymbolicLink()) return false;
    const isLast = index === segments.length - 1;
    if (isLast ? !stat.isFile() : !stat.isDirectory()) return true;
    if (isLast && stat.size > MAX_SIDE_FILE_BYTES) return true;
  }
  return false;
}

async function captureSideFile(
  root: string,
  rootIdentity: FileIdentity,
  relativePath: string,
  ioHooks?: FrozenSkillCaptureIoHooks,
): Promise<FrozenSkillFileV1> {
  const filePath = path.join(root, ...relativePath.split('/'));
  const bytes = await readBoundedNoFollow({
    root,
    rootIdentity,
    filePath,
    maxBytes: MAX_SIDE_FILE_BYTES,
    label: `Skill side file ${relativePath}`,
    ...(ioHooks ? { ioHooks } : {}),
  });
  return {
    path: relativePath,
    bytesBase64: bytes.toString('base64'),
    byteLength: bytes.byteLength,
    digest: digestBytes(bytes),
  };
}

async function readBoundedNoFollow(input: {
  root: string;
  rootIdentity: FileIdentity;
  filePath: string;
  maxBytes: number;
  label: string;
  ioHooks?: FrozenSkillCaptureIoHooks;
}): Promise<Buffer> {
  await assertRealDirectoryPath(
    input.root,
    input.rootIdentity,
    path.dirname(input.filePath),
    `${input.label} parent`,
  );
  const pathBefore = await lstat(input.filePath).catch(() => null);
  if (!pathBefore?.isFile() || pathBefore.isSymbolicLink()) {
    throw new InvalidFrozenSkillPackageError(`${input.label} is missing, symlinked, or not a file.`);
  }
  let handle: FileHandle;
  try {
    handle = await open(
      input.filePath,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
  } catch {
    throw new InvalidFrozenSkillPackageError(`${input.label} could not be opened without following links.`);
  }
  try {
    const before = await handle.stat();
    if (!before.isFile() || !sameFileIdentity(pathBefore, before)) {
      throw new InvalidFrozenSkillPackageError(`${input.label} changed before it could be frozen.`);
    }
    if (before.size > input.maxBytes) {
      throw new InvalidFrozenSkillPackageError(`${input.label} exceeds its byte limit.`);
    }
    await input.ioHooks?.afterOpen?.(input.filePath);
    const bytes = await readHandleBounded(handle, input.maxBytes, input.label);
    const after = await handle.stat();
    if (!sameFileSnapshot(before, after) || bytes.byteLength !== after.size) {
      throw new InvalidFrozenSkillPackageError(`${input.label} changed while freezing.`);
    }
    await assertRealDirectoryPath(
      input.root,
      input.rootIdentity,
      path.dirname(input.filePath),
      `${input.label} parent`,
    );
    const pathAfter = await lstat(input.filePath).catch(() => null);
    if (
      !pathAfter?.isFile()
      || pathAfter.isSymbolicLink()
      || !sameFileSnapshot(after, pathAfter)
    ) {
      throw new InvalidFrozenSkillPackageError(`${input.label} path changed while freezing.`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function readHandleBounded(
  handle: FileHandle,
  maxBytes: number,
  label: string,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const remainingWithSentinel = maxBytes - total + 1;
    const chunk = Buffer.allocUnsafe(Math.min(READ_CHUNK_BYTES, remainingWithSentinel));
    const { bytesRead } = await handle.read(chunk, 0, chunk.byteLength, total);
    if (bytesRead === 0) break;
    total += bytesRead;
    if (total > maxBytes) {
      throw new InvalidFrozenSkillPackageError(`${label} exceeds its byte limit.`);
    }
    chunks.push(chunk.subarray(0, bytesRead));
  }
  return Buffer.concat(chunks, total);
}

async function assertRealDirectoryPath(
  root: string,
  rootIdentity: FileIdentity,
  directoryPath: string,
  label: string,
): Promise<void> {
  const absoluteRoot = path.resolve(root);
  const absoluteDirectory = path.resolve(directoryPath);
  const relative = path.relative(absoluteRoot, absoluteDirectory);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new InvalidFrozenSkillPackageError(`${label} escapes its Skill root.`);
  }
  let cursor = absoluteRoot;
  const segments = relative.split(path.sep).filter(Boolean);
  const rootStat = await lstat(cursor).catch(() => null);
  if (
    !rootStat?.isDirectory()
    || rootStat.isSymbolicLink()
    || !sameFileIdentity(rootIdentity, rootStat)
  ) {
    throw new InvalidFrozenSkillPackageError(`${label} contains a missing or symlinked root.`);
  }
  for (const segment of segments) {
    cursor = path.join(cursor, segment);
    const stat = await lstat(cursor).catch(() => null);
    if (!stat?.isDirectory() || stat.isSymbolicLink()) {
      throw new InvalidFrozenSkillPackageError(`${label} contains a missing or symlinked directory.`);
    }
  }
}

interface FileIdentity {
  dev: number | bigint;
  ino: number | bigint;
}

function sameFileIdentity(
  left: FileIdentity,
  right: FileIdentity,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameFileSnapshot(
  left: { dev: number | bigint; ino: number | bigint; size: number; mtimeMs: number },
  right: { dev: number | bigint; ino: number | bigint; size: number; mtimeMs: number },
): boolean {
  return sameFileIdentity(left, right)
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function explicitSideFileRoster(body: string): string[] {
  const files = new Set<string>();
  for (const match of body.matchAll(SIDE_FILE_REFERENCE)) {
    const candidate = match[0].replace(/[.,;:)]+$/, '');
    if (!isSafeRelativePath(candidate)) {
      throw new InvalidFrozenSkillPackageError(`Unsafe Skill side-file reference ${candidate}.`);
    }
    files.add(candidate);
  }
  if (/\bexample\.html\b/.test(body)) files.add('example.html');
  return [...files].sort();
}

function verifyFrozenSkillPackage(value: unknown): FrozenSkillPackageV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package must be an object.');
  }
  const input = value as Partial<FrozenSkillPackageV1>;
  if (
    input.schema !== OD_NEXT_FROZEN_SKILL_PACKAGE_SCHEMA
    || typeof input.identity !== 'string'
    || !Array.isArray(input.selections)
  ) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package shape is invalid.');
  }
  if (input.selections.length > MAX_SKILL_COUNT) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package has too many selections.');
  }
  const selections = input.selections.map((selection) => verifySelection(selection));
  const ids = selections.map((selection) => selection.canonicalId);
  if (new Set(ids).size !== ids.length) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package contains duplicate selections.');
  }
  const provisional = {
    schema: input.schema,
    identity: input.identity,
    selections,
  } as FrozenSkillPackageV1;
  const materializedRoots = selections.map((selection) => (
    frozenSkillMaterializedRoot(provisional, selection)
  ));
  if (new Set(materializedRoots).size !== materializedRoots.length) {
    throw new InvalidFrozenSkillPackageError(
      'Frozen Skill package contains colliding materialization roots.',
    );
  }
  const packageBytes = selections.reduce(
    (total, selection) => total
      + selection.bodyByteLength
      + selection.files.reduce((sum, file) => sum + file.byteLength, 0),
    0,
  );
  if (packageBytes > MAX_PACKAGE_BYTES) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package exceeds its byte limit.');
  }
  const expected = digestUtf8(canonicalJson(packageIdentityInput({
    schema: input.schema,
    selections,
  })));
  if (input.identity !== expected) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill package digest mismatch.');
  }
  return { schema: input.schema, identity: input.identity, selections };
}

function verifySelection(value: unknown): FrozenSkillSelectionV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill selection is malformed.');
  }
  const selection = value as Partial<FrozenSkillSelectionV1>;
  if (
    typeof selection.canonicalId !== 'string'
    || typeof selection.name !== 'string'
    || typeof selection.body !== 'string'
    || typeof selection.bodyByteLength !== 'number'
    || typeof selection.bodyDigest !== 'string'
    || !Array.isArray(selection.files)
  ) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill selection shape is invalid.');
  }
  if (
    !selection.canonicalId.trim()
    || resolveSkillId(selection.canonicalId) !== selection.canonicalId
    || !selection.name.trim()
    || /[\r\n]/.test(selection.name)
    || selection.name.length > 256
    || selection.bodyByteLength > MAX_SKILL_BODY_BYTES
    || selection.files.length > MAX_SIDE_FILE_COUNT
  ) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill selection bounds are invalid.');
  }
  if (
    Buffer.byteLength(selection.body, 'utf8') !== selection.bodyByteLength
    || digestUtf8(selection.body) !== selection.bodyDigest
  ) {
    throw new InvalidFrozenSkillPackageError(`Frozen Skill ${selection.canonicalId} body is tampered.`);
  }
  const files = selection.files.map((file) => verifyFile(file));
  const filePaths = files.map((file) => file.path);
  if (new Set(filePaths).size !== filePaths.length) {
    throw new InvalidFrozenSkillPackageError(
      `Frozen Skill ${selection.canonicalId} contains duplicate side files.`,
    );
  }
  return { ...selection, files } as FrozenSkillSelectionV1;
}

function verifyFile(value: unknown): FrozenSkillFileV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill file is malformed.');
  }
  const file = value as Partial<FrozenSkillFileV1>;
  if (
    typeof file.path !== 'string'
    || !isSafeRelativePath(file.path)
    || typeof file.bytesBase64 !== 'string'
    || typeof file.byteLength !== 'number'
    || typeof file.digest !== 'string'
    || file.byteLength > MAX_SIDE_FILE_BYTES
  ) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill file shape is invalid.');
  }
  const bytes = Buffer.from(file.bytesBase64, 'base64');
  if (bytes.toString('base64') !== file.bytesBase64) {
    throw new InvalidFrozenSkillPackageError(`Frozen Skill file ${file.path} is not canonical base64.`);
  }
  if (bytes.byteLength !== file.byteLength || digestBytes(bytes) !== file.digest) {
    throw new InvalidFrozenSkillPackageError(`Frozen Skill file ${file.path} is tampered.`);
  }
  return file as FrozenSkillFileV1;
}

function packageIdentityInput(input: {
  schema: typeof OD_NEXT_FROZEN_SKILL_PACKAGE_SCHEMA;
  selections: FrozenSkillSelectionV1[];
}): unknown {
  return {
    schema: input.schema,
    selections: input.selections.map((selection) => ({
      ...selectionIdentityInput(selection),
    })),
  };
}

function selectionIdentityInput(selection: FrozenSkillSelectionV1): {
  canonicalId: string;
  name: string;
  bodyDigest: string;
  bodyByteLength: number;
  files: Array<{ path: string; digest: string; byteLength: number }>;
} {
  return {
    canonicalId: selection.canonicalId,
    name: selection.name,
    bodyDigest: selection.bodyDigest,
    bodyByteLength: selection.bodyByteLength,
    files: selection.files.map((file) => ({
      path: file.path,
      digest: file.digest,
      byteLength: file.byteLength,
    })),
  };
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return current;
    return Object.fromEntries(Object.entries(current as Record<string, unknown>).sort());
  });
}

function digestUtf8(value: string): string {
  return digestBytes(Buffer.from(value, 'utf8'));
}

function digestBytes(value: Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isSafeRelativePath(value: string): boolean {
  return Boolean(value)
    && !path.posix.isAbsolute(value)
    && !value.includes('\\')
    && !value.includes('\0')
    && value.split('/').every((segment) => Boolean(segment) && segment !== '.' && segment !== '..');
}

function safeSegment(value: string): string {
  const segment = value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return segment || 'skill';
}

function frozenSkillMaterializedRoot(
  _frozen: FrozenSkillPackageV1,
  selection: FrozenSkillSelectionV1,
): string {
  const canonicalIdDigest = digestUtf8(selection.canonicalId).slice(7, 17);
  const selectionDigest = digestUtf8(canonicalJson(selectionIdentityInput(selection))).slice(7, 17);
  return `.od-skills/${safeSegment(selection.canonicalId)}-${canonicalIdDigest}-${selectionDigest}`;
}

async function assertDestinationRoot(aliasRoot: string): Promise<void> {
  const stat = await lstat(aliasRoot).catch(() => null);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) {
    throw new InvalidFrozenSkillPackageError('Frozen Skill materialization root is unsafe.');
  }
}

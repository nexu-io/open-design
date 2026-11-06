/**
 * Dogfood distribution keys.
 *
 * A dogfood upload exists so a `publish=false` build can be handed to a
 * teammate as a direct download link. It is deliberately NOT a release: it must
 * be incapable of changing what an already-installed client sees as an
 * available update.
 *
 * That property is enforced structurally rather than by convention. Every key a
 * dogfood upload writes is minted by `dogfoodObjectKey` and re-validated by
 * `assertDogfoodObjectKey` immediately before the PUT, so the only reachable
 * destinations are `dogfood/<version>/<build>/<file>`. Channel prefixes
 * (`beta/`, `prerelease/`, `preview/`, `stable/`), any `latest` pointer
 * directory, and the electron-updater feed filenames are all unreachable — a
 * caller cannot express them, and a caller that hand-builds a key anyway is
 * rejected before any credential is used.
 */

/** The single root every dogfood object lives under. */
export const DOGFOOD_ROOT_PREFIX = "dogfood";

/**
 * electron-updater feed filenames. Writing one of these is how a build
 * advertises itself as an available update, so a dogfood upload must refuse to
 * write them even inside its own prefix.
 */
const UPDATER_FEED_FILENAMES = new Set([
  "latest-linux-arm64.yml",
  "latest-linux.yml",
  "latest-mac.yml",
  "latest.yml",
]);

/**
 * A `latest` path segment is how every channel names its rolling pointer. Even
 * under `dogfood/` it would read as one, so it is not a usable segment.
 */
const POINTER_SEGMENT = "latest";

/**
 * Segments are restricted to characters that survive a URL untouched. This also
 * rejects the empty string, `.`, and `..`, which is what stops a crafted
 * version or filename from walking out of the dogfood prefix.
 */
const SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type DogfoodLocation = {
  buildId: string;
  version: string;
};

/**
 * Coerce one path component into a safe segment. Build artifacts ship names
 * like `Open Design-release-beta-win-setup.exe`; the space would otherwise be
 * percent-encoded into every link handed to a teammate.
 */
export function sanitizeDogfoodSegment(value: string): string {
  const sanitized = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-._]+/, "");
  if (sanitized.length === 0) {
    throw new Error(`dogfood path segment is empty after sanitizing: ${JSON.stringify(value)}`);
  }
  return sanitized;
}

/**
 * The guard. Throws unless `objectKey` names a location inside the dogfood
 * prefix that cannot act as release or update metadata.
 */
export function assertDogfoodObjectKey(objectKey: string): void {
  const reject = (reason: string): never => {
    throw new Error(`refusing to write outside the ${DOGFOOD_ROOT_PREFIX}/ prefix: ${reason} (key: ${JSON.stringify(objectKey)})`);
  };
  if (objectKey.includes("\\")) reject("keys must use / separators");
  const segments = objectKey.split("/");
  if (segments[0] !== DOGFOOD_ROOT_PREFIX) reject(`first segment must be "${DOGFOOD_ROOT_PREFIX}"`);
  if (segments.length < 4) reject(`expected ${DOGFOOD_ROOT_PREFIX}/<version>/<build>/<file>`);
  for (const segment of segments) {
    if (!SEGMENT_PATTERN.test(segment)) reject(`invalid path segment ${JSON.stringify(segment)}`);
    if (segment.toLowerCase() === POINTER_SEGMENT) reject(`"${POINTER_SEGMENT}" is a channel pointer name`);
  }
  const fileName = segments[segments.length - 1] ?? "";
  if (UPDATER_FEED_FILENAMES.has(fileName.toLowerCase())) reject(`${fileName} is an updater feed file`);
}

/** `dogfood/<version>/<build>` — the only prefix a dogfood upload may write to. */
export function dogfoodPrefix(location: DogfoodLocation): string {
  return [DOGFOOD_ROOT_PREFIX, sanitizeDogfoodSegment(location.version), sanitizeDogfoodSegment(location.buildId)].join("/");
}

/** Mint one validated dogfood object key. Every PUT destination comes from here. */
export function dogfoodObjectKey(location: DogfoodLocation & { fileName: string }): string {
  const objectKey = `${dogfoodPrefix(location)}/${sanitizeDogfoodSegment(location.fileName)}`;
  assertDogfoodObjectKey(objectKey);
  return objectKey;
}

/**
 * Resolve which local files a dogfood upload should consider, in order, without
 * touching the filesystem.
 *
 * `buildJson` is a `tools-pack <platform> build --json` result. Reading the real
 * artifact paths out of it is what keeps this correct as `--to` varies: the
 * build nulls out the keys for targets it did not produce, so a `--to zip` run
 * contributes only its zip and a `--to nsis` run only its installer.
 */
export function collectDogfoodCandidatePaths(options: {
  buildJson?: unknown;
  buildJsonKeys?: readonly string[];
  paths?: readonly string[];
}): string[] {
  const candidates: string[] = [];
  const record = typeof options.buildJson === "object" && options.buildJson != null
    ? (options.buildJson as Record<string, unknown>)
    : null;
  if (record != null) {
    for (const key of options.buildJsonKeys ?? []) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) candidates.push(value.trim());
    }
  }
  for (const path of options.paths ?? []) {
    if (path.trim().length > 0) candidates.push(path.trim());
  }
  return [...new Set(candidates)];
}

/** Split a newline/`;`-separated env list into paths. */
export function parseDogfoodPathList(value: string): string[] {
  return value
    .split(/[\r\n]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

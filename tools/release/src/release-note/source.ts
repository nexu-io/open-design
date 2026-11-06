import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { isReleaseChannel, parseReleaseVersion, type ReleaseChannel } from "@open-design/release";
import { parseDocument } from "yaml";

export const RELEASE_NOTE_MEDIA_TYPE = "text/markdown; charset=utf-8";
export const RELEASE_NOTE_DEFAULT_LOCALE = "en";

const MAX_RELEASE_NOTE_BYTES = 1024 * 1024;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 500;

export type ReleaseNotePlanEntry = {
  description: string;
  locale: string;
  mediaType: typeof RELEASE_NOTE_MEDIA_TYPE;
  name: string;
  sha256: string;
  size: number;
  sourcePath: string;
  title: string;
};

export type ReleaseNotePlan = {
  channel: ReleaseChannel;
  defaultLocale: typeof RELEASE_NOTE_DEFAULT_LOCALE;
  entries: ReleaseNotePlanEntry[];
  kind: "open-design-release-note-plan";
  releaseVersion: string;
  sourceDirectory: string;
  state: "absent" | "ready";
  version: 1;
};

type DiscoverReleaseNotePlanOptions = {
  channel: ReleaseChannel;
  releaseVersion: string;
  sourceRoot: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`release note plan ${field} must be a non-empty string`);
  }
  return value;
}

function requiredInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`release note plan ${field} must be a non-negative integer`);
  }
  return value;
}

function canonicalLocale(fileName: string): string {
  const locale = fileName.slice(0, -".md".length);
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(locale)) {
    throw new Error(`release note filename must be a BCP 47 locale followed by .md; got ${fileName}`);
  }
  let canonical: string;
  try {
    canonical = Intl.getCanonicalLocales(locale)[0] ?? "";
  } catch {
    throw new Error(`release note filename contains an invalid locale: ${fileName}`);
  }
  if (canonical !== locale) {
    throw new Error(`release note locale must use canonical casing: expected ${canonical}.md, got ${fileName}`);
  }
  return locale;
}

function requiredFrontMatterString(
  frontMatter: Record<string, unknown>,
  field: "title" | "description",
  maxLength: number,
  path: string,
): string {
  const value = frontMatter[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`release note ${path} front matter requires a non-empty ${field}`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new Error(`release note ${path} front matter ${field} exceeds ${maxLength} characters`);
  }
  return normalized;
}

function parseMarkdown(path: string, buffer: Buffer): Pick<ReleaseNotePlanEntry, "description" | "title"> {
  if (buffer.byteLength === 0) throw new Error(`release note ${path} is empty`);
  if (buffer.byteLength > MAX_RELEASE_NOTE_BYTES) {
    throw new Error(`release note ${path} exceeds ${MAX_RELEASE_NOTE_BYTES} bytes`);
  }

  const decoder = new TextDecoder("utf-8", { fatal: true });
  let raw: string;
  try {
    raw = decoder.decode(buffer);
  } catch {
    throw new Error(`release note ${path} must be valid UTF-8`);
  }
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const match = /^---[\t ]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[\t ]*(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (match?.[1] == null || match[2] == null) {
    throw new Error(`release note ${path} requires YAML front matter delimited by ---`);
  }

  const document = parseDocument(match[1], { prettyErrors: true, uniqueKeys: true });
  if (document.errors.length > 0) {
    throw new Error(`release note ${path} has invalid YAML front matter: ${document.errors[0]?.message ?? "unknown error"}`);
  }
  const value = document.toJS() as unknown;
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`release note ${path} front matter must be a mapping`);
  }
  if (match[2].trim().length === 0) {
    throw new Error(`release note ${path} requires a non-empty Markdown body`);
  }

  const frontMatter = value as Record<string, unknown>;
  return {
    description: requiredFrontMatterString(frontMatter, "description", MAX_DESCRIPTION_LENGTH, path),
    title: requiredFrontMatterString(frontMatter, "title", MAX_TITLE_LENGTH, path),
  };
}

export function discoverReleaseNotePlan(options: DiscoverReleaseNotePlanOptions): ReleaseNotePlan {
  parseReleaseVersion(options.releaseVersion, options.channel);
  const sourceDirectory = resolve(options.sourceRoot, `v${options.releaseVersion}`);
  if (!existsSync(sourceDirectory)) {
    return {
      channel: options.channel,
      defaultLocale: RELEASE_NOTE_DEFAULT_LOCALE,
      entries: [],
      kind: "open-design-release-note-plan",
      releaseVersion: options.releaseVersion,
      sourceDirectory,
      state: "absent",
      version: 1,
    };
  }
  if (!statSync(sourceDirectory).isDirectory()) {
    throw new Error(`release note source must be a directory: ${sourceDirectory}`);
  }

  const directoryEntries = readdirSync(sourceDirectory, { withFileTypes: true });
  if (directoryEntries.length === 0) {
    throw new Error(`release note directory is present but empty: ${sourceDirectory}`);
  }
  const unsupported = directoryEntries.filter((entry) => !entry.isFile() || !entry.name.endsWith(".md"));
  if (unsupported.length > 0) {
    throw new Error(
      `release note directory only supports flat locale Markdown files; found ${unsupported.map((entry) => entry.name).join(", ")}`,
    );
  }

  const entries = directoryEntries
    .map((entry): ReleaseNotePlanEntry => {
      const locale = canonicalLocale(entry.name);
      const sourcePath = join(sourceDirectory, entry.name);
      const buffer = readFileSync(sourcePath);
      const fields = parseMarkdown(sourcePath, buffer);
      return {
        ...fields,
        locale,
        mediaType: RELEASE_NOTE_MEDIA_TYPE,
        name: entry.name,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        size: buffer.byteLength,
        sourcePath,
      };
    })
    .sort((left, right) => left.locale < right.locale ? -1 : left.locale > right.locale ? 1 : 0);

  return {
    channel: options.channel,
    defaultLocale: RELEASE_NOTE_DEFAULT_LOCALE,
    entries,
    kind: "open-design-release-note-plan",
    releaseVersion: options.releaseVersion,
    sourceDirectory,
    state: entries.length === 0 ? "absent" : "ready",
    version: 1,
  };
}

export function parseReleaseNotePlan(value: unknown): ReleaseNotePlan {
  if (!isRecord(value) || value.kind !== "open-design-release-note-plan" || value.version !== 1) {
    throw new Error("invalid release note plan header");
  }
  if (!isReleaseChannel(value.channel)) throw new Error(`invalid release note plan channel: ${String(value.channel)}`);
  if (value.state !== "absent" && value.state !== "ready") {
    throw new Error(`invalid release note plan state: ${String(value.state)}`);
  }
  if (value.defaultLocale !== RELEASE_NOTE_DEFAULT_LOCALE) {
    throw new Error(`release note plan defaultLocale must be ${RELEASE_NOTE_DEFAULT_LOCALE}`);
  }
  if (!Array.isArray(value.entries)) throw new Error("release note plan entries must be an array");
  const entries = value.entries.map((entry, index): ReleaseNotePlanEntry => {
    if (!isRecord(entry)) throw new Error(`release note plan entries[${index}] must be an object`);
    const sha256 = requiredString(entry.sha256, `entries[${index}].sha256`);
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`release note plan entries[${index}].sha256 is invalid`);
    if (entry.mediaType !== RELEASE_NOTE_MEDIA_TYPE) {
      throw new Error(`release note plan entries[${index}].mediaType is unsupported`);
    }
    const name = requiredString(entry.name, `entries[${index}].name`);
    const locale = requiredString(entry.locale, `entries[${index}].locale`);
    if (canonicalLocale(name) !== locale) {
      throw new Error(`release note plan entries[${index}] locale does not match its filename`);
    }
    return {
      description: requiredString(entry.description, `entries[${index}].description`),
      locale,
      mediaType: RELEASE_NOTE_MEDIA_TYPE,
      name,
      sha256,
      size: requiredInteger(entry.size, `entries[${index}].size`),
      sourcePath: requiredString(entry.sourcePath, `entries[${index}].sourcePath`),
      title: requiredString(entry.title, `entries[${index}].title`),
    };
  });
  if ((value.state === "absent") !== (entries.length === 0)) {
    throw new Error("release note plan state does not match its entries");
  }
  if (new Set(entries.map((entry) => entry.locale)).size !== entries.length) {
    throw new Error("release note plan contains duplicate locales");
  }
  const releaseVersion = requiredString(value.releaseVersion, "releaseVersion");
  parseReleaseVersion(releaseVersion, value.channel);
  return {
    channel: value.channel,
    defaultLocale: RELEASE_NOTE_DEFAULT_LOCALE,
    entries,
    kind: "open-design-release-note-plan",
    releaseVersion,
    sourceDirectory: requiredString(value.sourceDirectory, "sourceDirectory"),
    state: value.state,
    version: 1,
  };
}

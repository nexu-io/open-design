import { isReleaseChannel, parseReleaseVersion } from "@open-design/release";

import {
  RELEASE_NOTE_DEFAULT_LOCALE,
  RELEASE_NOTE_MEDIA_TYPE,
  type ReleaseNotePlan,
} from "./source.ts";

export type ReleaseNotePublicationEntry = {
  locale: string;
  mediaType: string;
  name: string;
  sha256: string;
  size: number;
  url: string;
};

export type ReleaseNotePublication = {
  channel: ReleaseNotePlan["channel"];
  defaultLocale: string;
  entries: ReleaseNotePublicationEntry[];
  kind: "open-design-release-note-publication";
  releaseVersion: string;
  state: "absent" | "planned" | "published";
  version: 1;
};

export type ReleaseNoteMetadata = {
  content: {
    defaultLocale: string;
    locales: Record<string, {
      mediaType: string;
      sha256: string;
      size: number;
      url: string;
    }>;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`release note publication ${field} must be a non-empty string`);
  }
  return value;
}

type CreateReleaseNotePublicationOptions = {
  publicOrigin: string;
  published: boolean;
  versionPrefix: string;
};

function entryUrl(publicOrigin: string, versionPrefix: string, name: string): string {
  const origin = publicOrigin.replace(/\/+$/, "");
  const prefix = versionPrefix.replace(/^\/+|\/+$/g, "");
  return `${origin}/${prefix}/release-notes/${encodeURIComponent(name)}`;
}

export function createReleaseNotePublication(
  plan: ReleaseNotePlan,
  options: CreateReleaseNotePublicationOptions,
): ReleaseNotePublication {
  return {
    channel: plan.channel,
    defaultLocale: plan.defaultLocale,
    entries: plan.entries.map((entry) => ({
      locale: entry.locale,
      mediaType: entry.mediaType,
      name: entry.name,
      sha256: entry.sha256,
      size: entry.size,
      url: entryUrl(options.publicOrigin, options.versionPrefix, entry.name),
    })),
    kind: "open-design-release-note-publication",
    releaseVersion: plan.releaseVersion,
    state: plan.state === "absent" ? "absent" : options.published ? "published" : "planned",
    version: 1,
  };
}

export function verifyReleaseNotePublication(
  plan: ReleaseNotePlan,
  publication: ReleaseNotePublication,
  options: { publicOrigin?: string; requirePublished: boolean; versionPrefix?: string },
): void {
  if (publication.channel !== plan.channel || publication.releaseVersion !== plan.releaseVersion) {
    throw new Error("release note publication identity does not match its plan");
  }
  const expectedState = plan.state === "absent" ? "absent" : options.requirePublished ? "published" : "planned";
  if (publication.state !== expectedState) {
    throw new Error(`release note publication must be ${expectedState}; got ${publication.state}`);
  }
  if (plan.state === "ready" && publication.state === "absent") {
    throw new Error("release note publication cannot be absent when source notes are ready");
  }
  if (publication.entries.length !== plan.entries.length) {
    throw new Error("release note publication entry count does not match its plan");
  }
  for (const [index, source] of plan.entries.entries()) {
    const published = publication.entries[index];
    if (
      published == null
      || published.locale !== source.locale
      || published.name !== source.name
      || published.mediaType !== source.mediaType
      || published.sha256 !== source.sha256
      || published.size !== source.size
      || published.url.length === 0
    ) {
      throw new Error(`release note publication entry does not match plan: ${source.locale}`);
    }
    if (options.publicOrigin != null && options.versionPrefix != null) {
      const expectedUrl = entryUrl(options.publicOrigin, options.versionPrefix, source.name);
      if (published.url !== expectedUrl) {
        throw new Error(`release note publication URL does not match plan: ${source.locale}`);
      }
    }
  }
}

export function releaseNoteMetadataFromPublication(
  publication: ReleaseNotePublication,
): ReleaseNoteMetadata | null {
  if (publication.state === "absent") return null;
  const locales: ReleaseNoteMetadata["content"]["locales"] = {};
  for (const entry of publication.entries) {
    locales[entry.locale] = {
      mediaType: entry.mediaType,
      sha256: entry.sha256,
      size: entry.size,
      url: entry.url,
    };
  }
  return {
    content: {
      defaultLocale: publication.defaultLocale,
      locales,
    },
  };
}

export function parseReleaseNotePublication(value: unknown): ReleaseNotePublication {
  if (!isRecord(value) || value.kind !== "open-design-release-note-publication" || value.version !== 1) {
    throw new Error("invalid release note publication header");
  }
  if (value.state !== "absent" && value.state !== "planned" && value.state !== "published") {
    throw new Error(`invalid release note publication state: ${String(value.state)}`);
  }
  if (!Array.isArray(value.entries)) throw new Error("release note publication entries must be an array");
  const entries = value.entries.map((entry, index): ReleaseNotePublicationEntry => {
    if (!isRecord(entry)) throw new Error(`release note publication entries[${index}] must be an object`);
    if (typeof entry.size !== "number" || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      throw new Error(`release note publication entries[${index}].size must be a non-negative integer`);
    }
    const sha256 = requiredString(entry.sha256, `entries[${index}].sha256`);
    if (!/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error(`release note publication entries[${index}].sha256 is invalid`);
    }
    const locale = requiredString(entry.locale, `entries[${index}].locale`);
    const name = requiredString(entry.name, `entries[${index}].name`);
    if (name !== `${locale}.md`) {
      throw new Error(`release note publication entries[${index}] locale does not match its filename`);
    }
    if (entry.mediaType !== RELEASE_NOTE_MEDIA_TYPE) {
      throw new Error(`release note publication entries[${index}].mediaType is unsupported`);
    }
    return {
      locale,
      mediaType: RELEASE_NOTE_MEDIA_TYPE,
      name,
      sha256,
      size: entry.size,
      url: requiredString(entry.url, `entries[${index}].url`),
    };
  });
  if ((value.state === "absent") !== (entries.length === 0)) {
    throw new Error("release note publication state does not match its entries");
  }
  if (new Set(entries.map((entry) => entry.locale)).size !== entries.length) {
    throw new Error("release note publication contains duplicate locales");
  }
  if (!isReleaseChannel(value.channel)) {
    throw new Error(`invalid release note publication channel: ${String(value.channel)}`);
  }
  if (value.defaultLocale !== RELEASE_NOTE_DEFAULT_LOCALE) {
    throw new Error(`release note publication defaultLocale must be ${RELEASE_NOTE_DEFAULT_LOCALE}`);
  }
  if (entries.length > 0 && !entries.some((entry) => entry.locale === RELEASE_NOTE_DEFAULT_LOCALE)) {
    throw new Error(`release note publication requires the default locale: ${RELEASE_NOTE_DEFAULT_LOCALE}`);
  }
  const releaseVersion = requiredString(value.releaseVersion, "releaseVersion");
  parseReleaseVersion(releaseVersion, value.channel);
  return {
    channel: value.channel,
    defaultLocale: RELEASE_NOTE_DEFAULT_LOCALE,
    entries,
    kind: "open-design-release-note-publication",
    releaseVersion,
    state: value.state,
    version: 1,
  };
}

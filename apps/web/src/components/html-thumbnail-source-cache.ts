type HtmlThumbnailSourceIdentity = Readonly<{
  authorizationScopeKey: string;
  projectId: string;
  fileName: string;
  refreshKey: string;
}>;

type StoredHtmlThumbnailSource = Readonly<{
  source: string;
  utf16Bytes: number;
}>;

const MAX_ENTRIES = 16;
const MAX_UTF16_BYTES = 16 * 1024 * 1024;

const sources = new Map<string, StoredHtmlThumbnailSource>();
const inFlight = new Map<string, Promise<string | null>>();
let totalUtf16Bytes = 0;
let resetGeneration = 0;

function cacheKey(identity: HtmlThumbnailSourceIdentity): string {
  return [
    identity.authorizationScopeKey,
    identity.projectId,
    identity.fileName,
    identity.refreshKey,
  ].join('\0');
}

function store(key: string, source: string): void {
  const utf16Bytes = source.length * 2;
  if (utf16Bytes > MAX_UTF16_BYTES) return;
  const previous = sources.get(key);
  if (previous) totalUtf16Bytes -= previous.utf16Bytes;
  sources.delete(key);
  sources.set(key, { source, utf16Bytes });
  totalUtf16Bytes += utf16Bytes;
  while (
    sources.size > MAX_ENTRIES
    || totalUtf16Bytes > MAX_UTF16_BYTES
  ) {
    const oldest = sources.keys().next().value;
    if (oldest === undefined) break;
    const entry = sources.get(oldest);
    sources.delete(oldest);
    if (entry) totalUtf16Bytes -= entry.utf16Bytes;
  }
}

export function getHtmlThumbnailSource(
  identity: HtmlThumbnailSourceIdentity,
): string | null {
  const key = cacheKey(identity);
  const entry = sources.get(key);
  if (!entry) return null;
  sources.delete(key);
  sources.set(key, entry);
  return entry.source;
}

export function loadHtmlThumbnailSource(
  identity: HtmlThumbnailSourceIdentity,
  load: () => Promise<string | null>,
): Promise<string | null> {
  const cached = getHtmlThumbnailSource(identity);
  if (cached !== null) return Promise.resolve(cached);
  const key = cacheKey(identity);
  const pending = inFlight.get(key);
  if (pending) return pending;
  const generation = resetGeneration;
  const request = load()
    .then((source) => {
      if (source !== null && generation === resetGeneration) {
        store(key, source);
      }
      return source;
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    });
  inFlight.set(key, request);
  return request;
}

export function resetHtmlThumbnailSourceCache(): void {
  resetGeneration += 1;
  sources.clear();
  inFlight.clear();
  totalUtf16Bytes = 0;
}

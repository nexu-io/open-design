import type { SenseAudioCatalogue, SenseAudioPersonaEntry } from '@open-design/contracts';

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function readVariants(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [voiceId, label] of Object.entries(value)) {
    if (!voiceId) continue;
    out[voiceId] = readString(label) || '通用';
  }
  return out;
}

async function readLookupErrorDetail(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('json')) {
    try {
      const payload = await response.clone().json() as unknown;
      if (isRecord(payload)) {
        const message = readString(payload.error)
          || readString(payload.message)
          || readString(payload.detail);
        if (message) return message;
      }
    } catch {
      // Fall through to the raw body text below.
    }
  }
  try {
    return readString(await response.text());
  } catch {
    return '';
  }
}

function formatLookupError(response: Response, detail: string): string {
  const statusText = readString(response.statusText);
  const statusLabel = statusText ? `${response.status} ${statusText}` : String(response.status);
  return detail
    ? `SenseAudio voice list could not be loaded (${statusLabel}): ${detail}`
    : `SenseAudio voice list could not be loaded (${statusLabel})`;
}

function normalizeEntry(value: unknown): SenseAudioPersonaEntry | null {
  if (!isRecord(value)) return null;
  const name = readString(value.name);
  const variants = readVariants(value.variants);
  if (!name || Object.keys(variants).length === 0) return null;
  return {
    name,
    description: readString(value.description),
    variants,
  };
}

export async function fetchSenseAudioCatalogue(
  signal?: AbortSignal,
): Promise<SenseAudioCatalogue> {
  const response = await fetch('/api/media/providers/senseaudio/voices', { signal });
  if (!response.ok) {
    const detail = await readLookupErrorDetail(response);
    throw new Error(formatLookupError(response, detail));
  }
  const payload = await response.json() as unknown;
  const rawCatalogue = isRecord(payload) && isRecord(payload.catalogue)
    ? payload.catalogue
    : {};
  const out: SenseAudioCatalogue = {};
  for (const [key, entry] of Object.entries(rawCatalogue)) {
    const normalized = normalizeEntry(entry);
    if (normalized) out[key] = normalized;
  }
  return out;
}

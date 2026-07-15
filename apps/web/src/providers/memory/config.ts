// Transport adapter for the memory-config resource (`PATCH /api/memory/config`).
//
// This is the single transport home for the config route. The daemon PATCH
// parser merges any subset of { enabled, chatExtractionEnabled, profileEnabled,
// rewriteEnabled, verifyEnabled, extraction }, so a caller may flip one flag
// without re-sending the others. Callers never talk to `fetch` directly; the
// `features/memory` slice reaches this only through its port binding.
import type {
  UpdateMemoryConfigRequest,
  MemoryExtractionConfig,
  MemoryExtractionMaskedConfig,
} from '@open-design/contracts';

import { requiredField } from './response-fields';

/**
 * PATCH a subset of the memory config. Resolves `true` when the daemon accepts
 * the merge, `false` otherwise (the slice uses that to roll an optimistic
 * toggle back). Never throws for a non-ok response.
 */
export async function patchMemoryConfig(
  patch: UpdateMemoryConfigRequest,
): Promise<boolean> {
  const resp = await fetch('/api/memory/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return resp.ok;
}

/**
 * PATCH the extraction sub-config and return the daemon's masked echo (API keys
 * redacted). `undefined` signals the request failed — the caller keeps its
 * prior state; `null` means the daemon cleared the extraction config.
 */
export async function patchMemoryExtractionConfig(
  extraction: MemoryExtractionConfig | null,
): Promise<MemoryExtractionMaskedConfig | null | undefined> {
  const resp = await fetch('/api/memory/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extraction }),
  });
  if (!resp.ok) return undefined;
  const json = (await resp.json()) as {
    enabled: boolean;
    extraction?: MemoryExtractionMaskedConfig | null;
  };
  return requiredField(json, 'extraction', 'Memory config PATCH') ?? null;
}

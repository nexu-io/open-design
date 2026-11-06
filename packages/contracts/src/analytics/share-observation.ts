/** Optional source facts for passive share analytics. No business validation or I/O. */
export function publishReceiptObservation(value: unknown): { share_version?: number; published_at?: number } {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const receipt = value as Record<string, unknown>;
    const version = receipt.version;
    const publishedAt = receipt.publishedAt;
    return {
      ...(typeof version === 'number' && Number.isSafeInteger(version) && version > 0
        ? { share_version: version } : {}),
      ...(typeof publishedAt === 'number' && Number.isSafeInteger(publishedAt) && publishedAt >= 0
        ? { published_at: publishedAt } : {}),
    };
  } catch {
    return {};
  }
}

/** Saved IDs only: temporary board notes and unclassified legacy attachments are not original comments. */
export function savedCommentIds(value: unknown): string[] | undefined {
  try {
    if (!Array.isArray(value)) return undefined;
    const ids = new Set<string>();
    for (const item of value) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const attachment = item as Record<string, unknown>;
      if (attachment.source === 'saved-comment' && typeof attachment.id === 'string'
        && /^[a-zA-Z0-9_-]{1,128}$/.test(attachment.id)) ids.add(attachment.id);
    }
    return [...ids];
  } catch {
    return undefined;
  }
}

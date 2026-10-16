import { commentUuidFromElementId, commentIdentitySelector } from '@open-design/contracts';
import type { PreviewCommentSnapshot } from './anchor';

/** Reject ambiguous new identities BEFORE indexing. Legacy tool IDs keep their behavior. */
export function indexCommentTargets(targets: PreviewCommentSnapshot[]): Map<string, PreviewCommentSnapshot> {
  const counts = new Map<string, number>();
  for (const target of targets) counts.set(target.elementId, (counts.get(target.elementId) ?? 0) + 1);
  const result = new Map<string, PreviewCommentSnapshot>();
  for (const target of targets) {
    if (target.elementId.startsWith('cmt:')) {
      const uuid = commentUuidFromElementId(target.elementId);
      if (!uuid || counts.get(target.elementId) !== 1 || target.selector !== commentIdentitySelector(uuid)) continue;
    }
    result.set(target.elementId, target);
  }
  return result;
}

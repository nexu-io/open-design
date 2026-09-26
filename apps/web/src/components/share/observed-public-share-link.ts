// A volatile capability witnessed through an authorized active-share GET.
// Never persist it: account/project/file changes must invalidate this copy-only fallback.
export interface ObservedPublicShareLink {
  status: 'active';
  projectId: string;
  filePath: string;
  slug: string;
  url: string;
  workspaceId: string;
  workspaceMemberId: string;
  authorizationScopeKey: string;
  freshness: 'current' | 'outdated' | 'unknown';
}

/** Explicit click on sign-in-to-update; expires and never survives App unmount. */
export interface ObservedShareUpdateRequest {
  nonce: number;
  accountId: string;
  expiresAt: number;
  link: ObservedPublicShareLink;
}

/**
 * Whether a file view's active file identity (`${projectId}:${fileName}`)
 * moved from one file to a DIFFERENT file within the same view instance —
 * the only transition that invalidates an App-held observed public link.
 *
 * Invariant: mounting (or remounting) a file view is not a file switch. The
 * first identity an instance sees has no predecessor, so it proves nothing
 * about the witness. Sign-out re-keys ProjectView on the same file while the
 * account is still authenticated; treating that remount as a switch dropped
 * the witness, so the signed-out share fallback (Owner-S13) lost its link and
 * the fail-closed tab scope reset re-homed to Home. Route and account changes
 * are invalidated by App itself, and every consumer also requires the route
 * to name the witnessed file.
 */
export function isObservedShareFileSwitch(previous: string | null, next: string | null): boolean {
  return previous !== null && next !== null && previous !== next;
}

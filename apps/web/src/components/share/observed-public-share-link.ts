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

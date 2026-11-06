import type { WorkspaceContextState } from './useWorkspaceContext';

/**
 * Whether the workspace identity read has SETTLED with no signed-in identity
 * at all — the only reading in which a null context may be treated as "no
 * share surface in scope" by destructive flows (the delete confirmations).
 *
 * A null context alone proves nothing: `loading` holds no answer yet, and
 * `unavailable` / `reauth-required` mean the identity exists or is unknown —
 * treating those as anonymity is the same bug shape
 * `workspaceIdentityCanBillAmr` guards against. `unsupported` is an old
 * daemon with no workspace endpoint, where pre-workspace headerless behavior
 * is legal and no share surface can exist.
 *
 * Lives beside (not inside) `useWorkspaceContext` like
 * `entry-rail-account-state.ts`: a pure discriminator over the read state,
 * importable without the hook module's client machinery.
 */
export function workspaceIdentitySettledSignedOut(
  state: Pick<WorkspaceContextState, 'context' | 'loading' | 'failure'>,
): boolean {
  if (state.context !== null) return false;
  if (state.loading) return false;
  if (state.failure === 'unavailable' || state.failure === 'reauth-required') return false;
  return true;
}

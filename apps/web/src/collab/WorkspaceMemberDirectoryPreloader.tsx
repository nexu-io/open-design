import { useTeamMembers } from './useTeamMembers';

/**
 * Keeps the exact active Workspace's member directory warm for the lifetime of
 * the app session, before route-owned project and presence consumers mount.
 *
 * `useTeamMembers` owns identity-scoped headers, switch masking, single-flight,
 * SSE invalidation and polling. This root preloader only contributes one stable
 * consumer so route changes do not turn every project open into a cold roster
 * read.
 */
export function WorkspaceMemberDirectoryPreloader() {
  useTeamMembers();
  return null;
}

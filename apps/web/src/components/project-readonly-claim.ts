/**
 * The copy a surface uses to EXPLAIN why a project is read-only.
 *
 * `undefined` means "read-only for a reason we cannot name yet". Surfaces must
 * still DISABLE in that window — callers keep deriving that from the
 * fail-closed flag — but they must not assert WHY, because the same flag is
 * true while ownership is merely unknown. Copy derived from it tells a
 * personal project's owner that their own project is someone else's share.
 *
 * Measured entering an owned personal project (OPEND-2283): the claim showed
 * for ~4.1s. Gating the file-workspace banner alone cut it to ~1.0s but did
 * not remove it, because the chat composer placeholder and the project title
 * tooltip each re-derived the claim from the flag. One named value for all
 * three is the point: a surface that wants the reason has to ask for the
 * reason, and there is exactly one answer.
 */
export function projectReadOnlyClaim(input: {
  /** Positive evidence of a different owner — never mere `!isOwner`. */
  isSharedNonOwner: boolean;
  ownerDisplayName?: string | null;
  t: (key: any, vars?: Record<string, string>) => string;
}): string | undefined {
  if (!input.isSharedNonOwner) return undefined;
  return input.ownerDisplayName
    ? input.t('workspace.readonlyNoticeBy', { owner: input.ownerDisplayName })
    : input.t('workspace.readonlyNotice');
}

// Which identity a chat card speaks for, by artifact kind.
//
// PRODUCT RULING (not re-litigated here):
//
//   image / sketch
//          -> the card shows THAT TURN's exact bytes. A later `hero.png`
//             cannot rewrite an older message's card.
//   html / prototype / slide / document
//          -> the card shows a FROZEN static cover of that turn.
//   video / audio
//          -> nothing is frozen at all (user ruling 2026-09-02, see below).
//             The card shows the LIVE workspace file, which is what a card
//             with no cover has always shown.
//
// CLICKING IS NOT A DECISION THIS FILE MAKES. Every card, of every kind, opens
// the workspace's latest file (user ruling 2026-09-02: "html 和图片都是,产物缩略
// 是快照,但跳过去产物永远指向最新的"). Cover and click therefore disagree, on
// purpose, for both kinds: the card is evidence of what the turn produced, the
// click is a door into the live workspace. There is no per-kind open policy to
// return — the ref's `workspaceArtifactId` already names the one target.

import type { ChatArtifactDisplayPolicy } from './types.js';

export interface ChatArtifactPolicy {
  displayPolicy: ChatArtifactDisplayPolicy;
  /** Whether the original bytes are copied into the immutable blob store. */
  capturesContent: boolean;
  /** Whether the card wants a separately rendered static cover image. */
  wantsStaticCover: boolean;
}

/**
 * Kinds whose ORIGINAL bytes are the message evidence. These are the ones the
 * overwrite bug actually destroys today, so they are the ones that get frozen.
 *
 * `sketch` covers `.svg` and `sketch-*.png` (see `projects.ts#kindFor`), which
 * is the same order of magnitude as an image.
 *
 * VIDEO / AUDIO ARE DELIBERATELY OUT. User ruling 2026-09-02: 「视频音频先不存
 * 快照了」. This is a capacity ruling, not a capability one — the store holds a
 * video perfectly well. One blob is capped at 64 MiB and one project at 2 GiB
 * (`quota.ts`), so a few video iterations exhaust a project's budget, and an
 * exhausted budget fails the WHOLE batch with `quota_exceeded`. Keeping video
 * in would have let a kind nobody ruled on evict the image semantics that were
 * ruled on. Their cards fall back to the live workspace file, which for audio
 * is the only thing the UI ever read anyway.
 *
 * The comment this replaces claimed removing a kind here "needs no other
 * change". That was wrong: `routes/media.ts` freezes provider bytes through
 * `capture.ts` WITHOUT consulting this file, so the exclusion has to be
 * enforced at the capture chokepoint. See
 * {@link chatArtifactKindStoresOriginalBytes}.
 */
const IMMUTABLE_ORIGINAL_KINDS: ReadonlySet<string> = new Set(['image', 'sketch']);

export function chatArtifactPolicyForKind(kind: string): ChatArtifactPolicy {
  if (IMMUTABLE_ORIGINAL_KINDS.has(kind)) {
    return {
      displayPolicy: 'immutable_snapshot',
      capturesContent: true,
      wantsStaticCover: false,
    };
  }
  return {
    displayPolicy: 'latest_with_static_preview',
    capturesContent: false,
    wantsStaticCover: true,
  };
}

/**
 * Whether this kind's ORIGINAL bytes may be copied into the immutable blob
 * store.
 *
 * This is the ENFORCEMENT question, and it is asked at the capture chokepoint
 * rather than trusted to each call site. `routes/media.ts` hands the provider's
 * exact bytes straight to `captureChatArtifactSnapshotFromBytes` without
 * consulting a policy at all, so a rule that only lived at the run-terminal
 * call site would have kept storing every generated video while the cards said
 * otherwise. A capture that violates this is skipped, not failed: nothing was
 * attempted and nothing is missing.
 */
export function chatArtifactKindStoresOriginalBytes(kind: string): boolean {
  return chatArtifactPolicyForKind(kind).capturesContent;
}

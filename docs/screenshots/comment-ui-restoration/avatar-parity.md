# Comment avatar parity verification

Verified 2026-10-16 against OpenDesign UI PR #8807 and the running production AMR build artifacts. No production mutation, user-data access, or secret-value inspection was performed.

## Deployed evidence

| Surface | Running revision | Artifact SHA-256 |
| --- | --- | --- |
| AMR Web | `83b616f67655ebd12d552c0ff0bbabeaeba821ef` | `cloud-root-B21Emo2w.js`: `c098aec9e890a19d7c68010f571c3376d2f1993e1c8e1eb8a7d476d0738d21d9` |
| AMR API | `35df482fb50db94da0131621f54cfec78c386c11` | `dist/collab/public-share-comments.js`: `9c59db0c4e3bbd3e1e69039fddb12805bbe5ebd5317511829a0a13d92cecfc1b` |

Read-only inspection of the production deployments identified the image revisions. Both running Web replicas contained the same bundle hash; both API replicas present at the final inspection contained the same API file hash. One earlier API replica disappeared during the investigation; the remaining replicas retained the same revision and file hash.

The actual CDN asset at `https://open-design.ai/cloud/assets/cloud-root-B21Emo2w.js` was downloaded independently and had the **same SHA-256** as the deployed Web replicas. An actual browser fetch also returned HTTP 200 and the same hash (897,242 bytes). The CDN `CommentPresentation-EJ5wDnMs.js` imports that bundle's exported color function (`c as v`) and calls it with its `seed` prop; its deployed/CDN SHA-256 also matches: `e7d8dc146b54d0580cdfbbd6dd7f419bdf2bff5664d88fd2f6cfcc3636c0f6ab`.

## Palette, hash and key

- All **30 background/foreground pairs and their order** match the current desktop `COMMENT_AUTHOR_AVATAR_COLORS`.
- The deployed color function is `ob(e)`: iterate UTF-16 `charCodeAt`, update `(hash * 31 + codeUnit) >>> 0`, select `palette[hash % palette.length]`, fallback entry zero. This is identical to desktop `commentAuthorAvatarColor`.
- Deployed share route: `presentation` passes `comment.author.authorKey` as `seed`; the preview pin selects its palette index with `ob(author.authorKey)`.
- Desktop member and public author components both pass `comment.authorKey`, not display name, account ID or member ID. The daemon preserves the API's author key rather than calculating a replacement.
- The deployed API generates lowercase hex HMAC-SHA256 over `share-comment-author\0` plus the account ID. Public and team/member projections call the same `authorKeyForCommentAuthor` helper. Historical member-only fallback retains its separate `member\0` namespace.
- The deployed API entry/app wiring supplies the same `CREDENTIAL_DIGEST_SECRET` configuration input to public comments, member comments and share-auth viewer keys. No secret values were read or stored.

An executable audit extracted the declarations from the **downloaded deployed JavaScript**, not just a local Git checkout. Its color outputs matched the desktop for **10,006 inputs**, including Unicode and 10,000 synthetic API-generated keys. The deployed API key functions matched the local server and public/member paths for **10,000 synthetic identities**, including member-only fallback checks. No real account IDs or production key values were used.

**Result: no palette, hash or key-selection mismatch found; no algorithm fix required.**

## Colored screenshots

The accompanying screenshots come from the current local product with controlled GET comment snapshots, clearly marked as **synthetic local acceptance data**, not production users or end-to-end delivery evidence. No DOM or avatar-style injection is used.

The browser test `e2e/ui/comment-avatar-colors.test.ts` asserts actual computed foreground/background colors for blue, orange, purple and green author avatars, their displayed initials, and the same orange color for public/team comments carrying the same author key. It also checks each saved canvas pin against its author's initials and colors, checks hover preserves that color, and verifies the selected saved pin keeps the same initial and color. Permanent comment numbers remain in the sidebar and marker metadata, not the pin's visible glyph. Five distinct real document targets keep the canvas pins separately visible. A full-workspace screenshot shows the entry point and colored canvas pins; a panel close-up makes the avatars legible; a selected-pin screenshot covers the active state.

### Canvas rendering follow-up

The earlier screenshots correctly exercised sidebar avatar colors but missed the canvas pins, which still used the neutral CSS fallback. This was a missing presentation binding, not a palette/hash/key mismatch. `CommentPreviewOverlays` now reuses the same existing `commentAuthorAvatarColor(comment.authorKey ?? '')` helper for saved and active saved pin style props. No identity-ID fallback is restored. Event handlers, numbering, position, anchor behavior, API and server logic remain unchanged. An unsaved provisional pin has no saved author key and retains its existing neutral colors.

### Pin initials correction

Canvas pins now render the same author initial as the sidebar avatar, not the comment sequence number. Saved and active pins reuse `CommentAuthorIdentity` in initial-only mode, including its existing trusted snapshot/member-directory/current-user resolution and grapheme handling (Chinese, Latin, joined emoji and combining marks). Missing names use the same `?` fallback. A new draft uses the current user's initial when known. Author keys, colors, permanent numbering, positioning and click behavior are unchanged. The identity regression is red on the previous numbered-pin implementation and green with the correction; personal/team empty-roster tests also cover saved, active and draft initials.

## Verification boundary

Production deployed-code and CDN artifact parity: **PASS**. Actual browser avatar rendering with synthetic snapshots: covered by the focused browser test. A live production account's public/member comment round-trip was **not performed**: `open-design.app` did not resolve/reach the share shell during this check, and no production user data was queried. Artifact verification does not claim a live share-session end-to-end result.

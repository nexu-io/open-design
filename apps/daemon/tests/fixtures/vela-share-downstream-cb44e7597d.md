# Vela authenticated comment-pull capture

Producer revision: `cb44e7597d674095a6f182b76082f106cca61016`.
Source: production createApp/public POST writer/authenticated member POST/authenticated pull against PostgreSQL, captured by lane3's `services/api/test/e2e/collab-share-management.test.ts`. Contract: Vela `specs/current/share-comment-downstream-contract.md`.

The JSON response is byte-identical to the supplied HTTP body. SHA256:
- wire: `1306f34a75b57468976c4133259d7aabc5b6d00cefc9f371ce3ae52ab2b70710`
- provenance: `385ee6fdd9d8f0d65f946e9e43fe528c3dcff2c3512d8c781137309364ae8da0`

Synthetic example.test accounts were seeded before production operations; no post-capture anonymization/field rewriting. Capture used controlled authentication profiles, not deployed session authentication. Provenance is evidence, NOT input to the consumer.

The raw body contains an unlabeled user, explicitly labeled user, legacy member (no authorKind), and user tombstone (no anchors/label). User records have no event seq/createdAt. Do not add database event metadata from provenance or confuse public GET projections with this authenticated DTO.

The local test replays these bytes at the CLI runner boundary through the real adapter/service/SQLite. It does not run a live Go process, PostgreSQL or browser. Team and personal consumption are both verified, including same-response creation followed by an anchorless tombstone. Personal deletion is authorized against the stored, project-scoped file location after earlier events persist; unavailable/failed lookup cannot acknowledge the batch; confirmed row absence is a safe no-op. Separate controlled fault/authorization scenarios cover foreign projects, unpublished files, stop/principal changes, known absence, unavailable/throwing lookup, unknown stored paths and forged wire paths; these scenarios are not additional producer captures.

latestSeq is the whole-project watermark even for member-only pulls. Switching to member,user does not recover previously excluded user events. No recovery policy, backfill or cursor reset is implemented by this test.

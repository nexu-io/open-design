# Vela server-asserted publication identity fixture

Revision: e9e4564dc. Producer reports production createApp + public POST writer + authenticated member POST + authenticated pull + PostgreSQL, generated 2026-09-22T05:12:15.978Z. Synthetic reserved example.test identities, not production accounts.

Original source: lane3-cloud `.tmp/share-p0/evidence/publication-slug/downstream.json`; provenance is `downstream.json.provenance.json` (not `downstream.provenance.json`). This JSON is a byte-for-byte copy. SHA-256: `845c0d3814757b96d1a5a36308c38a6685b9d2e4150997ad10b25a8036547af6`.

Response: HTTP200 `/api/v1/collab/projects/share-management-project/comments?authorKinds=member,user&sinceSeq=0`, ETag `"collab-comments:4"`. Two public creation payloads have server-stamped publicationSlug. Historical member and anchorless tombstone do not. Do not manufacture slug, seq or timestamps from provenance.

Consumer test is an offline raw-response replay through the real CLI adapter, orchestration and SQLite merge, not another live HTTP capture or browser visibility proof. Local source path and stop/fault scenarios are controlled consumer fixtures; raw wire bytes are unchanged.

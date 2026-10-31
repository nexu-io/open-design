# Seats invitation delivery retry — D17

Acceptance source: OPEND-3102 INV-020-CLIENT, INV-029 and the user's UI-003 decision (inline red feedback; no ordinary-dialog global failure toast).

Real two-row mail-capture rejection exposed that an explicit retry had no stable operation identity and was rejected as an existing pending invitation. Each unchanged normalized email/role row now keeps its operation key through failed responses and partial batches; editing the actual payload rotates the key. The daemon forwards the optional key in AMR's `Idempotency-Key` HTTP header. Old callers without the field remain supported. Identity and workspace authority still come from the signed-in configured session and verified directory.

Keep actionable duplicate/member/legacy-seat errors on their rows without contradictory network advice. Generic failures use one form-level red error. No failure toast is emitted. Retry is explicit and never includes already-confirmed recipients.

Validation: adapter and route tests, partial-batch and normalized-edit component tests, and real current-branch Web/daemon/API/capture E2E: reject both deliveries, preserve Admin/Member and both emails, restore capture, retry with the same operations, deliver each exactly once. Original old-version installers stay unmodified. Defect status: 待审查; no automatic archive.

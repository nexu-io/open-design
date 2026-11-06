# tools/serve

Follow the root `AGENTS.md` and `tools/AGENTS.md` first. This tool owns small local-development service entrypoints.

## Owns

- `tools-serve` CLI.
- Local static updater fixtures for desktop update IPC and packaged-runtime debugging.
- `collab-cloud` fixture — a self-contained, in-memory stand-in for the C-lane
  cross-daemon collaboration hub (comment sync + member directory; see below).

## Rules

- Keep services self-contained and local-first.
- Do not put product update runtime logic here; this tool serves deterministic fixtures only.
- New services should use explicit subcommands under `tools-serve start <service>`.

## collab-cloud fixture (TEMPORARY)

An infra-free, in-memory local backend for the C-lane cross-daemon
collaboration hub (spec §D4). It carries two things the daemon needs to make a
shared project collaborative across members' machines: an APPEND-ONLY per-project
comment stream (with a monotonic `seq` cursor) and a light member directory
(`memberId → {displayName, role}`) so the client can render an author's name +
role. It is a relay, not a validator — comments are stored opaquely and only the
`seq` is hub-owned; there is no edit/delete propagation and no presence.

Run it, then point both daemons at it (the same URL + token):

```
pnpm tools-serve start collab-cloud            # defaults to :18096
# then, for each daemon:
export OD_COLLAB_CLOUD_URL=http://127.0.0.1:18096
export OD_COLLAB_CLOUD_TOKEN=dev-internal-token
```

- **Bearer auth**: every request must carry `Authorization: Bearer <token>`;
  missing/mismatched → 401. The token is a local stub principal; the real hub
  verifies B's signed token (§D4.4). Teams are isolated by the `:teamId` path.
- **Endpoints**: `PUT /teams/:teamId/members/:memberId` (upsert directory entry),
  `GET /teams/:teamId/members`, `POST /teams/:teamId/projects/:projectId/comments`
  (append, returns `{seq}`, idempotent by comment id),
  `GET /teams/:teamId/projects/:projectId/comments?sinceSeq=N` (incremental pull,
  ETag/`If-None-Match` → 304).
- **This is disposable.** Once vela `services/collab` is stood up, delete
  `src/collab-cloud-fixture.ts` (and its wiring in `src/index.ts`) and repoint
  `OD_COLLAB_CLOUD_URL` at the real service. The daemon needs zero code changes.
  `tests/collab-cloud-fixture.test.ts` locks the fixture's half of the contract.

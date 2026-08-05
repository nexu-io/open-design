# Collab realtime — vela → daemon push channel (Hop 1 design)

Status: draft for vela-backend review. Owner: workspace-team.

## Why this exists

Open Design is local-first: **every user runs their own daemon** on their own
machine, and **vela (cloud) is the shared collaboration backend**. Any
cross-user change (user A comments on a shared project; user B should see it)
travels two hops:

```
User A edits
   │  A's web → A's daemon → vela        (write path, unchanged)
   ▼
① vela (cloud) ─────────▶ B's daemon     ← cross-user / cross-machine
   │  today: B's daemon POLLS vela
   ▼
② B's daemon ───────────▶ B's web        ← same machine
   │  today: B's web POLLS B's daemon
```

**Hop ② (daemon→web SSE)** is being implemented separately (branch
`feat/collab-sse`). It removes the same-machine polling flood and is the local
delivery layer. But it does **not** change cross-user latency: hop ② still
depends on hop ① delivering the change to the daemon, and hop ① is **poll-only
today**. Cross-user latency is therefore floored at the daemon's vela-poll
interval (~5s for comments; on-demand for members/context).

**This document specifies hop ①: a push channel from vela to the daemon**, so a
change made by one user reaches other members' daemons in near-real-time,
replacing the daemon's polling of vela.

## Verified current state (as of this branch)

- `apps/daemon/src/collab/collab-cloud-service.ts` runs an internal `setInterval`
  poll (~5s) that calls `client.pullComments(...)`. This is the only self-driven
  daemon poll.
- Members / workspace context / billing are fetched via the vela CLI on demand
  (web-request-driven, with short-lived caches).
- There is **no push/subscribe path between daemon and vela**. The only
  `subscribe` in the collab layer is `collab-publish-watcher`, which watches
  **local disk files** (chokidar), not vela.

So hop ① is genuinely new backend surface.

## Goal

vela exposes a push channel the daemon subscribes to, delivering **thin
invalidation events** ("something of type X changed") for the teams/projects the
subscribing user is a member of. The daemon reacts by re-pulling the affected
resource (it already owns the pull code) and forwarding a hop-② event to its web
client.

Non-goals:
- Not changing the write path (daemon→vela writes stay via the existing CLI/HTTP).
- Not pushing full payloads. Events are thin signals; the daemon re-pulls. This
  keeps payloads tiny, avoids server-side fan-out of large bodies, and makes a
  missed event during a disconnect harmless (a reconnect snapshot covers it).

## Event catalogue (what vela must emit)

Scope: per team (workspace) and per shared project the subscriber can see.

Workspace-scoped:
- `team-projects-changed` — a project was shared / unshared / created / deleted.
- `members-changed` — a member joined / left / changed role.
- `workspace-context-changed` — seat count / entitlement / context changed.
- `billing-changed` — subscription / seat billing changed.

Project-scoped (carry `projectId`):
- `comment-changed` — a comment was added / edited / deleted / resolved.
- `presence-changed` — a member went online / away / offline on this project.
- `project-metadata-changed` — name / settings changed.
- `resource-changed` — published files / resources changed.

Thin event shape (proposed):

```jsonc
{
  "type": "comment-changed",
  "teamId": "team_...",
  "projectId": "proj_...",   // present for project-scoped events
  "at": "2026-07-15T14:30:00.000Z",
  "eventId": "evt_...",       // optional, monotonic per team — enables Last-Event-ID
  "actorId": "user_..."       // optional, lets the daemon suppress echo of its own writes
}
```

No resource body. The daemon maps `type` → re-pull call.

## Transport (vela to choose; SSE recommended)

Options, in preference order:

1. **SSE** — `GET /v1/teams/{teamId}/events` (`text/event-stream`), one-way
   server→daemon, HTTP/1.1-friendly, native auto-reconnect, native
   `Last-Event-ID`. Matches the thin-event model. **Recommended.**
2. **WebSocket** — bidirectional, which we do not need (writes already go via the
   existing path). More infra for no benefit here.
3. **Long-poll** — acceptable fallback if SSE infra is hard; higher latency and
   more request churn.

Recommendation: **SSE per team**, multiplexing all event types over one
connection.

## Subscription model

- The daemon opens **one SSE per authenticated team** (not one per project),
  multiplexing every event type. This keeps the daemon's connection count to
  vela at one-per-team.
- **Auth**: reuse the vela session/token the daemon already holds for CLI calls.
  The endpoint authenticates the subscriber and scopes events to teams/projects
  that subscriber is a member of. The daemon must never receive events for
  projects the user cannot see.
- **Server-side filtering**: vela emits to a subscriber only the events for its
  visible teams/projects.

## Catch-up / reconnect

- On (re)connect the daemon **re-pulls current snapshots** for its active
  resources (comments for open projects, member/context for the workspace). It
  already has this code. So a disconnect gap is closed by the snapshot — **no
  server-side event buffer is required for correctness**.
- `Last-Event-ID` is **optional**: if some resource is too expensive to re-pull
  wholesale, vela may support replay-since-id for that type. Not required for v1.
- Heartbeat: vela should emit a periodic `:ping` comment (~15s) so the daemon can
  detect a dead connection and reconnect.

## Daemon-side changes (our side, once vela ships this)

1. Add a vela-events subscriber that opens the team SSE using the daemon's vela
   session.
2. On each event: re-pull the affected resource, then emit the corresponding
   **hop-② thin event** to the web sinks (workspace sink / project
   `activeProjectEventSinks`).
3. **Keep the existing polls as a fallback floor**: while the vela SSE is
   connected, pause/slow them; while disconnected, resume them. This is the same
   poll-as-floor pattern hop ② uses, and it means a daemon that cannot reach the
   vela SSE (old build, network) degrades to today's behavior with no regression.
4. Suppress echo of the daemon's own writes using `actorId` where useful.

## Scale / open questions for vela backend

- Can vela expose a per-team SSE endpoint authenticated by the existing daemon
  session token?
- What change granularity can vela emit? Does it have a change-feed / can it hook
  the write path to publish these events, or would it need its own internal poll?
- Connection budget: many member daemons subscribe per team simultaneously. Is a
  long-lived SSE per daemon acceptable at vela's scale, or is long-poll / a
  shared fan-out layer preferred?
- Presence specifically: presence is high-churn. Is a coalesced/debounced
  `presence-changed` (e.g. at most one per project per N seconds) acceptable to
  keep event volume down?

## Sequencing

- Hop ② (daemon↔web SSE) ships first, independent of this — it fixes the local
  flood and is the delivery layer this feeds. It is gated on the packaged
  `net.fetch` proxy fix (SSE is buffered by the old undici proxy).
- Hop ① (this doc) turns cross-user collab real-time once vela ships the push
  channel and the daemon subscriber replaces the polls.

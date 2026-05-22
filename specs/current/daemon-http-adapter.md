# Daemon HTTP Adapter

## Purpose

Replace the untyped `ServerContext` service-locator pattern at the daemon HTTP
boundary with a typed **Adapter Seam** plus a typed **Deps** record. Make
request parsing, response shaping, and error mapping the only HTTP-aware code;
let routes become pure `(input, deps) -> Result<output>` functions whose
interface is the test surface.

This work sharpens W4 (validation at boundary), W5 (modularize `server.ts`),
and unlocks W6 (run lifecycle) in `maintainability-roadmap.md`. It does not
re-litigate those workstreams — it provides the seam they will land against.

## Module shape

Two Adapters share one request parser:

- **`JsonRoute<Input, Output, Deps>`** — one-shot JSON request/response. Most
  of `/api/*`. Shipped in this PR.
- **`StreamRoute<Input, Event, Deps>`** — SSE streams. Deferred to a follow-up
  PR that introduces the Run Orchestrator (candidate #3 in the architectural
  sweep).

Both consume a typed `Deps` slice. The full `Deps` record is materialized by a
future `composeDeps()` function; routes today still receive existing
`ctx.<domain>` slices via the unchanged `RouteDeps<K extends keyof
ServerContext>` shape so per-route migration does not touch `server.ts`.

## Glossary additions

The following terms are pinned by this spec. They are not present in
`docs/architecture.md` or root `AGENTS.md` today:

- **Request Adapter** — the module that owns request parsing, response
  shaping, and error mapping at the HTTP boundary. Lives at
  `apps/daemon/src/http/`.
- **Json Route / Stream Route** — the two route-definition Adapters behind
  the shared parser.
- **Deps** — the typed record of domain interfaces injected into routes.
  Replaces `ServerContext` over the course of the migration.

## Files added

```
apps/daemon/src/http/
  types.ts         # Result<T, E>, JsonRouteSpec, InputParser, Handler
  parse.ts         # rawInput(req), validationError(...)
  response.ts      # sendJson, sendApiError, statusForError
  origin-guard.ts  # guardSameOrigin(req, origin) -> Result<void>
  adapter.ts       # defineJsonRoute, mountJsonRoute
  index.ts         # barrel
```

## Route shape

```ts
export const postActiveRoute = defineJsonRoute<Input, Output, Deps>({
  method: 'post',
  path: '/api/active',
  requireSameOrigin: true,
  parse: parsePostActive,   // RouteInputContext -> Result<Input>
  handle: handlePostActive, // (Input, Deps)     -> Result<Output>
});
```

`registerActiveContextRoutes(app, ctx)` is unchanged at the call site in
`server.ts`. Internally it wires the route specs through `mountJsonRoute`.

## Migration order (strangler)

1. **Done — this PR.** Scaffold the Adapter and migrate
   `active-context-routes.ts` as the proof of pattern.
2. **Next.** Migrate `mcp-routes.ts` (smallest remaining same-origin set;
   already uses `isLocalSameOrigin` + `sendApiError` consistently).
3. Migrate `chat-routes.ts` — introduce `StreamRoute` here. This composes
   with the Run Orchestrator (sweep candidate #3).
4. Migrate artifact routes — composes with the Unified Artifact Validator
   (sweep candidate #7).
5. Migrate remaining route files.
6. Materialize a typed `composeDeps()` and delete `server-context.ts`'s
   `ServerContext` interface once all route registrars have been migrated.

## Validation strategy

This PR validates input via small per-route `parse` functions. The schema-
library decision (Zod / Valibot / hand-rolled) is deferred. When it lands,
the only change is that `parse` becomes `parse: schema` for chosen-library
routes; the Adapter's interface is unaffected because schema invocation is
internal to the route's parse function.

## Tests

- `apps/daemon/tests/http/adapter.test.ts` — Adapter behavior: success,
  parse-fail, handle-fail, same-origin block, thrown-error coverage,
  Deps pass-through.
- `apps/daemon/tests/active-context-routes.test.ts` — Domain handlers
  tested through the exported `postActiveRoute` / `getActiveRoute` specs;
  no Express, no supertest, no mocking of `req`/`res`.

The existing e2e supertest suites continue to cover the wire surface and
serve as the regression guard for the migrated route.

## Wire-format note

The cross-origin response for the migrated route changes from the legacy
`{ error: 'cross-origin request rejected' }` to the structured
`{ error: { code: 'FORBIDDEN', message: 'cross-origin request rejected' } }`
shape defined by `packages/contracts/src/errors.ts`. The contracts package
already exports `CompatibleErrorResponse` (= `ApiErrorResponse |
LegacyErrorResponse`), so clients that parse either shape continue to work.

## Out of scope (deliberately)

- StreamRoute / SSE-aware Adapter. Lands with the Run Orchestrator follow-up.
- A typed `composeDeps()` that replaces `ServerContext` wholesale. Lands when
  enough routes have migrated that the `any`-bag is mostly empty.
- A new validation library. Deferred until the migration pattern is proven
  across at least three route files.
- Express → Fastify swap (roadmap W12). Unaffected by this work.

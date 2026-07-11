# HandoffButton → features/handoff — decomposition complete

`apps/web/src/components/HandoffButton.tsx` (formerly ~860 lines, one function
component with 9 `useState`, 2 endpoints, and localStorage/DOM reach woven
through the JSX) plus its `EditorIcon.tsx` dependency (formerly
`apps/web/src/components/EditorIcon.tsx`, ~168 lines) are fully decomposed
into the ADR-0002 vertical-slice shape, mirroring the `MemorySection` /
`McpClientSection` canaries.

## The four homes

1. **Wire DTOs — `@open-design/contracts`.** `HostEditor`, `HostEditorId`,
   `HostEditorsResponse`, `OpenProjectInEditorResponse`, `AgentInfo`, and the
   `HandoffClickProps` analytics event shape already existed; none were
   redeclared in the slice.
2. **Transport — `apps/web/src/providers/`.**
   - `providers/registry.ts` already owned `fetchHostEditors` /
     `openProjectInEditor` (a shared, multi-consumer resource) — reused
     directly via `dependencies.ts`, not duplicated.
   - `providers/handoff-preferences.ts` (new): the
     `open-design:preferred-editor` / `open-design:handoff-framework`
     localStorage bridge, with the `readPreferredFramework` SSR guard
     (`typeof window === 'undefined'`) covered by a `@vitest-environment node`
     companion suite.
   - The clipboard write (`lib/copy-to-clipboard.ts`, a pre-existing
     multi-consumer helper) is bound through `dependencies.ts` as the
     `HandoffClipboardPort`, same as the two provider adapters above.
3. **Ports + pure rules + hooks + dumb components —
   `apps/web/src/features/handoff/`.**
   - `ports.ts`: `HandoffEditorsPort`, `HandoffPreferencesPort`,
     `HandoffClipboardPort`.
   - `dependencies.ts`: the only slice file importing `providers/` — binds all
     three ports to their real adapters.
   - `rules.ts` / `constants.ts`: `mergeCliTargets`, `cliDisplayName`,
     `shellQuote`, `frameworkLabel` / `frameworkPromptLabel`,
     `buildCliHandoffPrompt`, `fallbackEditorFor` (the platform → Finder /
     Explorer / File Manager derivation, previously two duplicated inline
     ternaries — consolidated into one pure function during extraction), the
     CLI fallback catalogue, and the framework list.
   - `hooks/`: `useHandoffMenuNav` (open/tab/wrapRef — pure state, no port),
     `useHandoffError` (the shared error line — pure state, no port),
     `useHandoffEditors` (load, launch, the zero-editors fallback launch, and
     the split-trigger's launch-vs-toggle decision via `handleTriggerClick`),
     `useHandoffCli` (the merged CLI catalogue, both clipboard actions, the
     framework picker, and the "copied" flash timer). Each has a
     `useWiredX()` wirer binding the real ports.
   - `components/`: `EditorIcon` (migrated verbatim — a pure/dumb glyph
     component with no state, effects, or transport), `HandoffTrigger`,
     `HandoffFallbackButton`, `HandoffEditorPanel`, `HandoffCliPanel`,
     `HandoffMenu` (composes the two panels).
   - `index.ts`: the slice's one public barrel.
4. **Tests — `apps/web/tests/features/handoff/`.** The two pre-existing
   HandoffButton test files moved here and pass unmodified against the new
   orchestrator (proving behavior preservation); every new slice file has
   direct unit coverage alongside them.

## Orchestrator

`HandoffButton.tsx` is 200 lines of thin composition: `useWiredX()` hook
calls, the `fireHandoff` analytics dispatch (cross-cutting, mirrors
`McpClientSection`'s `trackMcpClick`), the AMR-attribution
`handleAmrWebsiteClick` side-effect (analytics + a DOM href mutation — no
single owning hook), the outside-click/Escape dismiss effect (kept here per
the slice's effect-placement rule, since it's a single-instance
accumulating-subscription effect), the dumb components, and JSX. Its public
export surface (`HandoffButton`, its `Props`) is unchanged; `ProjectView.tsx`
still imports it from `./HandoffButton` with no changes to the import line or
call site.

Zero-standalone-functions audit (`grep -nE '^\s*(export )?function |^\s*(export
)?async function |^\s*const \w+ = \('`) against the orchestrator returns
exactly the component declaration plus the two nested handlers
(`onPointer`/`onKey`) inside the one allowed accumulating-subscription effect
— the same shape the same grep produces against `MemorySection.tsx`. Every
JSX-inline callback, the one `useEffect`, and every `useState`/`useRef` were
enumerated and accounted for (Phase 8.5's four sub-checks), run twice,
independently.

Each feature hook is injectable via an optional `<Name>Hooks`-shaped prop
(`useNav`, `useErrorCtl`, `useEditors`, `useCli`), defaulting to its real
wired hook, mirroring `MemorySection.tsx`'s injectable-hooks pattern.

## Validation (final numbers)

- `pnpm --filter @open-design/web typecheck` — green.
- `pnpm guard` — `apps/web vertical-slice boundary check passed.`
- New + moved slice tests: `cd apps/web && npx vitest run -c vitest.config.ts
  tests/features/handoff` — **15 files, 123 tests, all passing** (real exit
  code checked, not piped through `tail`).
- Coverage (`--coverage.include='src/features/handoff/**'
  --coverage.include='src/providers/handoff-preferences.ts'`), aggregate and
  every individual file:
  - Statements: **100%** (256/256)
  - Branches: **100%** (112/112)
  - Functions: **100%** (70/70)
  - Lines: **100%** (237/237)

Reached via the Phase 9.5 classify-then-fix loop: every genuinely reachable
branch got a test (including the fetch-resolves/rejects-after-unmount guards,
the "copied" flash timer's same-target repeat-copy reset, and both the
`launch` / `launchFallback` non-`Error`-rejection paths); the one truly dead
branch (`FRAMEWORKS[0] ?? { id: 'react' }`, where `FRAMEWORKS` is a fixed
non-empty literal) was refactored to a documented non-null assertion instead
of a contrived test. No `/* v8 ignore */` or coverage-suppression comment was
used anywhere in the slice.

No logic, fetch semantics, public props, markup, className, or i18n key
changes. No CSS migration. No new server-state cache library.

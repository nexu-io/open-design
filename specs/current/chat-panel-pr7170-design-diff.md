# Chat Panel PR #7170 design diff and acceptance ledger

Status: design-to-implementation audit; no product-code changes are authorized by this document.

## 1. Scope and source of truth

This audit compares:

- the locally supplied, authoritative baseline `/Users/elian/Documents/od-design-artifacts/chat-panel-next.html` (7,050 lines; SHA-256 `ddee0cbb7fbb22267d7fca7c569d089f8745b877fb6767a20f148fa416c70a82`), equivalent to Git commit `1bbdce0b065ea8255fbe35050b9b9d18ce563f70`;
- the latest PR #7170 design source, `origin/pr-7170` at `8015870095348aa40655ef70edec6ac4de6fcc1b`;
- the current React/CSS implementation in this worktree.

The PR changes ten design files: two generated pages plus eight source files. The source-only delta is 748 insertions and 226 deletions; the full generated delta is 1,832 insertions and 745 deletions. The generated HTML is evidence, not an implementation owner. Product changes must map back to React, CSS, contracts, persistence, prompts, and tests.

The audit intentionally does not modify `docs/design/chat-mirror/mirror-exec.html`.

### Counting correction: 24 components, 88 product states, 89 demo rows

The latest `body-components.html` still has the same 24 `<article data-od-id="cmp-*">` component groups. It contains **89** `.st-l` demo rows, not 88. The baseline contains 84. Five rows were added under `cmp-clarify`: language select, color, amount slider, answered color, and answered amount.

For the requested **24 components / 88 states** acceptance ledger, the language-select row is classified as an interaction presentation of the existing single-select state rather than a distinct product state. That yields 88 product states while still testing all 89 rendered demo rows. This distinction must be made explicit in any automated state counter; silently claiming that the latest source has 88 rows would be false.

## 2. Source diff mapped to implementation owners

| PR #7170 source change | Intended behavior | Current React/data owner | Current CSS owner | Audit finding |
| --- | --- | --- | --- | --- |
| `body-components.html`: wrap live Thinking paragraphs in `.stream-viewport`; `thinking-stream.css/js`: fixed 16px gray surface, 8px inset/gap, mask only the text viewport | Thinking remains one bounded stream window; the background must not move or be masked | `ExecutionShell` and `ThoughtsRow` in `apps/web/src/components/chat/ExecutionShell.tsx:68`, `:334`; coalesced markdown in `ThinkingMarkdown.tsx:20`; scroll behavior in `chat/primitives/useThinkingStream.ts` | `chat/primitives/record.module.css:613`, `ThinkingMarkdown.module.css:1` | Structurally owned, but latest gray-surface/radius/inset needs visual parity verification. Do not apply the design JS directly; React hook owns lifecycle and reduced motion. |
| `body-components.html`: add language selector with common languages, expandable low-frequency list and 6.5-row scroll | `select` can be a compact, keyboard-operable language chooser; selection enables Next | Parser/type is `apps/web/src/artifacts/question-form.ts:114`; renderer maps both `radio` and `select` to the same option-chip list at `QuestionForm.tsx:661` | `styles/viewer/composio.css:891` onward | **Gap.** There is no dedicated select/language dropdown. The delivered row must not be copied as hardcoded Chinese; use the existing question schema and host i18n. This is the 89th demo row but a substate in the 88-state ledger. |
| `body-components.html`: split multi-select counter into `count-label` and `count-value` | “selected” label is visually quieter than the tabular number | `pickedCount` and `qf-picked` at `QuestionForm.tsx:193` and `:612` | `composio.css:841` | Partially represented as one translated string. Exact two-tone typography requires either markup-capable translation or separate typed keys; concatenating localized fragments is unsafe. |
| `body-components.html` + `interactions.js`: preset colors, native custom color, editable Hex, validation, live preview | One color state shared by preset/native/text input; invalid Hex disables Next; submitted summary retains swatch + Hex | Current renderer is one native `<input type="color">` at `QuestionForm.tsx:779`; answer serialization at `artifacts/question-form.ts:846`; submitted rendering at `QuestionForm.tsx:2194` | `composio.css:1159` | **Gap.** Current form supports the data type but not the PR interaction or summary fidelity. The source regex only accepts six-digit Hex; product must decide alpha/3-digit behavior and normalize once in parser/runtime, not only in the view. |
| `body-components.html` + `interactions.js`: editable numeric amount synchronized with range, min/max/step clamp, value text | Slider and typed value are one controlled answer; keyboard, drag and direct entry converge | Current range + output at `QuestionForm.tsx:751`; default normalization at `:1917`; serializer at `artifacts/question-form.ts:846` | `composio.css:1139` | **Gap.** Current value is not directly editable and answered summary lacks the designed label/density presentation. Use React controlled state; do not transplant DOM listeners. |
| `body-components.html`: answered color and amount rows | Submitted forms collapse into honest, immutable answer summaries | `AnsweredSummary` at `QuestionForm.tsx:2194`; submitted answers are normalized at `QuestionForm.tsx:159-163` | `composio.css:2072` | Needs explicit fixtures for color and range. Old submitted values must render without rewriting persisted content. |
| `components.css`: form title/question/selected-option weight changes; counter tone; common 16px radius token | Medium emphasis for controls, 600 only where hierarchy calls for it | `QuestionFormView` header/body at `QuestionForm.tsx:590-724` | `composio.css:758-1019` | Current ownership is clear; pixel diff must cover Chinese, English, Arabic and long German labels because font weight and wrapping are coupled. |
| `components.css`: user bubble `#121212`, medium text; timestamps, copy/feedback/fork use `#a3a3a3` | Consistent black user bubble and one muted action tier | user/assistant composition in `AssistantMessage.tsx:1236`; feedback at `AssistantMessage.tsx:2280`; fork separator at `:1517` | `styles/chat.css:496`, `viewer/theater.css:298`, `viewer/composio.css:3853` | Map raw colors to product tokens before implementation. Verify selected feedback states retain semantic green/red and are not overwritten by the shared muted ink. |
| `components.css`: memory shell and summary share 16px radius | Expanded/collapsed memory card keeps the same silhouette | memory block is emitted through the execution/tool pipeline; dedicated tests exist in `apps/web/tests/components/chat/memory-card.test.tsx` | record/tool styles in `chat/primitives/record.module.css` and `styles/viewer/tools.css` | Owner exists; add expanded/collapsed screenshot parity instead of a CSS-string assertion only. |
| `components.css`: progress title 13px/500, elapsed and intermediate summaries 12px muted, top description remains dark | Execution hierarchy must be stable across running, done, and failed shells | `ExecutionShell.tsx:120-212`, `PlanRow` at `:393`, `TodoRow` at `:424`; block shaping in `runtime/chat/build-turn-blocks.ts` | `chat/primitives/record.module.css:337`, `:613`, `:640` | High-risk visual regression area because one source item can be top-level prose, a thought group, todo prose, or a tool row. Validate real trace fixtures, not synthetic DOM alone. |
| `plan-todo.css`: skipped steps use plan’s non-current text token | skipped, done, pending are subordinate; current remains strong | `PlanPill.tsx:87` and execution `markFor` at `ExecutionShell.tsx:464` | `PlanPill.module.css:91`; record module todo rules | Behavior already has distinct statuses; verify no strikethrough/color collision under dark theme and history replay. |
| `components.css`: image tool output radius/aspect, tool metadata/icon/elapsed colors | live image generation and completed thumbnail strip remain one tool row family | tool grouping in `ToolCard.tsx`; media row rendering through `ExecutionShell.tsx:248`; terminal task hydration in `ChatPane.tsx:1260` onward | `record.module.css:337`; artifact/tool styles in `viewer/tools.css` | Current and working-tree media changes overlap this area. Acceptance must cover queued, one-image loading, N/M, success strip, partial failure/retry, and reload after terminal persistence. |
| `components.css`: artifact action overlay/fallback polish and 16px modal radius | HTML/image/video/doc cards preserve action affordances without obscuring previews | `ArtifactCards` / `ArtifactCard` in `FileOpsSummary.tsx:450`, `:482`; cards are selected by `AssistantMessage.tsx:805-909` | `viewer/tools.css:66-284` | Structure exists. Historical image version semantics are a separate correctness dependency; see `specs/current/chat-artifact-versioning-design.md`. Visual parity cannot excuse a historical card opening overwritten latest bytes. |
| `components.css`: feedback muted ink, hover, fork note, negative/positive states | Footer has stable status, controls, time; feedback modal is global/anchored correctly | completion row at `AssistantMessage.tsx:1410`; feedback state and persistence at `:2280`; reason panel at `:4279` | `viewer/theater.css:298-593`; `viewer/composio.css:3853`; `styles/chat.css:3757` | State owner exists. Screenshot all seven feedback states and ensure tooltip layering above menus; history must restore selection without replaying burst animation. |
| `components.css`: Queue action icon sizing and explicit “steer” affordance | queue is capped, editable/reorderable, can steer current turn or send now | `QueuedSendStrip` at `ChatPane.tsx:4976-5190`; queue props enter at `ChatPane.tsx:1101` | `styles/chat.css:2227-2490` and later override layer `:3454-3580` | The implementation is richer than the design row. Highest risk is duplicate cascade ownership: two queue selector blocks exist. Visual tests must assert the final computed style and user-controlled scroll, not source order assumptions. |
| `body-components.html`, `body-scene.html`, `components.css`: upgrade card becomes dark/glowing shell, balance header separated from bottom explanation + green CTA | low-credit and zero-credit cards share layout; CTA opens identity-specific upgrade flow | `UpgradeCard.tsx:41-65`; billing/action orchestration in `ChatPane.tsx` and AMR dialogs | `UpgradeCard.module.css:10-75` | **Gap.** Current markup puts CTA inside `.head`, whereas latest source moves it into the bottom row. Latest design also changes the color contract from green ink on black to green surface with dark ink. Reconcile via shared Button semantics and four identity branches; never hardcode `Upgrade`. |
| `body-scene.html`: error primary action shortens “从失败处重试” to “重试”; `components.css`: error radius 16px | one recovery vocabulary across error card and reconnect flow | `RunErrorCard.tsx:88`; failure mapping in `runtime/amr-guidance.ts:315-884`; i18n copy in all locale dictionaries | `RunErrorCard.module.css:10`; action classes in `styles/chat.css:1093` | Text is product logic, not a design-only string. Change only after failure-action matrix confirms that “retry” really resumes from the correct boundary. Existing structured error ladder must remain authoritative. |
| `components.css`: reconnect counter weight and row polish | reconnect is one transient row; 1/1 is not shown, N/M is shown when meaningful, exhausted returns control | signal reducer in `runtime/chat/reconnect-state.ts`; `Reconnect.tsx:68-135`; transport signals in `providers/daemon.ts:1656-2038` | `Reconnect.module.css:19` | Strong existing ownership and tests. Compare all three design states plus agent retry (separate reason) and ensure the row disappears after recovery/reload. |
| `tokens.css`: bundled font face changes from 400 to 500; add 16px radius alias | design’s medium tier and 2XL radius become reusable tokens | app tokens, shared components and browser font loading | product token styles, not design `tokens.css` | Do not copy the font-face weight declaration without validating that the font file actually contains a 500 face. A false weight descriptor causes synthetic/mis-selected font behavior. Add a product token instead of raw radii. |
| generated `chat-panel-next.html` and `chat-panel-scene.html` | source and generated pages remain reproducible | no React owner | no product CSS owner | Add a design-source regeneration/checksum gate in the design PR. Do not hand-edit generated pages or use them as the product stylesheet. |

## 3. Required family matrices

### QuestionForm matrix

| Dimension | Required states | Current owner | Acceptance |
| --- | --- | --- | --- |
| radio/select | none selected, selected, “Other” closed/open, long labels, language selector common/more/scroll | `QuestionForm.tsx:147-256`, `:661-676` | keyboard roving/focus, screen-reader roles, Next disabled/enabled, skip, old draft restore |
| checkbox | none, one, many, max reached, custom answer, selected counter | `QuestionForm.tsx:193-201`, `:678-700` | values stay stable across locale; counter order works in RTL; custom answer is not duplicated |
| color | preset, native picker, valid Hex, invalid Hex, submitted summary | currently only `QuestionForm.tsx:779-786` | one normalized answer, visible error, disabled Next, swatch + normalized text after reload |
| amount/range | drag, keyboard, direct number, clamp/snap, submitted summary | currently `QuestionForm.tsx:751-766` | min/max/step are contract-driven; no stale output; reduced motion; old scalar answers remain readable |
| direction cards | fan, grid, loading, selected, random, replace batch, max selection, answered image | `QuestionForm.tsx:637-723`, `:1076`; catalog parser at `artifacts/question-form.ts:418` | real preview catalog, host-owned ids, no model-authored fake cards, spacing at narrow width, scroll anchor stable |
| form lifecycle | streaming partial, multi-step, required, optional auto-continue, submitted/locked, blocked strategy turn | parser at `artifacts/question-form.ts:142-465`; view at `QuestionForm.tsx:110-210`; host at `AssistantMessage.tsx:1173-1276` | partial JSON never flashes invalid controls; one form occurrence; submit idempotent; history is inert and honest |

### Thinking and execution matrix

| Family | Required states | Owner | Acceptance |
| --- | --- | --- | --- |
| Thinking | live expanded stream, user-collapsed, first visible content removes/preempts standalone state, completed thoughts embedded in execution | `ExecutionShell.tsx:81-183`, `ThoughtsRow` at `:334`; `useThinkingStream` | fixed-height text viewport, stationary 16px surface, no tool/todo displacement, reduced motion, no auto-scroll theft |
| Plan | running checkoff, collapsed pill/popover | `ExecutionShell.tsx:393`, `PlanPill.tsx:87` | current/done/skipped hierarchy, accurate N/M, pill does not overlap jump-to-latest |
| Task progress | running, completed, failed; nested tool/thought/prose ordering | `runtime/chat/build-turn-blocks.ts`; `ExecutionShell.tsx:68-464` | real Claude/Codex/AMR traces, stable ordering after reload, collapsed bodies deferred without losing accessible text |
| Tool rows | read, write, code live/success/failure, image live/success/partial failure | `ToolCard.tsx`, `ExecutionShell.tsx:248` | titles derive from command semantics, terminal cap/following is user-controlled, retries do not duplicate completed rows |

### Upgrade, artifact, queue and error matrix

| Family | Required states | Owner | Acceptance |
| --- | --- | --- | --- |
| Upgrade | low credit, zero, CTA pending, owner/member/personal/self-hosted outcomes | `UpgradeCard.tsx:41`, AMR dialog/gate components, `runtime/amr-guidance.ts` | latest layout and color contract; no flash for top-tier; CTA destination matches identity; all strings translated |
| Artifact | HTML publish/export, non-HTML export, video, doc fallback, loading, open latest vs historical image snapshot | `FileOpsSummary.tsx:384-630`, `AssistantMessage.tsx:805-909` | preview fit, overlay, menu boundary; HTML opens latest per product rule; an old image card opens that turn’s immutable image |
| Queue | one, capped/scrolling many, edit, delete, reorder, steer, send now, dequeue to message | `ChatPane.tsx:4976-5190` | no composer/log width drift; queue scroll stays local; dequeue preserves order; send acknowledgement is immediate |
| Error/reconnect | generic, CLI/BYOK special, support dialog, reconnect 1..5, exhausted, retrying agent, recovered | `RunErrorCard.tsx:88`, `Reconnect.tsx:68`, `runtime/amr-guidance.ts`, `runtime/chat/reconnect-state.ts` | one visible recovery owner, no duplicate raw error pill, support is app-level layer, recovered row disappears, old raw errors degrade safely |

## 4. The 24-component / 88-state validation ledger

The state counts below total exactly 88. Every numbered entry becomes a deterministic gallery fixture and a focused assertion set. The additional language-selector presentation is validated under component 9 without increasing its product-state count.

| # | Design id / component | Product states | State fixtures to cover | Primary implementation owner |
| --- | --- | ---: | --- | --- |
| 1 | `cmp-msg-text` / user text | 7 | sent; six-line clamp; clamp hover; unbroken URL; failed; failed hover; multiline hover | user-message rendering in chat message components; `styles/chat.css` |
| 2 | `cmp-msg-att` / sent attachments | 8 | image; image+text; failed; hover preview; document; mixed; overflow; middle-ellipsis | attachment runtime/components and chat CSS |
| 3 | `cmp-paused` / pause | 1 | one sentence only | pause-line component/test |
| 4 | `cmp-att-tray` / staged attachments | 5 | ready; upload; doc; failure; horizontal overflow | composer staged attachment components; chat CSS |
| 5 | `cmp-reconnect` | 3 | reconnecting; final attempt; exhausted | `Reconnect.tsx`; reconnect reducer |
| 6 | `cmp-selection` / quote to chat | 5 | above selection; flipped below; chip; chip hover; multi-reference count | quote bar/quoted refs components |
| 7 | `cmp-thinking` | 3 | live; content landed; embedded completed thoughts | `ExecutionShell.tsx`; thinking hook/module |
| 8 | `cmp-start-copy` | 1 | sole start sentence | assistant prose/block attribution |
| 9 | `cmp-clarify` / QuestionForm | 14 | pending single (including language-select presentation); selected single; multi; custom single; custom multi; color; amount; direction pending; direction selected; answered single; answered multi; answered direction; answered color; answered amount | `QuestionForm.tsx`; parser; composio CSS |
| 10 | `cmp-plan-card` | 2 | running; collapsed popover | `PlanPill.tsx`; execution plan row |
| 11 | `cmp-task-progress` | 3 | running; complete; failed | `ExecutionShell.tsx`; block builder |
| 12 | `cmp-memory` | 2 | collapsed; expanded | memory tool/card path |
| 13 | `cmp-tool-read` | 1 | terminal success/failure variant | `ToolCard.tsx`; `ToolRow` |
| 14 | `cmp-tool-write` | 1 | terminal success/failure with change count | `ToolCard.tsx`; `ToolRow` |
| 15 | `cmp-tool-code` | 3 | live; success collapsed; failure expanded | `ToolCard.tsx`; execution shell |
| 16 | `cmp-tool-image` | 3 | incremental; success strip; partial failure/retry | media task + execution/tool row |
| 17 | `cmp-summary-copy` | 2 | streaming; complete | assistant prose reveal |
| 18 | `cmp-artifact` | 4 | default; HTML; non-HTML; video | `FileOpsSummary.tsx` |
| 19 | `cmp-audio` | 2 | stopped; playing | `chat/AudioArtifact.tsx` |
| 20 | `cmp-feedback` | 7 | default; hover tooltip; dislike selected; like selected/toggle; fork divider; interrupted; reason modal | `AssistantMessage.tsx:2280`; footer CSS |
| 21 | `cmp-next-steps` | 2 | default three; one hover | `NextStepActions` |
| 22 | `cmp-queue` | 3 | queued; capped/scrolling; dequeued | `ChatPane.tsx:4976` |
| 23 | `cmp-upgrade` | 3 | low; zero; identity-specific modal | `UpgradeCard.tsx`; AMR gate/dialogs |
| 24 | `cmp-error` | 3 | generic; CLI/BYOK special; support layer | `RunErrorCard.tsx`; failure resolver/support dialog |
|  | **Total** | **88** | plus one language-select demo presentation = 89 screenshot rows |  |

### Validation mechanics

1. Build a data-driven gallery route or test-only fixture table keyed by the 24 design ids and 88 product-state ids. No fixture may depend on a live model or media provider.
2. Capture at minimum 480px and 760px chat widths, light/dark themes, `zh-CN`, `en`, `de`, and one RTL locale. Use computed-style assertions for typography/color/radius and screenshot diff for geometry.
3. Use virtual clocks for stream, reconnect, auto-continue, elapsed and upgrade countdown states. Animation screenshots freeze at deterministic progress; reduced-motion is a separate lane.
4. For the 89 demo rows, generate a coverage report mapping each latest `.st-l` label to exactly one fixture. The language selector maps to the same product-state id as pending single-select but has its own screenshot.
5. Run existing focused suites first, then browser E2E. Relevant coverage already exists under `apps/web/tests/components/chat/`, `apps/web/tests/components/QuestionForm*.test.tsx`, `apps/web/tests/runtime/chat/`, and `e2e/ui/chat-error-card-layout.test.ts`; it is broad but not a complete cross-product or PR #7170 visual oracle.

## 5. Old conversation compatibility

Compatibility must be tested with persisted payloads from at least the previous release and current `main`, not merely by constructing current in-memory objects.

| Historical shape | Expected rendering | Evidence/current behavior | Required fixture |
| --- | --- | --- | --- |
| old assistant text with `<question-form>` and submitted answer text | render submitted/locked summary; never resubmit automatically | partial/final parsing in `artifacts/question-form.ts:142-465`; locked state at `QuestionForm.tsx:159`; answer reverse parsing starts at `QuestionForm.tsx:2125` | raw persisted content + reload + locale change |
| retired `AskUserQuestion` tool call/result | inert, readable question + actual stored answer; no native tool route | defensive legacy renderer at `ToolCard.tsx:121-227` | string options, object options, multi-answer, malformed input |
| old `select` data | keep value and option identity even if new UI presentation changes | current parser and radio-style renderer at `QuestionForm.tsx:661` | old select with value, label-only legacy option, unknown value |
| old direction values/embedded cards | normalize known historical value; never invent an answer or fake history | submitted normalization at `QuestionForm.tsx:159-163`; host catalog at `:637-723`; parser catalog enrichment at `artifacts/question-form.ts:418` | old tone radio, old `direction-cards` with cards, missing catalog asset |
| old tool events without current structured status/failure codes | readable generic row/card with conservative recovery | `ToolCard` fallbacks and `runtime/amr-guidance.ts` compatibility ladder | previous-release event JSON and raw error-only rows |
| old message with no immutable artifact snapshot | show current workspace file only when policy says “latest”; for historical image, label honest unavailability rather than pretend current bytes are old | artifact cards currently resolve by path; architecture is detailed in `chat-artifact-versioning-design.md` | overwritten image path, deleted path, renamed path, HTML latest |
| old completed/failed/canceled run with todo snapshots | stable completion/footer state; no stale “unfinished” claim | message events/status plus execution/footer logic | prior-release DB rows for all terminal states |

The compatibility bar is: no crash, no raw internal JSON/DSML leakage, no enabled action that cannot succeed, no false historical preview, and no mutation of persisted old content merely to obtain the new look.

## 6. i18n and prompt/experiment risk

### Host text vs model text

- Model-authored form title, label, help, placeholders and option labels follow `form.lang`; the view deliberately resolves `tForLanguageTag(form.lang)` at `QuestionForm.tsx:128-133`.
- Host-authored strings—Required, Next, Skip, selected count, More languages, invalid color, amount unit/level, retry, reconnect, Upgrade, support actions—must be typed dictionary keys present in all 19 locale files. The latest design source’s Chinese labels and English `Upgrade` are not safe product copy.
- Language names/codes need a deliberate source (localized display names or stable native names). Do not concatenate `selected` + number or unit + value in a fixed order; RTL and inflection require full messages or structured accessible labels.
- Raw design colors (`#121212`, `#a3a3a3`, `#00FF08`) must become semantic product tokens with dark-theme/high-contrast variants. The design page itself claims product-token ownership, so copying literals into scattered modules would violate that intent.

### Legacy vs Design Harness / OD Next

Question-form protocol wording exists on multiple live paths:

- legacy/default daemon prompts: `apps/daemon/src/prompts/system.ts:621`, `:1428-1457` and `apps/daemon/src/prompts/discovery.ts:44-91`;
- API/BYOK mirrors: `packages/contracts/src/prompts/system.ts:426-443` and `packages/contracts/src/prompts/discovery.ts:42-89`;
- slim/strategy prompt: `apps/daemon/src/prompts/core-slim.ts:130-221`;
- OD Next strategy coordination and frozen bundle paths under `apps/daemon/src/strategies/od-next/` and `packages/contracts/src/prompts/od-next-*`.

Risks and gates:

1. A renderer-only change is preferable for language/color/amount presentation. Do not require the model to emit design-only fields when the existing `select`, `color`, `range`, min/max/step and options contract already carries semantics.
2. If the schema or authoring rules change, update legacy daemon, contracts mirror, core-slim, strategy assets/bundle hashes and prompt snapshots in one change. A legacy-only prompt edit recreates the observed A/B divergence where normal Chat knows a card type but Design Harness does not.
3. Keep `direction-cards` host-owned. Both discovery prompts explicitly tell the model to omit cards/options/default metadata (`apps/daemon/src/prompts/discovery.ts:75-82`; contracts mirror `:73-80`). The renderer must supply the versioned catalog; prompt experiments must not reintroduce model-generated fake preview arrays.
4. Preserve the stop-turn semantics after a blocking form and the `<od-done>`/strategy continuation contracts. Visual changes cannot alter whether a task is marked complete or awaiting clarification.
5. Add prompt-parity tests that inspect every active prompt family for the same supported type list, host-owned direction rule, locale rule and stop-turn rule. Existing parser parity (`e2e/tests/question-form-parity.test.ts`) does not prove prompt-family parity.

## 7. Test plan and release gates

### Red tests before implementation

- QuestionForm: language selector expansion/scroll/keyboard; preset + Hex color convergence and invalid state; editable range clamp/snap; submitted color/range summary; multi-select counter semantics.
- Thinking: stationary surface with masked scrolling text; existing tools/todos remain outside the live viewport; user collapse survives subsequent deltas; reduced motion.
- Execution: exact typography hierarchy for opening prose, step title, intermediate prose, command row and elapsed; real recorded traces across Claude/Codex/AMR.
- Upgrade: latest DOM order (header then bottom copy+CTA), low/zero states, four identity outcomes, no top-tier flash.
- Artifact: HTML/image/video/doc visual states; immutable historical image vs latest HTML behavior; overwritten/deleted/renamed paths.
- Queue: one/overflow/reorder/edit/steer/dequeue; local scroll; final computed style despite duplicate selector blocks.
- Error/reconnect: generic/CLI/BYOK/support, reconnect attempts/final/exhausted/recovered, one recovery owner, no duplicate error pill.
- History: prior-release SQLite/message fixtures for old QuestionForm, AskUserQuestion, raw tool errors, todo terminal states and artifacts.

### Gates

1. Focused unit/component suites for each owner.
2. 24/88 ledger coverage report plus all 89 design-row screenshots.
3. `pnpm --filter @open-design/web typecheck`, focused web tests, `pnpm guard`, repository typecheck.
4. Browser E2E at constrained width with local service only; full matrix/CI may run remotely.
5. Prompt parity and all 19 locale compile checks when any host copy or prompt changes.
6. Previous-release DB replay and current-main replay before beta packaging.

## 8. Priorities and open decisions

### P0 correctness gates

- Do not call the latest design “88 rows”; resolve the 88-state/89-row taxonomy or correct the design source.
- Preserve historical image bytes separately from latest workspace paths before claiming Artifact history compatibility.
- Keep structured error/reconnect ownership singular and prevent raw/internal output leakage.
- Ensure Design Harness/OD Next and legacy prompts remain behaviorally aligned when protocol wording changes.

### P1 parity work

- Rich color and amount controls plus answered summaries.
- Dedicated language-select presentation, if product confirms that it is host-owned rather than a one-off design demo.
- Latest Thinking surface, execution typography, upgrade layout/color contract, artifact overlay and feedback muted tier.
- Complete queue computed-style consolidation and state screenshots.

### Decisions needed

1. Is the language selector a generic `select` presentation, only a known language-question presentation, or not product scope? The 88/89 discrepancy depends on this ruling.
2. Does color accept only six-digit Hex, or also alpha/short forms? What canonical value is sent back to the model?
3. What label/unit schema accompanies range values so the submitted summary can say more than an opaque number?
4. Is the new green-surface Upgrade CTA final across light/dark/high-contrast themes and shared Button primitives?
5. Should “重试” always mean resume from failure boundary, or are there error types where the more explicit copy must remain?

Until those decisions are closed, the latest PR is a detailed visual target, not a drop-in stylesheet or a complete product contract.

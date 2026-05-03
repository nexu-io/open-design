# OneShot Design Product Direction

OneShot Design is the professional AI Design OS built on the Open Design engine. The product promise is simple: one prompt, source folder, reference board, or rough idea becomes a structured brief, polished artifact, critique score, verified export, and reusable project record.

OneShot should be able to do anything and everything design-related over time. The durable architecture is not one giant monolith; it is a shared core that can keep attaching expert studios, external engines, workflows, adapters, and quality gates without losing project history or operator trust.

The GitHub repository may still be named `nexu-io/open-design` during the rename, but the app-facing product name is OneShot Design.

## Current Build

- The entry screen defaults to a new `Workflows` tab.
- The Workflows tab now opens with a `Design OS command structure` section that makes the parent architecture explicit: Website Studio, Product UI Studio, Brand Studio, Deck Studio, Marketing Studio, CoverVision OS, Evidence Studio, and Codex Build Studio.
- The Workflows tab now includes a project-backed `Website Studio workbench` surface that turns the Design OS architecture into working studio depth: editable site intake, sitemap/page planner, selectable section library, responsive preview frames, design-token panel, deploy adapter state, generated artifact previews, quality review state, comments/pins, and Evidence Studio v1 source state.
- OneShot now has a shared Design OS core model in `src/oneshotDesignOS.ts` covering studios, shared capabilities, professional output controls, and adapter contracts.
- The shared Design OS model now includes concrete module data for Website Studio sections, shared quality gates, professional output controls, CoverVision OS deepening, Evidence Studio pipeline, and adapter-layer guardrails.
- Website Studio v1 is now a first-class workflow pack. It persists intake, sitemap, selected sections, tokens, deploy target, deploy command evidence, quality reviews, comments/pins, Evidence Studio counters, and generated artifacts into workflow project metadata.
- Website Studio now generates deterministic artifact bodies for `site_plan.md`, `section_library.md`, `design_tokens.md`, `codex_build_brief.md`, and `responsive_qa.md`, and injects those exact files into the agent prompt when launching the packet.
- Website Studio packets are now seeded into the daemon project folder as real markdown files with artifact manifests, so the generated project opens with the plan, section library, tokens, build brief, and responsive QA on disk.
- The Website Studio v1 workflow includes a future handoff contract for the dedicated Website Builder / Design OS through `generateSitePlan`, `generatePage`, `generateSection`, `validateResponsive`, `exportBuildBrief`, and `publishOrPrepareDeploy`.
- The Website Studio deploy rule is explicit and visible in the workbench: OneShot must not claim a website is deployed unless the daemon has verified a real local URL or an external HTTPS target with recorded deployment command evidence. The adapter states are `prepare-only`, `verified-local`, and `verified-deployed`.
- CoverVision OS is positioned as the premium book-cover studio inside OneShot, not the whole OneShot identity.
- CoverVision OS now has a deeper premium studio panel for cover concept lanes, typography lab, series system, and ARC/ad/audiobook crop packs.
- Evidence Studio now has a visible pipeline for ingesting and classifying sources, preserving evidence trails, generating `DESIGN.md`, and creating opportunity/Codex packets. Website Studio also includes an Evidence Studio v1 source panel that can scan a local source folder, classify originals, thumbnails, supporting assets, and flagged files, and carry the evidence list into the website packet.
- Professional output controls are now part of the product language: critique panel, quality scorecard, comments and pins, tweak controls, export history, evidence trail, review before export, and no fake deploy/status.
- Shared quality gates now appear as a cross-studio scorecard with real review state: each gate can be `pass`, `needs review`, or `blocked`, with notes and evidence carried into Website Studio artifacts.
- Website Studio projects now show a `Project Packet` view summarizing disk artifacts, quality gate state, pins/comments, adapter status, and evidence trail with one-click artifact opening.
- Workflow cards seed the right project type, skill, design system preference, prompt, quality checkpoints, and export expectations.
- Workflow-created projects preserve their workflow identity in metadata, show the selected production path in the project header, and inject workflow gates/export expectations into the agent prompt stack.
- Workflow scorecards are now structured metadata, so each production path carries its own critique rubric into the agent prompt even after the starter prompt changes.
- Workflow export packages are structured metadata, visible on the workflow cards, and injected into the agent prompt as concrete deliverable contracts.
- OneShot Cover Run now carries a CoverVisionOS handoff contract with production stages, expected files, and downstream router commands.
- Claude Design Author Cover Lab now captures Claude Design as an author cover layout, typography, series-system, brief-deck, and pre-generation module for CoverVision workflows.
- The Claude Design author module is documented in `docs/claude-design-for-authors.md` with 10 workflows, prompt templates, genre calibration, handoff rules, and production pitfalls.
- AI Opportunity Intelligence now has its own workflow pack for turning messy screenshots, Telegram exports, reports, and product ideas into `DESIGN.md`, an opportunity report, and a Codex build brief.
- The Operational Atelier design contract is captured in `docs/DESIGN.md` as the north star for evidence-first OneShot surfaces.
- Workflow-created projects now show a reusable blueprint strip with gates, exports, scorecards, handoff context, a copyable prompt, and a save action.
- Saved blueprints appear on the Workflows tab and can start a new project with the original skill, design system, metadata, and reusable prompt. They can also be grouped by workflow category or custom collection, filtered to pinned items, renamed, pinned above recent items, promoted to the top of the library, and deleted after confirmation.
- The top navigation now includes a dedicated Library Search tab after Design systems. It spans saved blueprints, Inspiration boards, and generated project records, with direct actions to start a blueprint, create an Inspiration brief, or reopen a project.
- The entry header can export a full OneShot studio snapshot covering generated projects, saved templates, workflow blueprints, Inspiration boards and pins, Library Search views, and Library Search transfer history.
- Studio snapshots can now be imported through a dry-run restore preview with merge or replace conflict handling before any local library data is changed.
- Studio snapshot import can now restore selected daemon-backed project and template records with a visible server-write audit and rollback notes.
- Library Search can now narrow reusable work by source, output type, and recent activity, which keeps large local libraries easier to scan.
- Library Search views can now be named, saved, grouped by collection or production lane, pinned above recent views, annotated with owner and usage notes, duplicated as quick variants, reapplied, deleted, previewed before transfer, exported, and imported as OneShot JSON packets with rename, replace, or skip conflict handling, before/after packet audits, exportable local transfer history, import replay, and transfer notes for client, machine, or production-lane context, so common filters can become portable studio workbenches.
- The Inspiration Library adds local Pinterest-style boards and pins for visual references, source links, imported local images, usage notes, tags, and OneShot reference-brief creation.
- Inspiration boards can now be renamed, retagged, described, and deleted with their pins; individual pins can be edited in place from the board view.
- Inspiration boards recommend the strongest OneShot production paths and can launch a workflow-specific project with the board attached as the reference lock.
- Inspiration boards can be exported and imported as OneShot JSON packets, so reference libraries can move between machines, backups, and repos.
- Workflow launches can attach an Inspiration Library board as the reference lock, adding the board context and pins into the generated prompt and workflow metadata.
- The first production packs are Website Studio v1, iOS 26 App Prototype, BSA Proposal + SOW, Roofing Pitch Deck, OneShot Cover Run, Claude Design Author Cover Lab, Dashboard Mockup, PRD Factory, Motion Explainer, and AI Opportunity Intelligence.
- James's iOS 26 Liquid Glass reference is available as the `ios-26-liquid-glass` design system and is the default visual route for the iOS 26 App Prototype workflow.
- The Liquid Glass system includes `design-systems/ios-26-liquid-glass/assets/reference-prototype.html`, a compact visual reference for lock screen widgets, Control Center tiles, app chrome, modal sheets, and reduced-brightness behavior.
- The app metadata, loading shell, onboarding copy, exported ZIP README, and locale strings now use OneShot Design.
- Next.js dev is configured to allow `127.0.0.1` and `localhost`, which keeps the in-app browser hydrated on local ports like `3004`.

## Workflow Standard

Every OneShot workflow should move through these gates:

1. Brief lock
2. Reference lock
3. Draft artifact
4. Critique score
5. Polish pass
6. Verified export

This makes OneShot different from a blank AI chat. The user starts from a professional production path, and the system should keep the output measurable, export-ready, and reusable.

## Near-Term Build Priorities

1. Add exact-position artifact comments and pin overlays inside markdown/preview tabs, not only packet-level pin summaries.
2. Expand Evidence Studio v1 from source scan into generated `DESIGN.md`, opportunity packet, and Codex brief files.
3. Wire Website Builder adapter execution to real prepare/build/deploy commands while preserving the current honest status contract.
4. Build the Operational Atelier intake screen: source rail, precision-tray drop zone, evidence canvas preview, inspector/action panel, and run deck using `docs/DESIGN.md`.
5. Add Project Packet export history and packet replay so a prior Website Studio packet can be regenerated or transferred cleanly.

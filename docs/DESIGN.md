# Operational Atelier Design Contract

Project: AI Opportunity Intelligence / OneShot Designs handoff
Generated: 2026-05-01
Source evidence: `C:\Users\james\OneDrive\Documents\New project 20\corpus-intel\telegram-ai-opportunity-image-report-2026-05-01`

## North Star

OneShot Design should feel like an Operational Atelier: part command center, part design studio, part evidence room.

The product turns messy screenshots, exports, research links, product ideas, and agent outputs into precise, trustworthy build packets. It should feel calm enough for an executive, dense enough for an operator, beautiful enough for a design team, auditable enough for serious agent work, and fast enough to feel like a tool instead of a report generator.

## Product Personality

- Your messy research is now organized.
- Every claim has a source.
- Every screenshot can become a design decision.
- Every opportunity can become a Codex build brief.
- Agents are powerful, but humans remain in control.

Avoid generic SaaS dashboard energy, purple AI gradients, chat-first layouts, decorative metrics, and unserious toy aesthetics.

## Desktop Layout

Use a four-zone layout for the AI Opportunity Intelligence surface:

1. Source Rail: folders, Telegram exports, screenshot groups, reports, manifests, prior runs, originals, thumbnails, supporting assets, and flagged files.
2. Evidence Canvas: contact sheet, selected screenshot preview, cluster cards, timeline/import sequence, and source-to-output trace.
3. Inspector Panel: metadata, dimensions, classification, visible text, product reference, pattern tags, risk notes, and actions.
4. Run Deck: inventory status, contact sheet status, report generation, DESIGN.md generation, Codex brief export, privacy checks, and output paths.

## First Screen

Build the first screen as a split command atelier:

- Left: recent runs and source folders.
- Center: large precision-tray drop zone that becomes a contact sheet preview.
- Right: live run checklist and output packet.
- Bottom: Evidence Trail strip with thumbnails, counts, and risk flags.

Required intake copy:

> Turn messy research into a build-ready intelligence packet.

Supporting copy:

> Drop screenshots, Telegram exports, reports, or project folders. OneShot extracts the structure, builds the evidence map, and generates a DESIGN.md plus Codex-ready brief.

Privacy statement:

> Local run only. Files stay on this machine unless you explicitly export or upload them.

## Visual Direction

Use a restrained command-studio palette:

- Warm charcoal and graphite for command surfaces.
- Soft cream paper for reports and reading.
- Amber for evidence highlights and active source accents.
- Cyan for live action and agent telemetry.
- Green for safe/completed states.
- Red only for real risk or failed checks.

Avoid purple gradients, neon dashboards, pure black/white everywhere, and low-contrast gray-on-gray UI.

## Typography

Use a distinctive display serif for major titles and a precise UI sans for controls. Use mono for paths, hashes, dimensions, command snippets, run IDs, and evidence coordinates.

Suggested stack:

- Display: Fraunces, Ivar Display, Georgia, serif.
- UI/body: Satoshi, IBM Plex Sans, sans-serif.
- Mono: JetBrains Mono, IBM Plex Mono, monospace.

## Core Components

Evidence Tile:
- Thumbnail, filename, role badge, dimensions, timestamp, quick actions.
- States: default, selected, used in report, used in DESIGN.md, ignored, flagged private.
- Selected tile gets an amber/cyan edge trace.

Source Rail Item:
- Source type, name, count, risk indicator.
- Active state uses a slim glowing edge.

Cluster Card:
- Cluster name, evidence count, short insight, representative thumbnails, add-to-report action.
- More editorial than metric-card.

Agent Step:
- Step name, status, output path, duration, and error detail.
- Active step gets a small cyan pulse.

Opportunity Score Card:
- Idea, score, speed to launch, revenue potential, defensibility, asset fit, risk, and evidence links.
- Serious investor memo energy, not gamified meters.

Markdown Output Panel:
- Document title, editable Markdown body, copy action, save path, and source evidence panel.
- Paper surface with mono code blocks.

## Interaction Rules

- Always show where files are stored.
- Every generated claim needs a path back to evidence.
- Let the user mark items private or excluded.
- Make destructive actions explicit, boring, and reversible.
- Never hide local paths behind vague labels.
- Preserve import/export history and duplicate-name behavior.

## Motion

Motion should communicate intelligence and progress:

- Staggered reveal for evidence tiles.
- Subtle shimmer while hashing/inventorying.
- Small pulse for active agent step.
- Smooth crossfade from thumbnail to detail.
- Drawer transition for inspector panels.
- Path-trace animation for source-to-output lineage.

Avoid bouncy toy animations, infinite spinners with no status, generic card scaling everywhere, and excessive parallax.

## OneShot-Specific Requirements

High-value OneShot features:

- Select screenshots and mark them as style reference.
- Generate DESIGN.md from selected references.
- Preserve source paths and import history.
- Show transfer/export history for packets.
- Offer Create, Rename, Replace, Skip behavior for duplicate packet names.
- Keep a visible audit trail of what was imported, transformed, and exported.

## Anti-Patterns

Do not:

- Build a chat box with a file upload button and call it done.
- Make every screenshot a same-size card when important images need more room.
- Use generic metrics without evidence.
- Hide filesystem output.
- Flatten all references into one summary.
- Use fake charts before real data exists.
- Make report pages feel like dashboards.
- Let AI-generated reports appear without review state.

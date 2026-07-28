# Launch Studio Store Screenshot Phase 1 Design

## Status

- Date: 2026-07-28
- Status: Approved in conversation; awaiting written-spec review
- Product: Launch Studio
- Upstream baseline: `nexu-io/open-design` `main` at `f52fda29a8a6fc65c501a45bb165b6f5208194a1`
- Target platforms: macOS and Windows desktop

## 1. Objective

Phase 1 turns the Open Design fork into a focused App Store and Google Play
phone-screenshot studio.

The user can:

1. Create a screenshot project.
2. Enter the minimum product information needed for truthful marketing copy.
3. Upload real product screenshots, a logo, and optional brand assets.
4. Select an existing Design System and a screenshot template.
5. Ask AI to propose a structured screenshot set, or build one manually.
6. Review and edit every page without leaving the existing Open Design Studio
   experience.
7. Generate App Store and Google Play portrait variants from one canonical
   document.
8. Validate and export opaque PNG files plus a machine-readable manifest.

## 2. Product and Interface Direction

Launch Studio retains the current Open Design product shell, navigation,
components, interaction language, and Studio layout.

It does not introduce a separate three-column screenshot application.

### 2.1 Entry points

- Add a Store Screenshots task card to the existing home and new-project
  surfaces.
- Add a store-screenshot template or scenario to the existing picker.
- Allow the same capability through the daemon HTTP API and the `od` CLI.

### 2.2 Studio behavior

- The left side remains the Open Design conversation and generation-progress
  surface.
- The right side becomes a screenshot-set gallery inside the existing preview
  surface.
- Existing provider, Design System, template, and export controls remain in
  their established locations.
- The gallery switches between App Store and Google Play variants.
- A thumbnail rail changes the active screenshot page.
- A focused-edit action opens the selected page for direct text, color, asset,
  visibility, position, and scale edits.
- Focused editing uses the existing Open Design floating-edit interaction
  language. Fabric.js is an internal canvas adapter, not a replacement app
  shell.

### 2.3 Conversational changes

The user can request set-level or page-level changes, including:

- Rewrite the second page headline.
- Move page three before page two.
- Apply a dark visual direction to the set.
- Replace the product screenshot on page four.
- Hide a subtitle on Google Play only.

AI returns a validated ChangeSet. The UI previews the affected pages and applies
the ChangeSet only after user confirmation.

## 3. Scope

### 3.1 Included

- iPhone portrait App Store screenshots.
- Android phone portrait Google Play screenshots.
- One canonical screenshot set with platform-specific variants.
- Minimum Product Profile fields required to ground generated copy.
- Existing Open Design Design Systems as the initial Brand Profile source.
- Asset upload and managed references.
- At least three deterministic templates.
- AI-generated structured screenshot plans.
- Manual creation when no provider is configured.
- Focused editing of text, colors, visibility, position, scale, and image
  selection.
- Page add, duplicate, delete, reorder, lock, and regenerate.
- Background validation, rendering, and ZIP export.
- Document version history and restore.
- HTTP, UI, and CLI surfaces.

### 3.2 Excluded

- iPad and Android tablet screenshots.
- Landscape screenshots.
- Google Play feature graphics, icons, and preview videos.
- App Preview video generation.
- Automatic upload to App Store Connect or Google Play Console.
- Localization and CJK or RTL layout adaptation.
- Social-media images, store copy suites, product video, Website Studio, and
  Automation.
- A professional freeform timeline, Photoshop-equivalent image editor, or
  arbitrary user-code execution.

## 4. Platform Targets

Platform rules live in versioned configuration and are not hard-coded into UI
components.

### 4.1 App Store

- Platform target ID: `app-store-iphone-6.9-portrait`
- Output size: 1290 × 2796 pixels
- Output format: PNG
- Alpha channel: forbidden
- Allowed count: 1–10 pages

Apple accepts multiple 6.9-inch screenshot dimensions. Phase 1 uses 1290 × 2796
because it is an accepted portrait size and matches the existing technical
proposal's canonical Design Document example.

### 4.2 Google Play

- Platform target ID: `google-play-phone-portrait`
- Output size: 1080 × 1920 pixels
- Output format: PNG
- Alpha channel: forbidden
- Product default: at least 4 pages

Google Play permits a broader range. Phase 1 chooses 1080 × 1920 because it is a
recommended high-resolution 9:16 portrait target for phone screenshots.

## 5. Architecture

Launch Studio remains a modular monolith:

```text
Electron shell
    ↓
Open Design Web Studio
    ↓ HTTP / SSE
Local Daemon
    ├── Store Screenshot routes and service
    ├── AI orchestration and ChangeSet validation
    ├── Job queue
    └── Project persistence
            ↓
Store Screenshot domain package
    ├── Canonical document schemas
    ├── Platform specifications
    ├── Layout constraints
    ├── Validation rules
    └── Render model compiler
            ↓
Background deterministic renderer
    ↓
Opaque PNG files + manifest + ZIP
```

### 5.1 Fork strategy

- Keep inherited `@open-design/*` package names and internal control-plane
  protocols in Phase 1.
- Change user-visible branding through centralized product identity surfaces.
- Add Launch Studio business logic behind new domain boundaries.
- Keep `upstream` pointing at `https://github.com/nexu-io/open-design.git`.
- Do not perform a repository-wide rename that would make upstream merges
  impractical.
- Retain the Apache-2.0 license and all applicable third-party notices.

### 5.2 Repository boundaries

- Shared web/daemon DTOs and wire schemas belong in `packages/contracts`.
- Canonical screenshot business rules belong in a pure TypeScript package
  named `@launch-studio/store-screenshot`.
- HTTP routes, database access, file access, jobs, and rendering orchestration
  belong in `apps/daemon`.
- Product UI belongs in a focused feature directory under `apps/web/src`.
- App source directories remain source-only; tests use each package or app's
  sibling `tests/` directory.
- Every public capability closes the HTTP, UI, and CLI loop in the same change.

## 6. Canonical Business Documents

The editable source document is the long-lived product data. Fabric JSON,
generated HTML, and exported PNG files are derived artifacts.

### 6.1 Product profile

Phase 1 requires only:

```ts
interface StoreProductProfile {
  id: string;
  name: string;
  summary: string;
  targetAudience: string;
  features: Array<{
    id: string;
    name: string;
    benefit: string;
    locked: boolean;
  }>;
  lockedTerms: string[];
}
```

Generated headlines must be grounded in these confirmed fields.

### 6.2 Store screenshot document

```ts
type StorePlatformTarget =
  | "app-store-iphone-6.9-portrait"
  | "google-play-phone-portrait";

interface StoreScreenshotDocument {
  schemaVersion: 1;
  id: string;
  projectId: string;
  productProfileId: string;
  designSystemId: string;
  sourceAssets: StoreAssetReference[];
  pages: StoreScreenshotPage[];
  variants: Record<StorePlatformTarget, StoreScreenshotVariant>;
  locks: StoreDocumentLock[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface StoreScreenshotPage {
  id: string;
  order: number;
  featureId: string | null;
  headline: string;
  subtitle: string | null;
  templateId: string;
  nodes: StoreScreenshotNode[];
}

type StoreScreenshotNode =
  | StoreTextNode
  | StoreImageNode
  | StoreDeviceNode
  | StoreShapeNode;

interface StoreScreenshotVariant {
  target: StorePlatformTarget;
  pageOverrides: Record<string, StorePageOverride>;
}
```

Nodes use normalized layout constraints. They do not expose Fabric's native
serialization as business data.

### 6.3 Platform specification

```ts
interface StorePlatformSpec {
  id: StorePlatformTarget;
  version: string;
  width: number;
  height: number;
  orientation: "portrait";
  outputFormat: "png";
  allowsAlpha: false;
  minPages: number;
  maxPages: number;
  recommendedPages: number;
  sourceUrl: string;
  checkedAt: string;
}
```

The UI, validator, renderer, and exporter read the same versioned
specification.

### 6.4 ChangeSet

```ts
interface StoreScreenshotChangeSet {
  documentId: string;
  baseVersion: number;
  operations: Array<{
    op: "add" | "remove" | "replace" | "move";
    path: string;
    from?: string;
    value?: unknown;
  }>;
  reason: string;
}
```

Application order:

```text
Schema validation
→ base-version check
→ lock check
→ business-rule validation
→ preview
→ user confirmation
→ immutable version snapshot
→ apply
```

## 7. AI Generation

AI generates a `ScreenshotPlan`, not pixels or arbitrary application code.

The generation context contains:

- Confirmed Product Profile fields.
- Active Design System tokens and guidance.
- Selected source assets.
- Selected platform targets.
- Available template manifests.
- Existing pages when regenerating.
- Locked fields and terms.

The plan contains:

- Page count and order.
- Feature-to-page mapping.
- Headline and optional subtitle.
- Template ID.
- Source asset references.
- Structured layout and variant hints.

Unknown features, unverified rankings, awards, prices, discounts, and absolute
claims are forbidden. Invalid structured output is retried within the existing
orchestrator policy and is never written directly to the project.

Manual template mode remains fully usable without an AI provider.

## 8. Editing and Rendering

### 8.1 Editing adapter

```text
StoreScreenshotDocument
↔ Store screenshot editor model
↔ Fabric adapter
↔ Focused interactive canvas
```

The adapter maps canonical nodes to Fabric objects and converts committed
interactions back into canonical operations.

### 8.2 Layout adaptation

The renderer:

1. Resolves the selected platform specification.
2. Loads the page and platform override.
3. Resolves Design System tokens and fonts.
4. Computes normalized constraints at the target size.
5. Fits text within configured line and minimum-font-size limits.
6. Resolves source assets and device framing.
7. Detects bounds and safe-area violations.
8. Produces a render model.
9. Renders an opaque bitmap.
10. Reopens the output to verify dimensions, format, and alpha state.

### 8.3 Background jobs

High-resolution render and ZIP packaging run outside the renderer UI.

Job states:

```text
pending → queued → running → completed
                       ├── failed
                       ├── cancelled
                       └── interrupted
```

Progress and page-level failures stream to the Studio through the existing SSE
event path. A failed page can be retried without recreating completed pages.

## 9. Persistence and Versioning

- Daemon-owned data derives from the resolved `OD_DATA_DIR` and follows the
  upstream data-root contract.
- SQLite stores project, document, version, asset-reference, job, export, and
  audit metadata.
- Canonical JSON documents and immutable version snapshots are stored beneath
  the daemon-managed project data.
- Original, processed, preview, and thumbnail assets remain separate.
- Exported PNG and ZIP files are reproducible outputs, not the source of truth.
- API keys remain in OS-backed secure storage through the existing provider
  configuration path.

Version operations record:

- User edit.
- AI ChangeSet.
- Template application.
- Asset replacement.
- Page reorder.
- Restore.

## 10. API and CLI Surface

### 10.1 HTTP

```text
POST   /api/projects/:projectId/store-screenshots
GET    /api/projects/:projectId/store-screenshots/:documentId
PATCH  /api/projects/:projectId/store-screenshots/:documentId
POST   /api/projects/:projectId/store-screenshots/:documentId/generate
POST   /api/projects/:projectId/store-screenshots/:documentId/change-sets/preview
POST   /api/projects/:projectId/store-screenshots/:documentId/change-sets/apply
POST   /api/projects/:projectId/store-screenshots/:documentId/validate
POST   /api/projects/:projectId/store-screenshots/:documentId/render
POST   /api/projects/:projectId/store-screenshots/:documentId/export
GET    /api/projects/:projectId/store-screenshots/:documentId/versions
POST   /api/projects/:projectId/store-screenshots/:documentId/versions/:version/restore
```

Long-running routes return a job reference and stream progress through existing
job events.

### 10.2 CLI

```text
od store-screenshot create
od store-screenshot show
od store-screenshot generate
od store-screenshot validate
od store-screenshot render
od store-screenshot export
od store-screenshot versions
od store-screenshot restore
```

All commands support `--json`. Commands that accept long prompts support
`--prompt-file <path|->`.

## 11. Validation and Error Handling

### 11.1 Upload validation

- Verify supported extension, MIME, and file signature.
- Decode images before acceptance.
- Reject corrupted or oversized assets with a user-facing reason.
- Sanitize SVG or HTML-based sources before any preview.

### 11.2 Blocking export errors

- Missing source asset.
- Font not loaded or unavailable.
- Text overflow after minimum-size fitting.
- Node outside the legal render bounds.
- Incorrect page count.
- Incorrect output dimensions or format.
- Alpha channel present.
- Unresolved document or platform-spec version.

### 11.3 Warnings

- Important content approaches a crop or visual safe area.
- Google Play text density is excessive.
- Copy may contain rankings, price promotions, awards, or unverifiable claims.
- Product UI is not visually prominent in the first pages.
- Pages repeat the same benefit.

Warnings require review but do not block export unless a deterministic platform
rule is violated.

### 11.4 Recovery

- AI parse or schema failures leave the current document unchanged.
- A stale ChangeSet fails with a version-conflict response.
- A failed page render is independently retryable.
- An interrupted job is marked as interrupted on restart.
- Completed render outputs are reused when their content hashes match.

## 12. Export Package

```text
Store Screenshots/
├── app-store/
│   └── iphone-6.9-portrait/
│       ├── 01-core-value.png
│       ├── 02-main-feature.png
│       └── ...
├── google-play/
│   └── phone-portrait/
│       ├── 01-core-value.png
│       ├── 02-main-feature.png
│       └── ...
└── manifest.json
```

The manifest includes:

- Document ID and version.
- Platform-spec ID and version.
- Page order and filenames.
- Width, height, format, and content hash.
- Source asset references.
- Validation result.
- Export timestamp.

## 13. Test Strategy

### 13.1 Unit tests

- Zod document and API schemas.
- Platform-spec parsing.
- Page-count and output-format rules.
- Normalized layout adaptation.
- Text fitting and overflow.
- ChangeSet application.
- Base-version conflicts.
- Document and term locks.
- Filename generation.
- Content-hash stability.

### 13.2 Contract tests

- Web and daemon use the same request, response, error, job, and SSE shapes.
- CLI and UI call the same HTTP endpoints.
- Stored documents survive schema round trips.
- Platform-spec and manifest types remain compatible.

### 13.3 Integration tests

- Create project and screenshot document.
- Upload and reference product screenshots.
- Generate a plan through a deterministic test provider.
- Apply a valid ChangeSet.
- Reject a locked-field ChangeSet.
- Validate, render, and export both platforms.
- Restore an immutable version.
- Recover an interrupted render job.

### 13.4 Visual regression

Use fixed fonts, assets, Design System tokens, and templates to compare:

- Every starter template at 1290 × 2796.
- Every starter template at 1080 × 1920.
- Long headline fitting.
- Missing-subtitle layout.
- Platform-specific overrides.
- Opaque output and exact dimensions.

Golden images are platform-specific to avoid false failures from font and
renderer differences.

### 13.5 End-to-end acceptance

```text
Create project
→ upload product screenshots
→ choose Design System
→ generate four-page set
→ edit one page
→ reorder pages
→ validate both platforms
→ export ZIP
→ verify manifest and PNG files
→ restart app
→ reopen the editable document
```

Required gates:

- `pnpm guard`
- Relevant package typecheck and tests.
- Web typecheck, tests, and build.
- Daemon typecheck, tests, and build.
- Desktop build.
- Targeted Playwright E2E.
- Local desktop startup and daemon health check.

## 14. Acceptance Criteria

1. The Store Screenshots entry and Studio experience visually and behaviorally
   match Open Design.
2. A user can create a project and upload real product screenshots.
3. At least three deterministic templates read the active Design System's
   colors, typography, and logo.
4. AI can generate at least four grounded pages, while manual mode works
   without a provider.
5. One canonical document produces App Store and Google Play portrait variants.
6. The user can edit headlines, colors, product screenshots, page order,
   element visibility, position, and scale.
7. Regenerating one page does not change another page.
8. Locked fields and terms cannot be overwritten by AI or template changes.
9. App Store files are exactly 1290 × 2796 PNG.
10. Google Play files are exactly 1080 × 1920 PNG.
11. Every exported image is opaque and ordered correctly.
12. The export contains the expected directory structure and manifest.
13. Restarting the application preserves projects, assets, canonical documents,
    versions, and recoverable job state.
14. HTTP, UI, and CLI surfaces expose the same capability and contract.
15. All required validation, build, visual-regression, and E2E gates pass.

## 15. Source References

- Launch Studio product requirements under `doc/`.
- Launch Studio technical proposal under `doc/`.
- Open Design root `AGENTS.md` and directory-level guidance.
- Apple App Store Connect screenshot specifications:
  `https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/`
- Google Play preview-asset requirements:
  `https://support.google.com/googleplay/android-developer/answer/9866151`

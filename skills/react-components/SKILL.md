---
name: react-components
description: |
  Converts Stitch designs into modular Vite and React components, or syncs/updates existing React components to align with the latest Stitch designs, using system-level networking and AST-based validation.
  (Vendored from the stitch-build plugin of google-labs-code/stitch-skills; original
  skill id `stitch::react-components`. Requires the Stitch MCP server to be configured — see
  https://github.com/google-labs-code/stitch-skills for setup.)
triggers:
  - "stitch to react"
  - "stitch react components"
  - "sync react components with stitch"
od:
  mode: utility
  category: figma
  upstream: "https://github.com/google-labs-code/stitch-skills"
---

# Stitch to React Components

You are a frontend engineer focused on transforming designs into clean React code or syncing/updating existing React components to align with the latest Stitch designs. You follow a modular approach and use automated tools to ensure code quality.

> **CRITICAL: Every step in this skill is MANDATORY. Do NOT skip any step or take shortcuts. Each section contains a GATE that must be satisfied before proceeding.**

## Phase 1: Retrieval and networking

> **GATE: Phase 1 is complete ONLY when all screens have been downloaded via `scripts/fetch-stitch.sh` AND visually audited. Reading local files directly without going through this phase is PROHIBITED.**

1. **Namespace discovery**: Run `list_tools` to find the Stitch MCP prefix. Use this prefix (e.g., `stitch:`) for all subsequent calls.
2. **Metadata fetch**: Call `[prefix]:get_screen` for **EVERY screen** in the project to retrieve the design JSON with download URLs. Do NOT skip any screen.
3. **Check for existing designs**: Before downloading, check if `.stitch/designs/{page}.html` and `.stitch/designs/{page}.png` already exist:
   - **If files exist**: Ask the user whether to refresh the designs from the Stitch project using the MCP, or reuse the existing local files. **You MUST ask — do not assume.**  Only re-download if the user confirms.
   - **If files do not exist**: Proceed to step 4.
4. **High-reliability download**: Internal AI fetch tools can fail on Google Cloud Storage domains. You MUST use the provided script.
   - **HTML**: `bash scripts/fetch-stitch.sh "[htmlCode.downloadUrl]" ".stitch/designs/{page}.html"`
   - **Screenshot**: Append `=w{width}` to the screenshot URL first, where `{width}` is the `width` value from the screen metadata (Google CDN serves low-res thumbnails by default). Then run: `bash scripts/fetch-stitch.sh "[screenshot.downloadUrl]=w{width}" ".stitch/designs/{page}.png"`
   - This script handles the necessary redirects and security handshakes.
5. **Visual audit**: Review the downloaded screenshot (`.stitch/designs/{page}.png`) to confirm design intent and layout details. **You MUST view each screenshot** — do not proceed based on assumptions about the design.
6. **Project metadata tracking**: Retrieve project configuration using `[prefix]:get_project` and save it to `.stitch/metadata.json` (inside the app folder, and mirrored in the workspace root). Ensure it has:
   - `projectId`, `title`, `deviceType`
   - A `Last Sync Time` field matching the current sync ISO execution time
   - A `screens` map detailing each screen's ID, label, sourceScreen reference, dimensions, and canvasPosition.

### Anti-patterns for Phase 1
- ❌ Reading `.stitch/designs/*.html` directly without calling MCP `get_screen` first.
- ❌ Skipping the `fetch-stitch.sh` download script.
- ❌ Not asking the user when existing files are found.
- ❌ Skipping the visual audit of `.png` screenshots.
- ❌ Failing to generate or update `.stitch/metadata.json` and its `Last Sync Time` field upon syncing.

## Phase 2: Style extraction

> **GATE: Phase 2 is complete ONLY when `resources/style-guide.json` has been updated with tokens extracted from the current project's HTML `<head>`. Tokens from a previous project are NOT acceptable.**

1. **Extract `tailwind.config`**: Open each downloaded HTML file and locate the `tailwind.config` object in the `<head>` `<script>` block. Extract:
   - All color tokens
   - Font families
   - Spacing values
   - Border radius values
   - Font size/typography tokens
2. **Sync `resources/style-guide.json`**: Overwrite the file with the extracted tokens from THIS project. The style guide MUST match the Stitch project being converted.
3. **Verify sync**: Confirm the primary color, font families, and spacing in the updated `style-guide.json` match what you extracted.

### Anti-patterns for Phase 2
- ❌ Using `style-guide.json` as-is without verifying it matches the current project.
- ❌ Using hardcoded hex values in components instead of theme-mapped classes.

## Phase 3: Architectural rules

> **GATE: Every component MUST satisfy ALL of the following rules. Violations will cause `npm run validate` to fail.**

* **Modular components**: Break the design into independent files. **Each reusable UI pattern** (cards, badges, pagination, search bars) MUST be extracted into its own component in `src/components/`. Monolithic page files that contain everything are PROHIBITED.
* **Logic isolation**: Move event handlers and business logic into custom hooks in `src/hooks/`. Examples: pagination logic → `usePagination`, filtering → `useFilter`.
* **Data decoupling**: Move ALL static text, image URLs, and lists into `src/data/mockData.ts`. No hardcoded content in components.
* **Type safety**: EVERY component file (including pages) MUST include a `Readonly` TypeScript interface named `[ComponentName]Props`. The validator checks for this — files without a Props interface will FAIL validation.
* **Project specific**: Focus on the target project's needs and constraints. Leave Google license headers out of the generated React components.
* **Navigation wiring**: Stitch screens are standalone pages with `href="#"` placeholder links. When building a multi-page React app:
    * Replace ALL `href="#"` anchors with React Router `<Link>` components pointing to the correct routes.
    * **Always make the app logo/title in the TopAppBar a `<Link to="/">`** so users can navigate home from any page. This is critical because Stitch bottom nav bars use `md:hidden` and are invisible on desktop — without a clickable logo, desktop users have no way to return to the home page.
    * Wire the bottom nav items and sidebar nav items to their corresponding routes using `<Link>` with active-state highlighting based on `useLocation()`.
* **Style mapping**: Use theme-mapped Tailwind classes from the synced `style-guide.json`. No arbitrary hex codes.
* **Dark mode**: Apply `dark:` variants to ALL color classes throughout every component.

### Anti-patterns for Phase 3
- ❌ Putting all UI in a single monolithic page file.
- ❌ Inline event handlers or business logic without hooks.
- ❌ Hardcoding text, URLs, or data in component files.
- ❌ Components without a `[Name]Props` interface.
- ❌ Using hex color values instead of theme tokens.
- ❌ Leaving `href="#"` links unconverted.

## Phase 4: Execution steps

> **GATE: Phase 4 verification, audits, and validation checks are optional. You MUST ask the user's permission to proceed with validation scripts, running local dev servers, or automated browser testing.**

1. **Environment setup**: If `node_modules` is missing, run `npm install` to enable the validation tools.
2. **Data layer**: Create `src/data/mockData.ts` based on the design content.
3. **Component drafting**: Use `resources/component-template.tsx` as a base. Find and replace ALL instances of `StitchComponent` with the actual name of the component you are creating.
4. **Application wiring**: Update the project entry point (like `App.tsx`) to render the new components.
5. **Quality check (Optional - Ask User first)**:
    * Run `npm run validate <file_path>` for **EVERY** `.tsx` file in `src/components/` and `src/pages/` to report component validity.
    * Run `tsc --noEmit` to verify TypeScript compile status.
    * Check output against `resources/architecture-checklist.md`.
    * Obtain permission before starting the dev server with `npm run dev` or initiating visual browser audits to verify the live result.

### Anti-patterns for Phase 4
- ❌ Commencing dev server start or browser audits without user consent.
- ❌ Declaring task "done" without verifying code compiles.

## Troubleshooting
* **Fetch errors**: Ensure the URL is quoted in the bash command to prevent shell errors.
* **Validation errors**: Review the AST report and fix any missing interfaces or hardcoded styles. The most common failure is a missing `Props` interface — every component (including pages) needs one.
* **Dead navigation links**: Stitch HTML uses `href="#"` placeholders everywhere. Every `<a href="#">` must be converted to a `<Link to="/route">` with a real route. Verify all nav items are clickable and lead to the correct page.
* **Stale style-guide.json**: If colors or fonts look wrong, the `style-guide.json` likely has tokens from a different project. Re-extract from the current HTML `<head>`.
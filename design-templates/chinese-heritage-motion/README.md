# chinese-heritage-motion

A deterministic design template for museum-grade, motion-first Chinese heritage
websites. It borrows the **template architecture** of `open-design-landing`
(typed content → fixed visual system → composer → generated HTML), but replaces
its marketing-page grammar with eight cultural scene presets and a scene-aware
asset model.

## 30-second tour

```bash
# Build the example with the three bundled generated image masters.
npm run build

# Open example.html in a browser.
```

No framework and no package install are required for the placeholder/build path;
the scripts use Node built-ins only.

## Architecture

```text
inputs.example.json
      │
      ├──── scene-presets.json
      ├──── assets/asset-manifest.json
      ├──── styles.css
      └──── motion-runtime.ts
                 │
                 ▼
          scripts/compose.ts
                 │
                 ▼
             example.html
```

## Why this differs from the earlier SKILL

- The visual system is fixed instead of re-invented per run.
- Anonymous A/B/C/D motion modes are replaced by eight named scene presets.
- Same-camera spatial layers derive from one master scene instead of being
  independently generated.
- Responsive art direction and transition intensity are first-class data.
- Visual QA is separate from engineering QA.
- `example.html` is generated and should never become a second source of truth.

## Image strategies

| Strategy | Purpose |
|---|---|
| `placeholder` | composition/motion validation with zero image budget |
| `generate` | create scene masters and independent plates |
| `documentary` | use explicit source/licensing metadata for real photography |
| `bring-your-own` | map supplied assets to manifest slot ids |

`imagegen.ts` defaults to dry-run JSON prompt output. To call the configured
OpenDesign image interface and build from its returned local assets:

```bash
node scripts/imagegen.ts inputs.example.json --execute --model <configured-model> --project <project-id> --files-dir <local-project-files>
node scripts/compose.ts inputs.generated.json out/index.html
```

Requires Node 24 and an available `od` CLI (or injected `OD_BIN` / `OD_NODE_BIN`).
Generation inherits daemon credentials and run policy. Use `--slot <asset-id>`
for a trial. Async jobs are polled, successful outputs checkpointed, pending
jobs retained for manual resumption rather than automatically resubmitted.
The baked example now uses three individually generated images in
`assets/generated/`, mapped through `imagery.provided_assets`. Repeated camera
views reuse these masters. Generated media is labeled as visual interpretation,
never documentary evidence. Clear the provided-asset mapping when requesting new
images through the CLI adapter; existing supplied files are deliberately reused.

Source plates drive full-screen camera movement, upward crop, portal push, and
a horizontal material strip. An asymmetric atlas changes the reading rhythm;
a pointer/keyboard wipe compares overview and detail. Authored SVG registration
lines reveal in the preservation chapter. True exploded construction
requires verified segmented assets and is not claimed by this starter.
See [reference direction](references/motion-direction.md).

Exports copy each unique source image once into the output assets folder, reusing
its URL across all mapped slots. Missing
files fail the build; supplied paths resolve relative to the input JSON.

## Editing rule

Edit source files, then rebuild:

```text
DESIGN.md / styles.css / motion-runtime.ts / scene-presets.json
                         +
                  inputs.json
                         ↓
                      build
                         ↓
                   index.html
```

Never patch the generated `example.html` as the primary implementation.

## Validation

```bash
node --test tests/pipeline.test.ts
```

The adapter test uses a mock CLI. The bundled example masters were generated
separately with the imagegen interface and visually inspected; their provenance
is recorded in `assets/generated/README.md`. See `qa/VISUAL_QA.md` for current
verification and the reference analysis for fidelity limits.

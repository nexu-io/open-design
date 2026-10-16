# Visual QA

Review screenshots at 1440×900, 1920×1080, and 390×844.

## Composition
- [ ] One clear focal point per chapter.
- [ ] No three adjacent chapters share the same text/image anchor.
- [ ] No more than two centered-title chapters.
- [ ] Crops feel intentional; monument is not repeatedly shown as a centered full object.
- [ ] Dense chapters are separated by breathing space.

## Typography
- [ ] Chinese body copy remains readable at mobile width.
- [ ] Metadata does not compete with display type.
- [ ] English/Chinese pairing feels compositional, not duplicated mechanically.

## Imagery
- [ ] Same-camera layers visibly belong to one scene.
- [ ] Documentary/generated media share finishing characteristics.
- [ ] No synthetic text baked into images.
- [ ] Technical lines are SVG/DOM, not hallucinated image text.

## Motion
- [ ] Motion explains scale/structure/material/space/time.
- [ ] Adjacent chapters do not repeat the same dominant motion.
- [ ] High-intensity transitions are not consecutive.
- [ ] Reduced-motion shows a complete static composition, not a frozen intermediate frame.

## Responsive
- [ ] Mobile crop preserves the architectural subject.
- [ ] No essential copy is hidden for visual convenience.
- [ ] No horizontal overflow at 390px.

## Anti-template check
- [ ] No SaaS feature grid, KPI strip, glass cards, neon gradient, fake calligraphy, or random gold.
- [ ] The site could not plausibly be relabeled as a generic luxury/SaaS site without redesign.

## Pipeline verification
- [ ] Export into an empty directory and open it: every referenced image exists.
- [ ] Generate a single slot through a configured model, then inspect the returned image.
- [ ] Build with returned filenames (including non-WebP formats); no placeholder is silently substituted.
- [ ] Scroll time and structure forward and backward; compare start/middle/end states.
- [ ] Mobile chapter links remain visible and work with keyboard focus.

## Cinematic redesign verification — 2026-09-22

- Node regression suite: 3/3 pass (portable export and missing asset rejection;
  queued media/checkpoint reuse; reduced-motion navigation and RAF settling).
- Inspected rendered reference pages and multiple scroll states; observed
  proportions and implementation limits are in `references/motion-direction.md`.
- Generated and inspected three individual 1536×1024 masters. The baked example
  uses generated imagery rather than SVG placeholders, with disclosure labels.
- Desktop 1280×720 and mobile 390×844: no horizontal document overflow. Checked
  opening composition, chapter menu, atlas, and interior scene. Viewport override
  restored after mobile checks.
- Chapter menu opens and links navigate/close it. Comparison keyboard input changes
  the split and output (50 → 51). Direct pointer drag updates them together (71%).
- Fallback export: all three cinematic stages become 720px ordinary-flow sections;
  no sticky holds, horizontal material strip has `overflow-x: auto`, comparison
  remains operable. Reduced-motion preference is also covered by the runtime test.
- Browser error log: empty during these checks. No broken loaded images observed.
- Root guard remains blocked by pre-existing files outside this template:
  residual JS render scripts, missing `apps/landing-page/package.json`, and tools
  directory-layout violations. Template craft references pass.

Not claimed: pixel-identical reference recreation, real 3D reconstruction, verified
architectural photography, or a full device/browser matrix. New imagery should be
checked again if a different subject or documentary source is supplied.

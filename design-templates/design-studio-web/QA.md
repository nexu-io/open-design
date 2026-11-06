# Template repair report

Reference: [upstream template contract](https://github.com/nexu-io/open-design/blob/main/design-templates/AGENTS.md).

## Findings and repairs

| Issue | Repair |
|---|---|
| No-script page hid the headline, sections and navigation behind a permanent loader | Progressive enhancement: static content, navigation and project grid remain visible until runtime starts |
| Navigation disappeared at 761–1080px | Align menu visibility and expanded layout at 1080px; add Escape, focus handling and `aria-controls` |
| Rail stopped updating after resizing from mobile to desktop | Evaluate media-query state on every update and clear stale transforms |
| Keyboard focus could scroll the clipped rail independently of its transform | Use a non-scrolling clip and map focused project position to vertical rail travel |
| Reduced-motion mobile view inherited a two-column grid | Restore a single column and immediately expose hero text |
| Zero motion intensity became one through `|| 1` | Use nullish defaulting and apply intensity to shader time, pointer and velocity |
| Two WebGL loops updated shared velocity twice | Share one field animation clock and skip drawing off-screen/hidden canvases |
| Shader used reversed `smoothstep` bounds | Use defined ascending bounds and invert the result |
| English character spans allowed splitting inside words | Group Latin words while retaining real inter-word spaces |
| Quick-start output had no corresponding asset directory | Document asset preparation in the output directory and Node 24 baseline |
| Image-generation errors exited successfully; dry-run created directories | Return failure for failed slots, reject unknown slots, create directories only for actual generation |
| Demo links jumped to the top and fictional evidence lacked a disclosure | Route project inquiries to contact, omit empty social links and label fictional demo content |

## Validation

- Reproduced the old no-script/tablet failure: menu and links `display:none`, hero opacity `0`, loader `display:grid`.
- Headless Chrome: Chinese desktop 1440px, tablet 900px, mobile 360px, reduced-motion mobile, no-script tablet and English desktop. No page errors or document horizontal overflow; all five images resolved.
- Checked tablet menu/Escape, resizing from mobile to desktop, keyboard focus on the last project, and shader preset values.
- Simulated unavailable WebGL: CSS fallback remains, four projects are present, mobile stays one column, no page errors.
- Template TypeScript check and generated inline JavaScript syntax checks passed.
- Image generator dry-run produced no output directory; a mocked HTTP 503 produced exit code 1 without making a network request.
- Repository `pnpm typecheck` passed using Node 24.16.0.
- Repository `pnpm guard` remains blocked by existing workspace issues outside this template: residual JS screenshot scripts, a missing `apps/landing-page/package.json` referenced by the guard, and unexpected entries under `tools/`.

## Delivery boundaries

`example.html` is rebuilt from `inputs.zh.example.json`; `examples/form-shift.html` is rebuilt from its English inputs. `styles.css` and `scripts/compose.ts` remain the sources of truth. The older `examples/aether-studio.html` reference is unchanged and is not covered by these checks.

Images remain SVG placeholders. Optional Google Fonts fall back to local fonts (browser checks deliberately blocked the font stylesheet). Input types are compile-time contracts, not a runtime JSON validator. Actual paid image generation was not exercised.

## Ripple / particle enhancement

- Reworked the shared hero/lab shader using the Aether reference's blue filaments, cyan caustics, luminous particle depth and electronic grain.
- Added warped concentric contours and two analytic particle scales within the existing WebGL pass. No extra rendering loop or image assets are required.
- Kept a directional text veil and a CSS ripple fallback; mobile rendering is capped at pixel ratio 1.
- Chrome checks passed at 1440px, 900px and 360px, including no-script and reduced-motion layouts. Shader compilation succeeded; two reduced-motion canvas screenshots remained pixel-identical after pointer movement; changing the lab preset changed the canvas pixels; mobile canvas width matched its 360px CSS width.
- Rebuilt both the Chinese canonical example and the English Form/Shift example from the updated composer and stylesheet.


## Canonical preview replaced with the Aether layout

This supersedes the earlier canonical-preview generation notes: `example.html`
is now based directly on `examples/aether-studio.html`, with FORM/SHIFT identity,
brand narrative, five explicitly fictional concept projects, corresponding
project dialogs, capabilities and contact copy. The original reference remains
unchanged. Its fluid and GPU particle runtime are retained; only content-fitting
typography and mobile navigation rules are appended to the reference CSS.

The canonical file is maintained directly, not regenerated by `compose.ts`.
Desktop 1440px and mobile 390px browser checks covered five cards, Enter to open
project details, Escape to close, correct identity and absence of page errors or
document horizontal overflow. This revision does not claim the earlier
composer-specific no-script and shader tests apply to the Aether runtime.

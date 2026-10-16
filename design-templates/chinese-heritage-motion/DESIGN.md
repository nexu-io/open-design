# 木构观记 · Cinematic field journal

## Reference structure

Read [motion-direction.md](references/motion-direction.md) for observed layouts and
what is implemented. This design adapts Pear's persistent registration frame and
full-viewport imagery, and Shopify Winter 2026's image-overlaid contents and
large visual chapters. It is a heritage adaptation, not a pixel-identical replica
of either reference and not a reproduction of their 3D scenes.

The full-bleed scene is the page's structure. Do not put the opening photograph
inside a bordered card or return to eight alternating text/image splits.

## Composition contract

1. **Encounter:** one full-viewport exterior, large left-hand type, compact contents
   over the right-hand image, lower horizontal rule and caption band. Keep the
   architecture on the right and negative space on the left when generating.
2. **Verticality:** reuse the exterior master for a continuous upward crop. Upright
   Chinese type and fine eave lines establish a second viewing direction.
3. **Structure:** paper interlude; a 12-column atlas has an 8-column wide image,
   a 4-column narrow crop offset down by 160px, and a small editorial note below.
4. **Detail:** a wide image and magnified crop exceed the viewport; native scroll
   translates the strip on desktop, direct horizontal scrolling works on mobile.
5. **Interior:** a separate dark interior master fills the viewport. Move toward
   the light aperture while the title recedes. Do not imply an exact 3D model.
6. **Time:** compare overview with detail using a draggable wipe. Both views use
   the same master in the baked example; they are not historical before/after.
7. **Preservation:** quiet observation plate and expandable field notes. SVG
   registration lines trace in; they are graphic guides, not measured data.
8. **Afterimage:** full-bleed return to the exterior, restrained copy, oversized
   cropped colophon and a functional return-to-start link.

Scene labels may change; retain distinct compositions and alternate cinematic
holds with ordinary document flow. Avoid three consecutive identical layouts.

## Grid and typography

Desktop has a fixed 65px header and 64px left rail. Fine vertical rules continue
through the entire page. Content starts at rail + 7vw; the opposite rule is 7vw
from the right edge. Header and active chapter remain accessible during scroll.

Use local font stacks, with no remote font dependency:

- Chinese display: Songti SC / Noto Serif CJK SC / STSong / SimSun.
- Body and functional labels: PingFang SC / Microsoft YaHei / sans-serif.
- English: Baskerville / Palatino Linotype / Georgia.

Desktop hero title is 7.5vw (62–120px); ordinary display type is 40–86px.
English subtitles are secondary. Body copy has generous line height but stays
short. Metadata uses small sans-serif lettering, never giant decorative badges.
No faux calligraphy, random gold, pill navigation, glass cards, KPI strips, or
uniform three-column feature grids.

## Color

| Role | Value | Use |
|---|---|---|
| Warm paper | `#eeeadd` | Atlas, notes, sources, menu |
| Ink | `#282c27` | Text on paper |
| Dark blue-green | `#172927` | Header, exterior stage, footer |
| Oxide | `#8c3f31` | Focus/interaction accents |
| Timber brown | `#472c22` | Material chapter |
| Mineral grey-green | `#d8daca` | Comparison chapter |
| Warm white | `#f8f1df` | Type over dark imagery |

Images supply most of the color. Do not flatten them into monochrome decorative
backgrounds. Overlays exist only to support readable type.

## Imagery and factual boundaries

The baked example includes three individually generated 1536×1024 PNG masters:
`assets/generated/pagoda.png`, `timber.png`, and `interior.png`.
They are artistic interpretations, not documentary photographs of Yingxian.
The external form and interior must not be used as technical evidence.

The exterior is reused for encounter, verticality, preservation, and afterimage.
The timber image is reused for structure, detail, and overview/detail comparison.
CSS crops are views of those masters, not independently generated spatial layers.
A new subject should receive its own suitable images; do not relabel these assets.

Generate each independent master separately. Never generate a contact sheet and
call its cells independently authored plates. Never claim a new camera view is
a depth layer of an existing master. Documentary images need verified credits.
Placeholder SVGs are for layout QA only and cannot be the finished visual result.

## Motion and accessibility

Native scrolling drives three sticky stages. Each stage occupies 190svh on desktop
and 135svh on mobile. Transform interpolation is delta-time based; the animation
loop stops after settling. The template does not intercept wheel or touch scroll.

Each chapter has a dominant idea: push, rise, atlas reveal, lateral material
reading, portal push, manual comparison, line trace, then rest. Avoid generic dust,
constant orbit, or making every element float. The comparison also has a labeled
range input and numeric output. The chapter menu is a native modal dialog with
Escape, focus containment, close control, and meaningful links.

Reduced motion and fallback tier remove pinned scroll holds and camera movement.
All copy remains visible, the comparison stays operable, and material strips can
be scrolled manually. Mobile removes the overlay directory but retains all chapter
links in the header menu; it does not hide chapter content.

## Source of truth

Edit `styles.css`, `motion-runtime.ts`, `scripts/compose.ts`, `scene-presets.json`,
and inputs. Then rebuild `example.html`. Update this contract and SKILL.md when
composition changes so future generations cannot regress to the old split layout.

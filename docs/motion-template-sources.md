# Motion templates: sources and maintenance

Five official HTML examples populate the Motion design Home entry and Community
category. Each one is a remake of a viral motion post, rebuilt in code so the
template preview shows that post's look. They use the existing plugin preview,
example binding, frozen reference package, Remix, and HyperFrames MP4 export
paths.

## Selection

The templates come from
[awesome-opus-5.5-video](https://github.com/zhuyansen/awesome-opus-5.5-video)
(1,483 cases, `updated_at` `2026-10-11T05:17:47.827Z`; view counts checked
`2026-10-05`) and one Douyin post, confirmed with the product lead: two of the
most-viewed motion posts with like and save rates above 1%, one product promo,
one illustrated explainer, and the Douyin tech reel. The library's top-10%
view threshold is 255,312.

| Template | Original post | Views | Likes | Saves | Rank (all / category) |
| --- | --- | ---: | ---: | ---: | --- |
| Motion Designer Showreel | [@stephanlivera](https://x.com/stephanlivera/status/2103315922098470926) | 2,246,353 | 17,030 | 13,027 | 9 / 1 Motion |
| One-Shape UI Motion | [@twoclipping](https://x.com/twoclipping/status/2103273003555402193) | 1,034,374 | 12,100 | 20,060 | 28 / 7 Motion |
| Product Promo | [@achxvi](https://x.com/achxvi/status/2103918792845963545) | 1,124,063 | 9,015 | 8,065 | 22 / 5 Motion |
| Bring Ideas to Life | [@kevin_t_ngo](https://x.com/kevin_t_ngo/status/2102437977435893771) | 651,184 | 6,104 | 2,944 | 51 / 7 Stories |
| The Future Is Already Here | [Douyin](https://www.douyin.com/video/7690393045783346918) | — | 6,439 | 2,164 | — |

Douyin does not publish play counts; its figures were read on 2026-10-12.
Home and Community lead with Bring Ideas to Life (让灵感成真), followed by
The Future Is Already Here, Motion Designer Showreel, One-Shape UI Motion,
and Product Promo. The plugin ID stays `example-motion-visual-lesson` so existing
projects and links keep working.

## Template content

Each `example.html` uses its original as the reference for layout, palette,
type and motion. Story adaptations have their own timing; visual fidelity still
requires playback review. On-screen copy is English. Claude branding in
the originals is replaced by Open Design: the showreel signs as OPEN DESIGN with
the Open Design mark, and the Bring Ideas to Life character is the Open Design buddy
built from the logo mark. The product promo's real brand is replaced by the
fictional Pennyflow. Every soundtrack is original.

| Template | Length | Differences from the original |
| --- | --- | --- |
| Motion Designer Showreel | 15 s | Signs as OPEN DESIGN with its mark in the Open Design palette; fonts are the closest open equivalents |
| One-Shape UI Motion | 14 s | 1440×1440 square kept at scale on a 1920×1080 stage |
| Product Promo | 15 s | Fictional brand Pennyflow; the mascot is a girl instead of the original's boy; product art is simplified isometric halftone |
| Bring Ideas to Life | 20 s | Rewrites the 28 s square paper story for Open Design in 16:9: “what can you design?” → interactive prototypes, websites, PPT, posters and motion → a book of possibilities → “It starts with your idea.” The girl hugs the book, waves thanks and pins “What will you design?” beside the window, inviting the viewer. Keeps the reference's reaction and pinned-note gestures, painted paper edges, articulated cutout limbs, folds and page turns |
| The Future Is Already Here | 20 s | 20 s highlight cut of the 62 s original, in English |

The "Use" prompt is the creator's published prompt where one exists (showreel
and UI motion; the UI motion prompt is condensed to its visual brief). The other
three originals publish no prompt, so their prompts describe the template film,
including the Open Design capability story used by Bring Ideas to Life.

## 让灵感成真 / Bring Ideas to Life: design requirements

The flagship revision keeps the 20-second paper story, its five demonstrated
capabilities, the bundled score without speech, and the hug, wave and pinned-note
ending. The following timing and action requirements guide the revision; they
are not playback acceptance. Verify the exported MP4 and the client preview
against them before accepting the result.

The OpenDesign buddy must have short, rounded paper mittens. Move or tilt the
body closer to tap a prototype or press poster tape, and hold the book against
its body. Keep the hand in contact with the prop; do not stretch thin arms
across the scene. Capability labels must remain clear of the character during
entrances as well as during their final holds.

The collecting book starts with empty page slots. Each work travels into its
own slot in sequence; show that slot's thumbnail only once the work has landed,
then close the cover after all five arrive. Preserve a visible fold into the
reply and a continuous return flight. The girl catches the book at her chest
with both hands, keeping her face and reaction visible, then opens it.

The final audience invitation uses a larger lined note that remains legible in
the gallery preview. The girl's hand stays on it while she raises and pins it,
then releases it before she brings her hands together. Hold the full question
“What will you design?” with “you” circled; retain the physical note beside the
window.

| Time | Required action |
| --- | --- |
| 0–1 s | Establish the night town and the girl at her window |
| 1–1.5 s | The girl gets an idea and raises her pencil |
| 1.5–3.5 s | Write “OpenDesign, what can you design?” and hold the complete question |
| 3.5–4.25 s | Fold the corners and wings of the paper plane |
| 4.25–4.75 s | Throw the plane from the window |
| 4.75–5.5 s | Fly across the night sky and reach the buddy |
| 5.5–7 s | The buddy reads, thinks and responds with a spark |
| 7–8.5 s | Tap the interactive prototype, change its page and hold the result |
| 8.5–9.5 s | Unfold the website's hero and content blocks |
| 9.5–11 s | Turn the PPT cover, raise the chart bars in sequence and let them settle |
| 11–12 s | Overlap illustrated posters and tape one into place |
| 12–13 s | Animate the plane across a filmstrip while its timeline advances |
| 13–14.1 s | Land the five works in their own empty page slots one by one, then close the book |
| 14.1–14.8 s | Fold the closed book into the reply and send it back through the sky |
| 14.8–15.6 s | Catch the book at the girl's chest with both hands, keep her face visible, then open it |
| 15.6–17 s | Show all five works with “It starts with your idea.” and the hand-drawn circle |
| 17–17.75 s | The girl hugs the book with a closed-eye smile |
| 17.75–18.5 s | She holds the book and waves to the buddy across the town |
| 18.5–20 s | Raise and pin the larger invitation note, bring her hands together and hold “What will you design?” |

## Fonts

All fonts are SIL Open Font License families from the
[Google Fonts repository](https://github.com/google/fonts), subset to the glyphs
the template draws and bundled with their license files: Archivo, Instrument
Serif, JetBrains Mono, Geist, Unbounded, Inter, Fraunces and Short Stack.
Plugin previews allow same-origin fonts and map relative `url()` references in
inline styles to the plugin asset route, so the gallery, covers and Remix render
the bundled fonts.

## Gallery publication

`open-design.json` points to `example.html`; source and referenced assets ship
with the official plugin. Each template also bundles `assets/cover.jpg`, declared
as `od.preview.poster`, so a fresh branch checkout has a Home and Community
cover before CDN previews are published. Cards prefer published baked previews
when present, then this bundled still; detail previews retain the live HTML.
Refresh the bundled cover from the baker's poster when changing the film's look.
The existing pre-merge preview workflow validates
rendering. After merge, `bake-plugin-previews.yml` uploads content-addressed
posters and clips to R2 and opens the rolling preview-manifest PR. Each
template signals preview-ready within the baker's 15-second budget. Verify the
release's five preview entries and remote resources before release acceptance.

## Local dependencies and export

GSAP 3.12.5 and Three.js 0.160.0 are vendored; no runtime script CDN is used.
Every SKILL names each asset so the frozen-package scanner carries it.
Three.js exceeds the 256 KiB side-file limit: the gallery and Remix use
`assets/three.min.js`, and the frozen reference carries an identical gzip copy
with decompression instructions in the SKILL. When changing the vendored file:

```sh
gzip -n -9 -c plugins/_official/examples/motion-future/assets/three.min.js > plugins/_official/examples/motion-future/assets/three.min.js.gz
```

`motion-future` keeps its scenes inline in `example.html`, with the copy in one
`CFG` block. `assets/three-addons.js` carries the readable three.js examples it
needs (RoomEnvironment, FontLoader, TextGeometry; MIT), and
`assets/unbounded-black-glyphs.js` holds Unbounded Black outlines for the 3D
type, so the hero word can be any Latin text.

The package regression checks that referenced scripts, fonts, licenses and the
soundtrack restore byte-for-byte. The browser regression seeks each film with
callbacks suppressed, forward and backward, and requires identical canvas
output at each timestamp, including hidden layers.

## Audio

Every template carries an original procedural soundtrack in
`assets/soundtrack.mp3`, timed to its beats. No audio from the original posts is
used and no audio-generation model was involved. HTML preview sound starts with
the film; when the browser blocks autoplay, the first click or key press turns
it on, and Sound off mutes it. Sound follows the master timeline. The desktop
export path mixes the timed local audio into the MP4 with FFmpeg and fades each
track out where it stops, so a remake made shorter than its music ends cleanly.
Make-same keeps the template's soundtrack by default, because the music is part
of the look being remade. A brief that asks for no music removes it, and an
audio file the user supplies replaces it. Any other music request keeps the
score, because Open Design cannot generate music yet. A film longer than its
music is silent after the music ends. When a music request cannot be met, the
reply says so in one short sentence.

The product promo uses music only: the girl's synthetic speech effect is
removed, and the percussion is reduced to a sparse pulse without hi-hats,
claps or off-beat fills. The Bring Ideas to Life story adaptation keeps its existing
music and adds no voice track.

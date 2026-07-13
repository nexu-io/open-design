# Shared device frames

Reusable, pixel-accurate device chrome that any skill can compose into a
multi-device or multi-screen layout. Each frame is a self-contained HTML
snippet that renders a device shell and embeds its inner screen via an
\`<iframe src="?screen=...">\` query parameter.

## Why these exist

The mobile-app skill has a one-screen iPhone frame baked into its seed
template. That covers ~80% of mobile prototypes. These shared frames cover
the remaining 20%:

- **Multi-screen flows** — three iPhones side by side showing onboarding 1
  / 2 / 3.
- **Multi-device sets** — desktop + tablet + phone of the same product.
- **Future skills** — \`watch-app\`, \`tablet-app\`, \`tv-app\` can reuse
  these without re-inventing the chrome.

## Files

\`\`\`
assets/frames/
├── README.md                ← you're reading this
├── iphone-15-pro.html       ← 390×844 + Dynamic Island
├── android-pixel.html       ← 412×900 + punch-hole camera
├── ipad-pro.html            ← 1024×1366 + USB-C edge
├── macbook.html             ← 1440×900 inside laptop chrome
└── browser-chrome.html      ← Safari/Chrome window with traffic lights
\`\`\`

## Usage

Each frame accepts a \`?screen=<path>\` query parameter and renders that
path inside its inner viewport:

\`\`\`html
<iframe
  src="../../assets/frames/iphone-15-pro.html?screen=screens/home.html"
  width="390"
  height="844"
  loading="lazy"
></iframe>
\`\`\`

In an OD-managed project, the recommended pattern is:

\`\`\`
my-project/
├── index.html               ← gallery view: composes 3+ frames in a row
├── screens/
│   ├── home.html            ← inner content rendered inside iphone-15-pro.html
│   ├── search.html
│   └── detail.html
└── (no copy of frames — point at the shared assets folder)
\`\`\`

## Design tokens

Each frame reads its inner screen's tokens via \`postMessage\` if you want
the bezel to tint with the active palette. The default state is "phone in
hand" — neutral metallic — which works against any background.

## Authoring rules

When extending this library:

1. **No external assets.** Inline all SVG. No font imports. No image URLs.
2. **One frame per file.** Don't bundle iPhone + Android in one HTML.
3. **\`?screen=\` query is the only contract.** Don't introduce other
   query params; the harness has to be predictable for skills to use.
4. **The frame is decorative chrome only.** All content lives in the inner
   screen file. The frame must work with `?screen=about:blank` (showing
   just the device shell).
5. **Match real device dimensions.** iPhone 15 Pro is 390×844 logical
   pixels. iPad Pro 11" is 834×1194. Don't ship a "looks like" frame —
   the seed has to match.

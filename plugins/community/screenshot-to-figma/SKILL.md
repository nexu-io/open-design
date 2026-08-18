---
name: screenshot-to-figma
description: Convert UI screenshots into .fig design files through vision analysis and structured layout reconstruction.
od:
  mode: design-system
  scenario: screenshot-convert
---

# Screenshot → Figma (.fig)

When the user drops a UI screenshot and asks for a `.fig` file, your job is to (1) visually analyse the screenshot, (2) produce a structured layout description, then (3) convert to `.fig`.

## Step 1 — Analyse the screenshot

Look at the image and identify every visible UI element. For each element, record:

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `frame`, `text`, `rectangle`, `ellipse`, `line` |
| `name` | string | Human-readable label (e.g. "Header", "CTA Button") |
| `x` | number | Left edge in px (relative to the canvas origin) |
| `y` | number | Top edge in px |
| `width` | number | Element width in px |
| `height` | number | Element height in px |
| `fill` | string | CSS colour (`#rrggbb`). Pick the dominant visible colour. |
| `cornerRadius` | number | Border radius in px (0 = sharp). Round buttons → ~8-50. Cards → ~8-24. |
| `opacity` | number | 0.0–1.0 (default 1.0) |
| `text` | string | Visible text content. Only for `text` elements. |
| `fontSize` | number | Estimated font size in px |
| `fontWeight` | number | Estimated weight (400 = regular, 600 = semibold, 700 = bold) |
| `fontFamily` | string | Best guess at the typeface |
| `strokeColor` | string | Outline colour (`#rrggbb`). Omit if no visible stroke. |
| `strokeWeight` | number | Stroke width in px. Omit if no visible stroke. |
| `children` | array | Nested child elements (use for groups, cards, nav bars) |

Precision note: measure pixel coordinates to the best of your ability from the image. Approximate if uncertain — this is a wireframe, not a 1:1 export.

## Step 2 — Output structured JSON

Emit the analysis as a JSON array wrapped in a code block:

```json
[
  {
    "type": "frame",
    "name": "Page",
    "x": 0, "y": 0,
    "width": 1440, "height": 900,
    "fill": "#f5f5f7",
    "children": [
      {
        "type": "text",
        "name": "Headline",
        "x": 80, "y": 60,
        "width": 600, "height": 64,
        "text": "Build faster",
        "fontSize": 48,
        "fontWeight": 700,
        "fontFamily": "Inter",
        "fill": "#1a1a1a"
      },
      {
        "type": "rectangle",
        "name": "CTA Button",
        "x": 80, "y": 160,
        "width": 200, "height": 48,
        "fill": "#2563eb",
        "cornerRadius": 24
      }
    ]
  }
]
```

Rules:
- The root MUST be a `frame` representing the entire screen/canvas.
- Every element MUST have `x`, `y`, `width`, `height`.
- Only `text` elements should have `text`, `fontSize`, `fontWeight`, `fontFamily`.
- Nest elements inside their parent container with `children`.
- Output ONLY the JSON block inside triple backticks — no prose after the analysis notes.

## Step 3 — Convert JSON to .fig

Run the conversion tool:

```bash
node tools/figma-render/dist/json-to-fig.js --output /path/to/output.fig << 'JSONEOF'
[ ... your JSON here ... ]
JSONEOF
```

Or write the JSON to a temp file first:

```bash
echo '<json>' > /tmp/layout.json
node tools/figma-render/dist/json-to-fig.js -i /tmp/layout.json -o /path/to/output.fig
```

The tool uses `openfig-core` to create a valid `.fig` file that can be opened in Figma (File → Open).

## Notes

- The output `.fig` uses absolute positioning (not auto-layout). Every element gets exact `x, y, width, height`.
- Font names like "Inter" will render correctly in Figma if the font is installed; otherwise they fall back to the system default.
- The conversion is lossy — Figma can't perfectly reconstruct a screenshot. Colours, positions, and geometry will be close, not pixel-exact.

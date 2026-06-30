# Style 7: OpenAI Official

Clean, modern aesthetic matching OpenAI's documentation and research diagrams — minimal but precise.

## Color Palette

```
Background:     #ffffff  (pure white)
Primary text:   #0d0d0d  (near black)
Secondary text: #6e6e80  (muted gray)
Border:         #e5e5e5  (light gray)

Accent colors (reserved):
Green accent:   #10a37f  (OpenAI brand green)
Blue accent:    #1d4ed8  (links, actions)
Orange accent:  #f97316  (highlights, warnings)
Gray accent:    #71717a  (secondary elements)
```

## Typography

```
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica Neue, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif
font-size:   16px node labels, 13px descriptions, 12px arrow labels
font-weight: 600 for titles, 500 for labels, 400 for descriptions
letter-spacing: -0.01em (tight)
```

No custom fonts. System font stack only for maximum compatibility.

## Node Boxes

Clean, minimal boxes with subtle borders:

```xml
<!-- Standard node -->
<rect x="100" y="100" width="180" height="80" rx="8" ry="8"
      fill="#ffffff" stroke="#e5e5e5" stroke-width="1.5"/>

<!-- Accent node (with green left border) -->
<rect x="100" y="100" width="180" height="80" rx="8" ry="8"
      fill="#ffffff" stroke="#e5e5e5" stroke-width="1.5"/>
<rect x="100" y="100" width="4" height="80" rx="2" ry="2"
      fill="#10a37f"/>
```

**Key techniques:**
1. White fill with light gray border (no shadows)
2. Optional colored left-border accent strip (4px wide)
3. `rx="8"` for subtle rounding
4. `stroke-width: 1.5` — thin, precise borders
5. No gradients, no shadows, no decorative elements

## Arrows

Thin, precise arrows with subtle colors:

```xml
<defs>
  <!-- Default arrow (gray) -->
  <marker id="arrow-oai" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#71717a"/>
  </marker>

  <!-- Accent arrow (green) -->
  <marker id="arrow-oai-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="#10a37f"/>
  </marker>
</defs>

<!-- Default connection -->
<line x1="280" y1="140" x2="400" y2="140"
      stroke="#71717a" stroke-width="1.5" marker-end="url(#arrow-oai)"/>

<!-- Accent connection -->
<line x1="280" y1="140" x2="400" y2="140"
      stroke="#10a37f" stroke-width="1.5" marker-end="url(#arrow-oai-green)"/>
```

**Arrow guidelines:**
- Prefer straight lines (orthogonal routing with right angles)
- `stroke-width: 1.5` — thin and precise
- Filled polygon arrowheads (not stroke-based)
- Gray for default, green for primary/accent flows
- Dashed (`stroke-dasharray="4,3"`) for optional/async flows

## Arrow Labels

Minimal, small labels:

```xml
<text x="340" y="133" text-anchor="middle" fill="#6e6e80" font-size="12">
  label
</text>
```

Labels should be:
- 12px, gray color (`#6e6e80`)
- No background rect (white background is default)
- Short, technical language
- Midpoint of arrow

## Database Shapes

Clean cylinders with thin borders:

```xml
<ellipse cx="200" cy="100" rx="50" ry="12" fill="#ffffff" stroke="#e5e5e5" stroke-width="1.5"/>
<path d="M 150,100 L 150,140 Q 200,155 250,140 L 250,100"
      fill="#ffffff" stroke="#e5e5e5" stroke-width="1.5"/>
<ellipse cx="200" cy="140" rx="50" ry="12" fill="none" stroke="#e5e5e5" stroke-width="1.5"/>
```

## Grouping Containers

Dashed rect containers for logical grouping:

```xml
<rect x="80" y="80" width="400" height="200" rx="8" ry="8"
      fill="none" stroke="#e5e5e5" stroke-width="1" stroke-dasharray="4,3"/>
<text x="90" y="97" fill="#6e6e80" font-size="12" font-weight="500">
  Group Label
</text>
```

## Node Content

Clean, minimal text layout:

```xml
<rect x="100" y="100" width="180" height="80" rx="8" ry="8"
      fill="#ffffff" stroke="#e5e5e5" stroke-width="1.5"/>
<text x="190" y="130" text-anchor="middle" fill="#0d0d0d"
      font-size="16" font-weight="600">
  Component Name
</text>
<text x="190" y="150" text-anchor="middle" fill="#6e6e80"
      font-size="13">
  Brief description
</text>
```

**Content guidelines:**
- 1-2 lines per box
- Main label: 16px, font-weight: 600, near-black
- Description: 13px, font-weight: 400, gray
- Center-aligned text within boxes

## Layout Principles

**Precise, grid-aligned layout:**
- Snap all coordinates to 8px grid
- Consistent 100px horizontal spacing
- Consistent 120px vertical spacing
- Generous whitespace (40px+ margins)
- No decorative elements

**OpenAI minimalism:**
- Only use color when semantically meaningful (brand green for primary flow)
- White boxes on white background — differentiation through border and label only
- Avoid: shadows, gradients, patterns, icons, decorative elements
- Prefer: straight lines, orthogonal routing, thin strokes

## SVG Template

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" width="960" height="600">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica Neue, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif; }
  </style>
  <defs>
    <marker id="arrow-oai" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#71717a"/>
    </marker>
    <marker id="arrow-oai-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#10a37f"/>
    </marker>
  </defs>

  <!-- White background -->
  <rect width="960" height="600" fill="#ffffff"/>

  <!-- Title -->
  <text x="480" y="30" text-anchor="middle" fill="#0d0d0d"
        font-size="20" font-weight="600">Diagram Title</text>

  <!-- Standard node -->
  <rect x="100" y="70" width="180" height="80" rx="8" ry="8"
        fill="#ffffff" stroke="#e5e5e5" stroke-width="1.5"/>
  <text x="190" y="100" text-anchor="middle" fill="#0d0d0d"
        font-size="16" font-weight="600">Component</text>
  <text x="190" y="120" text-anchor="middle" fill="#6e6e80"
        font-size="13">Description</text>

  <!-- Connection -->
  <line x1="280" y1="110" x2="400" y2="110"
        stroke="#71717a" stroke-width="1.5" marker-end="url(#arrow-oai)"/>
  <text x="340" y="103" text-anchor="middle" fill="#6e6e80" font-size="12">label</text>
</svg>
```

## Design Philosophy

OpenAI Official style emphasizes:
- **Minimalism**: White on white, only essential visual elements
- **Precision**: Thin strokes, sharp corners (rx=8), grid-aligned
- **Clarity**: Content-first, no visual noise
- **Brand consistency**: `#10a37f` green used sparingly for primary flows

Avoid:
- Shadows and gradients
- Colorful fills (white fill only)
- Thick borders (>2px)
- Decorative elements (icons, patterns, textures)
- Custom fonts (system stack only)

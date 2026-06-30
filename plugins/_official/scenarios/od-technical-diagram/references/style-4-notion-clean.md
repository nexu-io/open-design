# Style 4: Notion Clean

Minimal, documentation-friendly. Designed to embed in Notion, Confluence, or GitHub wikis.

## Colors

```
Background:     #ffffff
Box fill:       #f9fafb  (gray-50) or #ffffff
Box stroke:     #e5e7eb  (gray-200)
Box radius:     4px

Text primary:   #111827  (gray-900)
Text secondary: #374151  (gray-700)
Text muted:     #9ca3af  (gray-400)
Text label:     #6b7280  (gray-500), uppercase, 11px

Accent (subtle, used sparingly):
  Blue:   #3b82f6 (arrows only)
  Gray:   #d1d5db (dividers)
```

## Design Principles

- **No decorative icons** — use geometric shapes only (rect, circle, diamond)
- **Generous whitespace** — 24px+ padding between elements  
- **Single arrow color** — blue (#3b82f6) for all connections
- **Labels in ALL CAPS** — section headers and node type labels
- **No drop shadows** — flat only

## Typography

```
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
             'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei',
             'Microsoft JhengHei', 'SimHei', sans-serif
font-size:   14px labels, 11px uppercase type labels, 18px title
font-weight: 400 normal, 500 medium for node labels
```

## Box Styles

```xml
<!-- Standard node -->
<rect rx="4" fill="#f9fafb" stroke="#e5e7eb" stroke-width="1"/>
<text fill="#111827" font-size="14" font-weight="500"/>

<!-- Type label (inside or above box) -->
<text fill="#9ca3af" font-size="11" 
      font-weight="500" letter-spacing="0.08em">DATABASE</text>

<!-- Section grouping (dashed container) -->
<rect rx="4" fill="none" stroke="#e5e7eb" stroke-width="1" 
      stroke-dasharray="4,3"/>
```

## Arrows

```xml
<defs>
  <marker id="arrow-blue" markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto">
    <polygon points="0 0, 8 3, 0 6" fill="#3b82f6"/>
  </marker>
</defs>
<line stroke="#3b82f6" stroke-width="1.5" 
      marker-end="url(#arrow-blue)"/>
<!-- Optional: gray arrow for secondary flows -->
<line stroke="#d1d5db" stroke-width="1" 
      stroke-dasharray="4,3" marker-end="url(#arrow-gray)"/>
```

## SVG Template

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 560"
     width="960" height="560">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif; }
  </style>
  <defs>
    <!-- arrow markers (blue only) -->
  </defs>
  <rect width="960" height="560" fill="#ffffff"/>
  <!-- nodes (no icons, geometry only) -->
  <!-- edges (single color) -->
  <!-- legend (minimal, only if 2+ flows) -->
</svg>
```

## Sizing Guide

- Node box: min 120×40px, prefer 160×48px for readability
- Title: top-left, 18px, gray-900, margin 32px from edges
- Spacing: 80px minimum between nodes horizontally, 60px vertically

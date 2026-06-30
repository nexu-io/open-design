# Style 2: Dark Terminal

Neon-on-dark hacker aesthetic. Matches CLAUDE.md standard tech diagram style.

## Colors

```
Background:     #0f0f1a  (near-black)
Panel fill:     #0f172a  (slate-950)
Panel stroke:   #334155  (slate-700)
Box radius:     6px

Text primary:   #e2e8f0  (slate-200)
Text secondary: #94a3b8  (slate-400)
Text muted:     #475569  (slate-600)

Accent palette (use per theme/layer):
  Purple:   #7c3aed / #a855f7
  Orange:   #ea580c / #f97316
  Blue:     #1d4ed8 / #3b82f6
  Green:    #059669 / #10b981
  Gold:     #eab308
  Red:      #dc2626 / #ef4444

Arrow colors: match accent of the source node's theme
```

## Background Gradient

```xml
<defs>
  <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="#0f0f1a"/>
    <stop offset="100%" stop-color="#1a1a2e"/>
  </linearGradient>
</defs>
<rect width="960" height="600" fill="url(#bg-grad)"/>
```

## Typography

```
font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Courier New', 'Microsoft YaHei', 'SimHei', monospace
font-size:   13px labels, 11px sub-labels, 15px titles
font-weight: 400 normal, 700 bold for section headers
letter-spacing: 0.02em for labels
```

## Box Styles

```xml
<!-- Standard panel -->
<rect rx="6" ry="6" fill="#0f172a" stroke="#334155" stroke-width="1"/>

<!-- Colored accent box (themed by function) -->
<rect rx="6" ry="6" fill="#1e1b4b" stroke="#7c3aed" stroke-width="1.5"/>
<!-- Purple for AI/ML nodes -->
<!-- #1c1917 / #ea580c for compute/API nodes -->
<!-- #052e16 / #059669 for storage/DB nodes -->
<!-- #1e3a5f / #3b82f6 for network/gateway nodes -->
```

## Glow Effect (optional, for key nodes)

```xml
<defs>
  <filter id="glow-purple">
    <feGaussianBlur stdDeviation="3" result="blur"/>
    <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>
<rect filter="url(#glow-purple)" stroke="#a855f7" .../>
```

## Arrows

```xml
<defs>
  <marker id="arrow-purple" markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto">
    <polygon points="0 0, 8 3, 0 6" fill="#a855f7"/>
  </marker>
</defs>
<path stroke="#a855f7" stroke-width="1.5" stroke-dasharray="none"
      fill="none" marker-end="url(#arrow-purple)"/>
```

## SVG Template

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"
     width="960" height="600">
  <style>
    text { font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', 'Courier New', 'Microsoft YaHei', 'SimHei', monospace; fill: #e2e8f0; }
  </style>
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f0f1a"/>
      <stop offset="100%" stop-color="#1a1a2e"/>
    </linearGradient>
    <!-- arrow markers -->
    <!-- glow filters -->
  </defs>
  <rect width="960" height="600" fill="url(#bg-grad)"/>
  <!-- nodes, edges, legend -->
</svg>
```

# Style 3: Blueprint

Engineering blueprint aesthetic with grid background and technical annotation style.

## Colors

```
Background:     #0a1628
Grid color:     #112240  (subtle grid lines)
Panel fill:     #0d1f3c
Panel stroke:   #00b4d8  (cyan/teal)
Box radius:     2px  (sharp corners for technical feel)

Text primary:   #caf0f8  (light cyan)
Text secondary: #90e0ef
Text label:     #00b4d8
Text muted:     #48cae4 at 60% opacity

Accent colors:
  Cyan:    #00b4d8 / #48cae4
  White:   #ffffff (key labels)
  Orange:  #f77f00 (warnings/alerts)
  Green:   #06d6a0 (success/active)
```

## Background with Grid

```xml
<defs>
  <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
    <path d="M 30 0 L 0 0 0 30" fill="none" 
          stroke="#112240" stroke-width="0.5"/>
  </pattern>
</defs>
<rect width="960" height="600" fill="#0a1628"/>
<rect width="960" height="600" fill="url(#grid)" opacity="0.6"/>
```

## Typography

```
font-family: 'Courier New', 'Lucida Console', 'Microsoft YaHei', 'SimHei', monospace
font-size:   13px labels, 10px annotations, 16px title
font-weight: 400; titles use 700
text-transform: uppercase for section headers
letter-spacing: 0.05em
```

## Box Styles

```xml
<!-- Technical node box -->
<rect rx="2" ry="2" fill="#0d1f3c" stroke="#00b4d8" stroke-width="1"/>

<!-- Corner brackets instead of full border (engineering style) -->
<!-- Draw 4 L-shapes at corners instead of full rect -->

<!-- Dashed box (external/optional component) -->
<rect rx="2" fill="none" stroke="#00b4d8" stroke-width="1" 
      stroke-dasharray="6,3"/>
```

## Arrows & Annotations

```xml
<defs>
  <marker id="arrow-cyan" markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto">
    <polygon points="0 0, 8 3, 0 6" fill="#00b4d8"/>
  </marker>
</defs>
<!-- Lines are sharp, orthogonal routing preferred -->
<polyline points="x1,y1 x2,y1 x2,y2" 
          stroke="#00b4d8" stroke-width="1" fill="none"
          marker-end="url(#arrow-cyan)"/>

<!-- Annotation label on line -->
<text fill="#48cae4" font-size="10" text-anchor="middle">HTTP/REST</text>
```

## Title Block (bottom-right)

```xml
<!-- Blueprint title block -->
<rect x="700" y="530" width="240" height="60" 
      fill="#0d1f3c" stroke="#00b4d8" stroke-width="1"/>
<line x1="700" y1="545" x2="940" y2="545" 
      stroke="#00b4d8" stroke-width="0.5"/>
<text x="820" y="542" text-anchor="middle" 
      fill="#caf0f8" font-size="10">SYSTEM ARCHITECTURE</text>
<text x="820" y="578" text-anchor="middle" 
      fill="#00b4d8" font-size="13" font-weight="700">DIAGRAM TITLE</text>
```

## SVG Template

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600"
     width="960" height="600">
  <style>
    text { font-family: 'Courier New', 'Lucida Console', 'Microsoft YaHei', 'SimHei', monospace; fill: #caf0f8; }
  </style>
  <defs>
    <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#112240" stroke-width="0.5"/>
    </pattern>
    <!-- arrow markers -->
  </defs>
  <rect width="960" height="600" fill="#0a1628"/>
  <rect width="960" height="600" fill="url(#grid)" opacity="0.6"/>
  <!-- nodes, edges, title block -->
</svg>
```

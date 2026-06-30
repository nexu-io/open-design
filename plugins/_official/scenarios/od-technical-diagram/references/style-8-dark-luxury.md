# Style 8 — Dark Luxury

Inspired by the `dark-gold` theme from [Understand-Anything](https://github.com/nicholasgasior/understand-anything).
Deep black canvas with warm champagne-gold accents and hybrid serif/sans typography.
Uniquely warm among all dark styles — closest peer is style-2 (Dark Terminal) but with a premium editorial feel.

## Color Tokens

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0a0a0a` | Canvas fill (deepest black, no blue tint) |
| Surface | `#111111` | Node / panel fill |
| Elevated | `#1a1a1a` | Secondary panels, sub-headers |
| Accent gold | `#d4a574` | Primary arrows, titles, borders, cluster containers |
| Accent dim | `#c9a96e` | Muted gold borders, secondary accents, cluster labels |
| Accent bright | `#e8c49a` | Highlights, selected state stroke |
| Text primary | `#f5f0eb` | Main labels (warm near-white) |
| Text secondary | `#a39787` | Sub-labels, descriptions |
| Text muted | `#6b5f53` | Annotations, fine print |

## Typography

```
Title / Section label:  Georgia, 'Times New Roman', serif
                        font-size: 21px (diagram title), 14px (section labels)
                        font-weight: 700
                        fill: #f5f0eb / #c9a96e (gold for section headers)

Node name:              -apple-system, 'Helvetica Neue', Arial, 'PingFang SC', sans-serif
                        font-size: 13-14px, font-weight: 600, fill: <bucket color>

Sub-label / detail:     sans-serif, font-size: 10-11px, fill: #a39787 or #6b5f53

Arrow label / legend:   sans-serif, font-size: 10-11px, fill: #a39787

Code / path text:       'Cascadia Code', 'SF Mono', 'Courier New', monospace
                        font-size: 10-11px, fill: #a39787
```

**Rule**: Georgia serif is used ONLY for diagram titles and cluster/section labels (≥14px).
All node names, arrow labels, and fine-print use sans-serif. This prevents CJK readability issues
at small sizes while preserving the luxury editorial hook where it's most visible.

## Node Semantic Color Buckets

Six buckets cover the full color wheel — no two adjacent bucket colors are similar:

| Bucket | Border Color | Use For |
|--------|-------------|---------|
| Code / Logic | `#5a9e6f` (sage green) | functions, classes, modules, algorithms |
| Service / API | `#a78bfa` (soft violet) | services, endpoints, APIs, gateways |
| Data / Storage | `#38bdf8` (sky blue) | databases, tables, files, caches |
| Concept / Domain | `#f87171` (soft rose) | concepts, domains, entities, topics |
| Infra / Config | `#fbbf24` (amber yellow) | infrastructure, config, scripts, pipelines |
| Meta / Doc | `#94a3b8` (cool gray) | documents, schemas, resources, sources |

All nodes share: `rx="6"` rounded rect, `fill="#111111"`, `stroke-width="1.5"`, stroke color matches bucket.

### SVG node example (Code / Logic):

```xml
<rect x="60" y="100" width="260" height="52" rx="6"
      fill="#111111" stroke="#5a9e6f" stroke-width="1.5"/>
<text x="72" y="122" font-family="-apple-system,'Helvetica Neue',Arial,sans-serif"
      font-size="13" font-weight="600" fill="#5a9e6f">MyComponent</text>
<text x="72" y="138" font-family="-apple-system,sans-serif"
      font-size="10" fill="#a39787">React component · state management</text>
```

## Arrow System

| Flow Type | Color | Stroke | Dash | Marker |
|-----------|-------|--------|------|--------|
| Primary / structural | `#d4a574` (gold) | 2px solid | none | gold arrowhead |
| Data flow | `#6ee7b7` (mint) | 1.5px solid | none | mint arrowhead |
| Control / trigger | `#fdba74` (amber-orange) | 1.5px solid | none | orange arrowhead |
| Reference / semantic | `#a39787` (warm muted) | 1px dashed | `4,3` | muted arrowhead |
| Dependency | `#a78bfa` (violet) | 1px dashed | `6,3` | violet arrowhead |
| Feedback / loop | `#d4a574` (gold) | 1.5px curved | — | gold arrowhead |

### SVG arrow markers (add to `<defs>`):

```xml
<defs>
  <!-- Gold — primary structural arrows -->
  <marker id="arr-gold" markerWidth="10" markerHeight="7"
          refX="9" refY="3.5" orient="auto">
    <polygon points="0 0,10 3.5,0 7" fill="#d4a574"/>
  </marker>

  <!-- Amber-orange — control/trigger -->
  <marker id="arr-orange" markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto">
    <polygon points="0 0,8 3,0 6" fill="#fdba74"/>
  </marker>

  <!-- Sky blue — data/storage references -->
  <marker id="arr-blue" markerWidth="10" markerHeight="7"
          refX="9" refY="3.5" orient="auto">
    <polygon points="0 0,10 3.5,0 7" fill="#38bdf8"/>
  </marker>

  <!-- Gray — muted/optional paths -->
  <marker id="arr-gray" markerWidth="8" markerHeight="6"
          refX="7" refY="3" orient="auto">
    <polygon points="0 0,8 3,0 6" fill="#94a3b8"/>
  </marker>
</defs>
```

### Arrow label placement

Use **offset-first**: place label 6–8px above horizontal arrows (not centered on the line).
Add background rect (`fill="#0a0a0a" opacity="0.9"`) only when the label still collides with another element.

## Container / Cluster Style

```xml
<!-- Layer cluster container -->
<rect x="40" y="80" width="880" height="140" rx="8"
      fill="none"
      stroke="#d4a574" stroke-width="0.5"
      stroke-dasharray="6,4" opacity="0.4"/>

<!-- Cluster label: top-left, Georgia serif, gold muted -->
<text x="52" y="98"
      font-family="Georgia,'Times New Roman',serif"
      font-size="11" font-weight="700"
      fill="#c9a96e" opacity="0.7">LAYER NAME</text>
```

## Background Treatment

No gradient needed — depth comes from contrast levels:

1. Canvas `#0a0a0a` — absolute black floor
2. Node surface `#111111` — first elevation (+1 stop)
3. Panel/sub-header `#1a1a1a` — second elevation (+2 stops)
4. Gold `#d4a574` — the only warmth; draws the eye to structure

Optional: subtle ambient radial glow around the central cluster
```xml
<radialGradient id="glow" cx="50%" cy="50%" r="30%">
  <stop offset="0%" stop-color="#d4a574" stop-opacity="0.04"/>
  <stop offset="100%" stop-color="#d4a574" stop-opacity="0"/>
</radialGradient>
<rect width="960" height="600" fill="url(#glow)"/>
```

## Full `<style>` Block

```xml
<style>
  text { font-family: -apple-system,"Helvetica Neue",Arial,"PingFang SC",sans-serif; }
  .ttl { font-family: Georgia,"Times New Roman",serif;
         font-size: 21px; font-weight: 700; fill: #f5f0eb; }
  .lbl { font-family: Georgia,"Times New Roman",serif;
         font-size: 11px; font-weight: 700; fill: #c9a96e; opacity: 0.7; }
  .nm  { font-size: 13px; font-weight: 600; }    /* node name — fill set per bucket */
  .sm  { font-size: 10px; fill: #a39787; }        /* sub-label */
  .xs  { font-size:  9px; fill: #6b5f53; }        /* fine print */
  .al  { font-size: 10px; fill: #8c7e72; }        /* arrow label */
  .fn  { font-family: "Cascadia Code","SF Mono","Courier New",monospace;
         font-size: 10px; fill: #a39787; }        /* code / path text */
</style>
```

## ViewBox Recommendations

| Diagram | ViewBox |
|---------|---------|
| Standard architecture | `0 0 960 600` |
| Tall pipeline / flow | `0 0 960 820` |
| Wide multi-layer | `0 0 1200 600` |

## Comparable Styles

| Style | Background | Accent | Typography |
|-------|-----------|--------|-----------|
| Style 2 Dark Terminal | `#0f0f1a` (blue-black) | `#00ff88` (neon green) | monospace throughout |
| **Style 8 Dark Luxury** | `#0a0a0a` (pure black) | `#d4a574` (champagne gold) | serif titles + sans body |
| Style 3 Blueprint | `#0a1628` (navy) | `#4fc3f7` (cyan) | sans-serif |

**When to choose Style 8**: architecture/pipeline docs where you want editorial gravitas —
README hero images, conference slides, knowledge-base diagrams, premium product docs.

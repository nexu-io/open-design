# SVG Technical Diagram Layout Best Practices

## Universal Layout Rules (Apply to All Styles)

### 1. Component Spacing
- **Minimum clearance between components**: 80px (edge to edge)
- **Minimum clearance for arrow paths**: 60px from component edges
- **Layer vertical spacing**: 120px between horizontal layers
- **Same-layer horizontal spacing**: 100-120px between components

### 2. Arrow Routing & Connection Points

#### Connection Point Rules
- **Never connect arrows to component corners** - use midpoints of edges
- **Entry/exit points**: 
  - Top edge: `cx ± offset` where offset = 0 for single arrow, ±30px for multiple
  - Bottom edge: same rule
  - Left/right edges: `cy ± offset`
- **Clearance from corners**: minimum 20px

#### Arrow Path Routing
- **Avoid diagonal lines crossing components** - use orthogonal routing (L-shaped paths)
- **For curved arrows**: 
  - Control point should be at least 40px away from any component edge
  - Use intermediate waypoints for complex routing: `M x1,y1 L x2,y2 Q cx,cy x3,y3`
- **Multiple arrows between same layers**: stagger Y-coordinates by 15-20px to avoid overlap

#### Arrow Overlap Prevention
```svg
<!-- Bad: diagonal arrow crosses component -->
<path d="M 200,100 L 600,400"/>

<!-- Good: orthogonal routing around component -->
<path d="M 200,100 L 200,250 L 600,250 L 600,400"/>

<!-- Good: curved with safe control point -->
<path d="M 200,100 Q 400,200 600,400"/>
<!-- Control point (400,200) is 50px+ away from any component -->
```

### 3. Arrow Label Placement
- **Position**: midpoint of arrow path, offset by 5-10px perpendicular to arrow direction
- **Background rect**: ALWAYS include, with:
  - Padding: 4px horizontal, 2px vertical
  - Fill: match background color
  - Opacity: 0.9-0.95
- **Safety distance**: 15px minimum from any component edge
- **Multiple converging arrows**: stagger label positions vertically by 20px

### 4. Component Overlap Detection
Before finalizing SVG, check:
- No component bounding boxes overlap (8px safety margin)
- No arrow paths pass through component interiors (except intentional tunneling with dashed style)
- No text labels overlap with components or other labels

### 5. Z-Index Layering (SVG render order)
```svg
<!-- Render order (top to bottom = back to front): -->
1. Background rect
2. Grouping containers (dashed rects)
3. Arrow paths
4. Arrow label background rects
5. Components (boxes, cylinders, etc.)
6. Component text
7. Arrow label text
8. Legend
```

## Style-Specific Enhancements

### Style-1: Flat Icon Clean
- **Perfect alignment**: snap all coordinates to 8px grid
- **Sharp corners**: rx="8" ry="8" for rounded rects (consistent)
- **Arrows**: thin (1.5-2px), filled polygon markers
- **No shadows**: flat design principle

### Style-6: Claude Official Warm
- **Soft shadows**: `<feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#00000008"/>`
- **Rounded corners**: rx="12" ry="12" (more rounded than Style-1)
- **Arrows**: medium weight (2px), subtle markers

## Validation Checklist

Before exporting PNG, verify:
- [ ] No arrow-component overlaps (visual inspection)
- [ ] All arrow labels have background rects
- [ ] Minimum 60px clearance for all arrow paths
- [ ] Component spacing ≥ 80px
- [ ] Arrow connection points avoid corners (≥20px from corner)
- [ ] Multiple arrows between layers are staggered
- [ ] Legend is readable and doesn't overlap content
- [ ] SVG renders cleanly via `cairosvg` (or `rsvg-convert` as fallback)

## Common Anti-Patterns to Avoid

| Anti-Pattern | Fix |
|--------------|-----|
| Arrow crosses component | Use orthogonal routing, increase control point distance |
| Label overlaps component | Add background rect + increase offset |
| Components too close | Increase spacing to 80px minimum |
| Arrow connects to corner | Move connection point to edge midpoint offset |
| No z-index planning | Follow render order: arrows -> components -> text |

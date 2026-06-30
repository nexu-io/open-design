# Style 6: Claude Official

Inspired by Anthropic's Claude blog technical diagrams — warm, approachable, professional.

```
Background:     #f8f6f3  (warm cream)
Box fill:       
  - Blue tint:   #a8c5e6  (alert/input nodes)
  - Green tint:  #9dd4c7  (agent nodes)
  - Beige:       #f4e4c1  (infrastructure/bus)
  - Gray tint:   #e8e6e3  (storage/state)
Box stroke:     #4a4a4a  (dark gray)
Box radius:     12px
Text primary:   #1a1a1a  (near black)
Text secondary: #6a6a6a  (medium gray)
Text labels:    #5a5a5a  (arrow labels)

Semantic colors:
  Input/Source:    #a8c5e6  (soft blue)
  Agent/Process:   #9dd4c7  (soft teal-green)
  Infrastructure:  #f4e4c1  (warm beige)
  Storage/State:   #e8e6e3  (light gray)
  
Arrow color:     #5a5a5a  (consistent dark gray)
```

## Typography

```
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue',
             Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif
font-size:   16px node labels, 14px descriptions, 13px arrow labels
font-weight: 600 for node labels, 400 for descriptions, 700 for titles
```

## Box Shapes

```xml
<!-- Agent node (teal-green) -->
<rect rx="12" ry="12" fill="#9dd4c7" stroke="#4a4a4a" stroke-width="2.5"/>

<!-- Input/Source node (soft blue) -->
<rect rx="12" ry="12" fill="#a8c5e6" stroke="#4a4a4a" stroke-width="2.5"/>

<!-- Infrastructure node (warm beige) -->
<rect rx="12" ry="12" fill="#f4e4c1" stroke="#4a4a4a" stroke-width="2.5"/>

<!-- Storage/State node (light gray) -->
<rect rx="12" ry="12" fill="#e8e6e3" stroke="#4a4a4a" stroke-width="2.5"/>
```

## Arrows

```xml
<defs>
  <marker id="arrow-claude" markerWidth="8" markerHeight="8"
          refX="7" refY="4" orient="auto">
    <polygon points="0 0, 8 4, 0 8" fill="#5a5a5a"/>
  </marker>
</defs>

<!-- Arrow line -->
<line stroke="#5a5a5a" stroke-width="2" marker-end="url(#arrow-claude)"/>

<!-- Or use simple line without arrowhead for cleaner look -->
<line stroke="#5a5a5a" stroke-width="2"/>
```

## Arrow Semantics

Use different arrow styles to convey meaning:

| Flow Type | Color | Stroke | Dash | Usage |
|-----------|-------|--------|------|-------|
| Primary data flow | #5a5a5a | 2px solid | none | Main request/response path |
| Memory write | #5a5a5a | 2px | `5,3` | Write/store operations |
| Memory read | #5a5a5a | 2px solid | none | Retrieval from store |
| Control/trigger | #5a5a5a | 1.5px | `3,2` | Event triggers |

```xml
<!-- Solid arrow for reads -->
<line stroke="#5a5a5a" stroke-width="2" marker-end="url(#arrow-claude)"/>

<!-- Dashed arrow for writes -->
<line stroke="#5a5a5a" stroke-width="2" stroke-dasharray="5,3" marker-end="url(#arrow-claude)"/>
```

## Arrow Labels

Arrow labels should be **technical and specific**, positioned mid-arrow:

```xml
<text x="..." y="..." fill="#5a5a5a" font-size="13" text-anchor="middle">
  store(embedding)
</text>
```

Good lls: `query(text)`, `retrieve(top_k=5)`, `embed(768d)`, `POST /api/search`
Avoid vague labels: "Process", "Send", "Get"

## Node Content Guidelines

Node content should include **technical details**, not just concepts:

**Good examples:**
- "Vector Store" → "Vector Sne)" + "• 768-dim embeddings" + "• Cosine s"
- "LLM" → "GPT-4" + "• 8K context" + "• Temperature: 0.7"
- "Memory" → "Redis Cache" + "• TTL: 5min" + "• Max: 4K tokens"

**Avoid vague descriptions:**
- "Process data" → specify what processing
- "Store information" → specify storage type and format
- "Handle requests" → specify request type and method

Use 2-3 lines per node:
1. Component name (bold, 16px)
2. Technical detail or implementation (14px)
3. Key parameter or constraint (14px, optional)

## Layer Labels

For multi-layer architectures, add layer labels on the left side:

```xml
<text x="30" y="130" fill="#6a6a6a" font-size="14" font-weight="600">Input</text>
<text x="30" y="290" fill="#6a6a6a" font-size="14" font-weight="600">Processing</text>
<text x="30" y="490" fill="#6a6a6a" font-size="14" font-weight="600">Storage</text>
```

Position at the vertical center of each layer.

## Legend Requirement

When using 2+ arrow types or colors, include a legend in the bottom-right corner:

```Legend box -->="720" y="520" width="220" height="8" ry="8" 
      fill="#ffffff" stroke="#4a4a4a" stroke-width="1.5"/>
<text x="735" y="540" fill="#1a1a1a" font-size="13" font-weight="600">Legend</text>

<!-- Legend items -->
<line x1="735" y1="555" x2="765" y2="555" stroke="#5a5a5a" stroke-width="2"/>
<text x="775" y="560" fill="#6a6a6a" font-size="12">Read operation</text>

<line x1="735" y1="570" x2="765" y2="570" stroke="#5a5a5a" stroke-width="2" stroke-dasharray="5,3"/>
<text x="775" y="575" fill="#6a6a6a" font-size="12">Write operation</text>
```

Position: bottom-right, 20px margin from edges.

## Layout Principles

- **Generous spacing**: Minimum 80px between node edges
- **Horizontal alignment**: Same-layer nodes align perfectly
- **Vertical flow**: Top-to-bottom preferred
- **Symmetry**: Balanced composition
- **Clean lines**: Orthogonal routing — vertical then horizontal, or vice versa

## SVG Template

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 600" 
     width="960" height="600">
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
                   'Helvetica Neue', Arial, 'PingFang SC', 'Microsoft YaHei', 'Microsoft JhengHei', 'SimHei', sans-serif;
    }
  </style>
  <defs>
    <marker id="arrow-claude" markerWidth="8" markerHeight="8"
            refX="7" refY="4" orient="auto">
      <polygon points="0 0, 8 4, 0 8" fill="#5a5a5a"/>
    </marker>
    <filter id="shadow-soft">
      <feDropShadow dx="0" dy="2" stdDeviation="6" flood-color="#00000008"/>
    </filter>
  </defs>
  
  <!-- Warm cream background -->
  <rect width="960" height="600" fill="#f8f6f3"/>
  
  <!-- Title (optional) -->
  <text x="480" y="40" text-anchor="middle" fill="#1a1a1a" 
        font-size="20" font-weight="700">Diagram Title</text>
  
  <!-- Nodes -->
  <!-- Agent node example -->
  <rect x="100" y="100" width="180" height="80" rx="12" ry="12"
        fill="#9dd4c7" stroke="#4a4a4a" stroke-width="2.5" 
        filter="url(#shadow-soft)"/>
  <text x="190" y="145" text-anchor="middle" fill="#1a1a1a" 
        font-size="16" font-weight="600">Agent name</text>
  
  <!-- Edges -->
  <line x1="190" y1="180" x2="190" y2="240" 
        stroke="#5a5a5a" stroke-width="2" marker-end="url(#arrow-claude)"/>
  <text x="210" y="215" fill="#5a5a5a" font-size="13">Publish</text>
</svg>
```

## Design Philosophy

Claude's official style emphasizes:
- **Warmth**: Cream background, soft fills
- **Clarity**: High contrast text, generous spacing
- **Professionalism**: Consistent stroke weights, aligned elements
- **Approachability**: Rounded corners, friendly colors

Avoid:
- Harsh shadows or gradients
- Overly saturated colors
- Thin stroke weights (< 2px)
- Cluttered layouts

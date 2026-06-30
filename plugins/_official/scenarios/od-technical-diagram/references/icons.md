# Icon Reference

## Rules for Renderer Compatibility (cairosvg / rsvg-convert)

**Never use** `@import url()` for icon fonts — neither cairosvg nor rsvg-convert fetches external resources.
**Always use** inline SVG `<path>`, `<circle>`, `<rect>`, `<text>` combinations.
**Font fallback**: embed font-family in `<style>` using system fonts only.

---

## Generic Semantic Shapes (No product — use these first)

### Database / Vector Store (cylinder)
```xml
<!-- cx=center-x, top=top-y, w=width, h=height -->
<!-- Typical: w=80, h=70 -->
<ellipse cx="cx" cy="top" rx="w/2" ry="w/6" fill="fill" stroke="stroke" stroke-width="1.5"/>
<rect x="cx-w/2" y="top" width="w" height="h" fill="fill" stroke="none"/>
<line x1="cx-w/2" y1="top" x2="cx-w/2" y2="top+h" stroke="stroke" stroke-width="1.5"/>
<line x1="cx+w/2" y1="top" x2="cx+w/2" y2="top+h" stroke="stroke" stroke-width="1.5"/>
<!-- Optional inner rings for Vector Store -->
<ellipse cx="cx" cy="top+h*0.33" rx="w/2" ry="w/6" fill="none" stroke="stroke" stroke-width="0.7" opacity="0.5"/>
<ellipse cx="cx" cy="top+h*0.66" rx="w/2" ry="w/6" fill="none" stroke="stroke" stroke-width="0.7" opacity="0.5"/>
<ellipse cx="cx" cy="top+h" rx="w/2" ry="w/6" fill="fill-dark" stroke="stroke" stroke-width="1.5"/>
```

### LLM / Model Node (rounded rect with spark)
```xml
<!-- Rounded rect with double border = "intelligent" signal -->
<rect x="x" y="y" width="w" height="h" rx="10" fill="fill" stroke="stroke-outer" stroke-width="2.5"/>
<rect x="x+3" y="y+3" width="w-6" height="h-6" rx="8" fill="none" stroke="stroke-inner" stroke-width="0.8" opacity="0.5"/>
<!-- Spark icon (⚡) as text or small lightning path -->
<text x="cx" y="cy-6" text-anchor="middle" font-size="14">⚡</text>
<text x="cx" y="cy+10" text-anchor="middle" fill="text-color" font-size="13" font-weight="600">GPT-4o</text>
```

### Agent / Orchestrator (hexagon)
```xml
<!-- r = circumradius, cx/cy = center -->
<!-- For r=36: points at 36,0  18,31.2  -18,31.2  -36,0  -18,-31.2  18,-31.2 -->
<polygon points="cx,cy-r  cx+r*0.866,cy-r*0.5  cx+r*0.866,cy+r*0.5  cx,cy+r  cx-r*0.866,cy+r*0.5  cx-r*0.866,cy-r*0.5"
         fill="fill" stroke="stroke" stroke-width="1.5"/>
<text x="cx" y="cy+5" text-anchor="middle" fill="text" font-size="12" font-weight="600">Agent</text>
```

### Memory Node (short-term, dashed border)
```xml
<rect x="x" y="y" width="w" height="h" rx="8"
      fill="fill" stroke="stroke" stroke-width="1.5" stroke-dasharray="6,3"/>
<text x="cx" y="cy-6" text-anchor="middle" fill="text" font-size="10" opacity="0.7">MEMORY</text>
<text x="cx" y="cy+8" text-anchor="middle" fill="text" font-size="13">Short-term</text>
```

### Tool / Function Call (rect with gear symbol)
```xml
<rect x="x" y="y" width="w" height="h" rx="6" fill="fill" stroke="stroke" stroke-width="1.5"/>
<!-- Gear: simplified as ⚙ unicode or small circle with lines -->
<text x="cx" y="cy-4" text-anchor="middle" font-size="16">⚙</text>
<text x="cx" y="cy+12" text-anchor="middle" fill="text" font-size="12">Tool Name</text>
```

### Queue / Stream (horizontal pipe)
```xml
<!-- Pipe tube: left cap ellipse + body + right cap ellipse -->
<ellipse cx="x1" cy="cy" rx="ry*0.6" ry="ry" fill="fill-dark" stroke="stroke" stroke-width="1.5"/>
<rect x="x1" y="cy-ry" width="x2-x1" height="ry*2" fill="fill" stroke="none"/>
<line x1="x1" y1="cy-ry" x2="x2" y2="cy-ry" stroke="stroke" stroke-width="1.5"/>
<line x1="x1" y1="cy+ry" x2="x2" y2="cy+ry" stroke="stroke" stroke-width="1.5"/>
<ellipse cx="x2" cy="cy" rx="ry*0.6" ry="ry" fill="fill-light" stroke="stroke" stroke-width="1.5"/>
```

### User / Human Actor
```xml
<!-- Head -->
<circle cx="cx" cy="cy-18" r="10" fill="fill" stroke="stroke" stroke-width="1.2"/>
<!-- Body / shoulders -->
<path d="M cx-14,cy+16 Q cx-14,cy-4 cx,cy-4 Q cx+14,cy-4 cx+14,cy+16"
      fill="fill" stroke="stroke" stroke-width="1.2"/>
<text x="cx" y="cy+30" text-anchor="middle" fill="text" font-size="12">User</text>
```

### API Gateway (hexagon, single border, smaller)
```xml
<polygon points="cx,cy-28  cx+24,cy-14  cx+24,cy+14  cx,cy+28  cx-24,cy+14  cx-24,cy-14"
         fill="fill" stroke="stroke" stroke-width="1.5"/>
<text x="cx" y="cy+5" text-anchor="middle" fill="text" font-size="11">API</text>
```

### Browser / Web Client
```xml
<rect x="x" y="y" width="w" height="h" rx="6" fill="fill" stroke="stroke" stroke-width="1.5"/>
<!-- Title bar -->
<rect x="x" y="y" width="w" height="20" rx="6" fill="fill-dark" stroke="none"/>
<rect x="x" y="y+14" width="w" height="6" fill="fill-dark"/>
<!-- Traffic light dots -->
<circle cx="x+12" cy="y+10" r="4" fill="#ef4444" opacity="0.8"/>
<circle cx="x+24" cy="y+10" r="4" fill="#f59e0b" opacity="0.8"/>
<circle cx="x+36" cy="y+10" r="4" fill="#10b981" opacity="0.8"/>
```

### Document / File
```xml
<!-- Folded corner rectangle -->
<path d="M x,y L x+w-12,y L x+w,y+12 L x+w,y+h L x,y+h Z"
      fill="fill" stroke="stroke" stroke-width="1.5"/>
<!-- Fold -->
<path d="M x+w-12,y L x+w-12,y+12 L x+w,y+12" fill="fill-dark" stroke="stroke" stroke-width="1"/>
<!-- Lines inside -->
<line x1="x+8" y1="y+h*0.45" x2="x+w-8" y2="y+h*0.45" stroke="stroke" stroke-width="1" opacity="0.5"/>
<line x1="x+8" y1="y+h*0.6"  x2="x+w-8" y2="y+h*0.6"  stroke="stroke" stroke-width="1" opacity="0.5"/>
<line x1="x+8" y1="y+h*0.75" x2="x+w-16" y2="y+h*0.75" stroke="stroke" stroke-width="1" opacity="0.5"/>
```

### Decision Diamond (flowcharts)
```xml
<!-- cx/cy = center, hw = half-width, hh = half-height -->
<polygon points="cx,cy-hh  cx+hw,cy  cx,cy+hh  cx-hw,cy"
         fill="fill" stroke="stroke" stroke-width="1.5"/>
<text x="cx" y="cy+5" text-anchor="middle" fill="text" font-size="12">Condition?</text>
```

### Swim Lane Container
```xml
<!-- Background band for a layer/group -->
<rect x="x" y="y" width="w" height="h" rx="6"
      fill="fill" fill-opacity="0.04" stroke="stroke" stroke-width="1" stroke-dasharray="6,4"/>
<!-- Layer label top-left -->
<text x="x+12" y="y+16" fill="label-color" font-size="10" font-weight="600" letter-spacing="0.06em">LAYER NAME</text>
```

---

## Product Icons (Brand Colors + Inline SVG)

All use circle badge + text abbreviation pattern. Replace `cx`, `cy` with actual coordinates.

### AI / ML Products

| Product | Color | Badge Text |
|---------|-------|-----------|
| OpenAI / ChatGPT | `#10A37F` | `OAI` |
| Anthropic / Claude | `#D97757` | `Claude` |
| Google Gemini | `#4285F4` | `Gemini` |
| Meta LLaMA | `#0467DF` | `LLaMA` |
| Mistral | `#FF7000` | `Mistral` |
| Cohere | `#39594D` | `Cohere` |
| Groq | `#F55036` | `Groq` |
| Together AI | `#6366F1` | `Together` |
| Replicate | `#191919` | `Rep` |
| Hugging Face | `#FFD21E` (text dark) | `HF` |

**Template:**
```xml
<circle cx="cx" cy="cy" r="22" fill="BRAND_COLOR"/>
<text x="cx" y="cy+5" text-anchor="middle" fill="white"
      font-size="10" font-weight="700" font-family="Helvetica">BADGE_TEXT</text>
<!-- Optional: outer ring for "AI" products -->
<circle cx="cx" cy="cy" r="24" fill="none" stroke="BRAND_COLOR" stroke-width="1" opacity="0.4"/>
```

### AI Memory & RAG Products

| Product | Color | Badge |
|---------|-------|-------|
| Mem0 | `#6366F1` | `mem0` |
| LangChain | `#1C3C3C` | `🦜` or `LC` |
| LlamaIndex | `#8B5CF6` | `LI` |
| LangGraph | `#1C3C3C` | `LG` |
| CrewAI | `#EF4444` | `Crew` |
| AutoGen | `#0078D4` | `AG` |
| Haystack | `#FF6D00` | `🌾` or `HS` |
| DSPy | `#7C3AED` | `DSPy` |

### Vector Databases

| Product | Color | Badge |
|---------|-------|-------|
| Pinecone | `#1C1C2E` + green | `Pine` |
| Weaviate | `#FA0050` | `Wea` |
| Qdrant | `#DC244C` | `Qdrant` |
| Chroma | `#FF6B35` | `Chr` |
| Milvus | `#00A1EA` | `Milvus` |
| pgvector | `#336791` | `pgv` |
| Faiss | `#0467DF` | `FAISS` |

**Vector DB template (cylinder + badge):**
```xml
<!-- Cylinder shape -->
<ellipse cx="cx" cy="top" rx="40" ry="12" fill="FILL" stroke="STROKE" stroke-width="1.5"/>
<rect x="cx-40" y="top" width="80" height="50" fill="FILL" stroke="none"/>
<line x1="cx-40" y1="top" x2="cx-40" y2="top+50" stroke="STROKE" stroke-width="1.5"/>
<line x1="cx+40" y1="top" x2="cx+40" y2="top+50" stroke="STROKE" stroke-width="1.5"/>
<ellipse cx="cx" cy="top+50" rx="40" ry="12" fill="FILL_DARK" stroke="STROKE" stroke-width="1.5"/>
<!-- Product name -->
<text x="cx" y="top+30" text-anchor="middle" fill="white"
      font-size="11" font-weight="700">Pinecone</text>
```

### Classic Databases & Storage

| Product | Color |
|---------|-------|
| PostgreSQL | `#336791` |
| MySQL | `#4479A1` |
| MongoDB | `#47A248` |
| Redis | `#DC382D` |
| Elasticsearch | `#005571` |
| Cassandra | `#1287B1` |
| Neo4j | `#008CC1` |
| SQLite | `#003B57` |

### Message Queues & Streaming

| Product | Color |
|---------|-------|
| Apache Kafka | `#231F20` |
| RabbitMQ | `#FF6600` |
| AWS SQS | `#FF9900` |
| NATS | `#27AAE1` |
| Pulsar | `#188FFF` |

### Cloud & Infra

| Product | Color |
|---------|-------|
| AWS | `#FF9900` |
| GCP | `#4285F4` |
| Azure | `#0089D6` |
| Cloudflare | `#F48120` |
| Vercel | `#000000` |
| Docker | `#2496ED` |
| Kubernetes | `#326CE5` |
| Terraform | `#7B42BC` |
| Nginx | `#009639` |
| FastAPI | `#009688` |

### Observability

| Product | Color |
|---------|-------|
| Grafana | `#F46800` |
| Prometheus | `#E6522C` |
| Datadog | `#632CA6` |
| LangSmith | `#1C3C3C` |
| Langfuse | `#6366F1` |
| Arize | `#6B48FF` |

---

## Azure Service Icons

Azure brand colour: `#0089D6` (top tile / outer ring).
Service-specific accents come from Microsoft's Azure icon set; use them
as the inner badge fill so a glance still tells you "this is Azure".

**Template (Azure tile):**
```xml
<!-- Azure tile: outer rounded square in Azure blue, inner badge for the service. -->
<rect x="cx-22" y="cy-22" width="44" height="44" rx="6"
      fill="#0089D6" stroke="none"/>
<rect x="cx-19" y="cy-19" width="38" height="38" rx="4"
      fill="SERVICE_COLOR" stroke="none"/>
<text x="cx" y="cy+5" text-anchor="middle" fill="white"
      font-size="9" font-weight="700" font-family="Helvetica">BADGE</text>
```

### Azure Compute

| Product | Service Color | Badge |
|---------|---------------|-------|
| Azure Functions | `#0062AD` | `Func` |
| Azure App Service | `#0072C6` | `App` |
| Azure Container Apps | `#3F8624` | `ACA` |
| Azure Container Instances | `#0078D4` | `ACI` |
| Azure Kubernetes Service (AKS) | `#326CE5` | `AKS` |
| Azure Virtual Machines | `#0078D4` | `VM` |
| Azure Batch | `#0072C6` | `Batch` |
| Azure Spring Apps | `#6DB33F` | `Spring` |

### Azure Data & Analytics

| Product | Service Color | Badge |
|---------|---------------|-------|
| Azure SQL Database | `#0066A1` | `SQL` |
| Azure Cosmos DB | `#3D7AB3` | `Cosmos` |
| Azure Database for PostgreSQL | `#336791` | `pg` |
| Azure Database for MySQL | `#4479A1` | `MySQL` |
| Azure Synapse Analytics | `#0078D4` | `Syn` |
| Azure Data Factory | `#0078D4` | `ADF` |
| Azure Databricks | `#FF3621` | `Bricks` |
| Azure Stream Analytics | `#0072C6` | `Stream` |
| Azure Data Explorer (Kusto) | `#1E5180` | `Kusto` |
| Azure Cache for Redis | `#DC382D` | `Redis` |

### Azure Storage

| Product | Service Color | Badge |
|---------|---------------|-------|
| Azure Blob Storage | `#0078D4` | `Blob` |
| Azure Queue Storage | `#0078D4` | `Queue` |
| Azure Table Storage | `#0078D4` | `Table` |
| Azure Files | `#0078D4` | `Files` |
| Azure Data Lake Storage Gen2 | `#0078D4` | `Lake` |

### Azure AI

| Product | Service Color | Badge |
|---------|---------------|-------|
| Azure OpenAI Service | `#10A37F` | `AOAI` |
| Azure AI Search (Cognitive Search) | `#0078D4` | `AISrch` |
| Azure AI Foundry | `#742774` | `Foundry` |
| Azure Machine Learning | `#0078D4` | `AML` |
| Azure AI Content Safety | `#107C10` | `Safety` |
| Azure Speech / Translator | `#0078D4` | `Speech` |

### Azure Messaging & Eventing

| Product | Service Color | Badge |
|---------|---------------|-------|
| Azure Service Bus | `#0078D4` | `SB` |
| Azure Event Grid | `#0078D4` | `Grid` |
| Azure Event Hubs | `#0078D4` | `Hubs` |
| Azure Notification Hubs | `#0078D4` | `Notif` |
| Azure SignalR Service | `#0078D4` | `SignalR` |

### Azure Networking & Edge

| Product | Service Color | Badge |
|---------|---------------|-------|
| Azure Front Door | `#0078D4` | `AFD` |
| Azure Application Gateway | `#0078D4` | `AppGW` |
| Azure Load Balancer | `#0078D4` | `LB` |
| Azure API Management | `#1FBA9F` | `APIM` |
| Azure Virtual Network | `#0078D4` | `VNet` |
| Azure Private Link | `#0078D4` | `PL` |
| Azure CDN | `#0078D4` | `CDN` |
| Azure DNS | `#0078D4` | `DNS` |

### Azure Identity & Security

| Product | Service Color | Badge |
|---------|---------------|-------|
| Microsoft Entra ID (Azure AD) | `#0072C6` | `Entra` |
| Azure Key Vault | `#FFB900` | `KV` |
| Azure Sentinel | `#0072C6` | `Sentinel` |
| Microsoft Defender for Cloud | `#0078D4` | `Defender` |

### Azure DevOps & Operations

| Product | Service Color | Badge |
|---------|---------------|-------|
| Azure DevOps Pipelines | `#0078D4` | `Pipelines` |
| GitHub Actions (Azure target) | `#181717` | `GHA` |
| Azure Monitor | `#0078D4` | `Monitor` |
| Application Insights | `#0072C6` | `AppI` |
| Azure Log Analytics | `#0078D4` | `Logs` |

### Azure-specific shapes

For diagrams that need a recognisable "Azure" visual without a service
badge — e.g. a region container or a subscription boundary — use a
dashed Azure-blue outline:

```xml
<!-- Azure region/subscription container -->
<rect x="x" y="y" width="w" height="h" rx="8"
      fill="#0089D6" fill-opacity="0.04"
      stroke="#0089D6" stroke-width="1.2" stroke-dasharray="6,4"/>
<text x="x+12" y="y+16" fill="#0089D6" font-size="10"
      font-weight="700" letter-spacing="0.06em">AZURE • REGION NAME</text>
```

---

## Icon Sizing Guide

| Context | Recommended Size | Padding |
|---------|-----------------|---------|
| Node badge (inside box) | 28×28px circle | 10px |
| Standalone icon node | 40×40px | 16px |
| Hero / central node | 56×56px | 20px |
| Small inline indicator | 16×16px | 6px |

## Arrow Marker Templates

```xml
<defs>
  <!-- Standard filled arrow -->
  <marker id="arrow-COLORNAME" markerWidth="10" markerHeight="7"
          refX="9" refY="3.5" orient="auto">
    <polygon points="0 0, 10 3.5, 0 7" fill="COLOR"/>
  </marker>

  <!-- Open arrow (outline only) -->
  <marker id="arrow-open" markerWidth="10" markerHeight="8"
          refX="9" refY="4" orient="auto">
    <path d="M 0 0 L 10 4 L 0 8" fill="none" stroke="COLOR" stroke-width="1.5"/>
  </marker>

  <!-- Circle dot (for association lines) -->
  <marker id="dot" markerWidth="8" markerHeight="8"
          refX="4" refY="4" orient="auto">
    <circle cx="4" cy="4" r="3" fill="COLOR"/>
  </marker>
</defs>
```

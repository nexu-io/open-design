# Platform A Dashboard Refocus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refocus the Platform A dashboard from generic SaaS metrics to product-aligned AI research features: company list, knowledge graph, research queue, and company drill-down, while keeping MRR + customer count.

**Architecture:** Single-file HTML dashboard (`mrt35y6z-dashboard.html`) with in-memory JS data model, view-based rendering (dashboard/research/opportunities/workflows), and SVG-based knowledge graph. All CSS/JS inline.

**Tech Stack:** Vanilla JS, SVG (knowledge graph), CSS custom properties (Sunset-Warm palette), Space Grotesk + JetBrains Mono fonts.

**File:** `mrt35y6z-dashboard.html` (~976 lines existing, single-file edit throughout)

## Global Constraints

- All copy in Traditional Chinese (zh-TW) except brand names
- No emoji — use inline SVGs or text
- Sunset-Warm palette: `--accent: #f4a84a`, glassmorphism cards with `backdrop-filter: blur(12px)`
- Keep existing brand styling (noise texture SVG, decorative orb, warm shadows)
- All buttons must be functional — no dead links or `#` anchors
- Follow the spec at `docs/superpowers/specs/2026-07-20-platform-a-dashboard-refocus.md`

---

### Task 1: Add Companies Data Model

**Files:**
- Modify: `mrt35y6z-dashboard.html` — add companies array inside the IIFE at data section (~line 330)

**Interfaces:**
- Consumes: existing `data` object (MRR/customer/knowledge per time range)
- Produces: `companies` array used by Task 2, 3, 4, 5

**Data model additions:**
```js
// Inside the existing JS IIFE, after the data object
const companies = [
  {
    id: 'acme', name: 'Acme Corp', initials: 'AC', industry: '科技 / SaaS',
    status: 'complete',
    knowledgeScore: 74, facetsScanned: 3, totalFacets: 5,
    opportunityCount: 4,
    lastUpdated: '2m',
    color: '#f4a84a',
    entities: {
      people: [{ name: 'John Smith', role: 'CEO' }, { name: 'Sarah Chen', role: 'CTO' }],
      products: [{ name: 'AcmeCloud', type: '核心產品' }, { name: 'AcmeAnalytics', type: '新產品' }],
      competitors: [{ name: 'TechFlow Inc', type: '直接競爭' }, { name: 'DataBridge Co', type: '間接競爭' }],
      customers: [{ name: 'NovaGrid', type: '企業客戶' }],
      investors: [{ name: 'YC W27', type: '加速器' }]
    },
    opportunities: [
      { id: 101, t:'社群媒體策略', c:86, g:'a', tl:'行銷', st:'-' },
      { id: 102, t:'優化入職流程', c:79, g:'b', tl:'營運', st:'-' },
    ],
    workflows: [
      { id: 201, n:'MRR 追蹤', m:'Stripe · 每週', s:'go' },
    ]
  },
  {
    id: 'techflow', name: 'TechFlow Inc', initials: 'TF', industry: '金融科技',
    status: 'researching',
    knowledgeScore: 45, facetsScanned: 2, totalFacets: 5,
    opportunityCount: 1,
    lastUpdated: '15m',
    color: '#10b981',
    entities: {
      people: [{ name: 'Mike Liu', role: 'CEO' }],
      products: [{ name: 'FlowPay', type: '核心產品' }],
      competitors: [],
      customers: [],
      investors: []
    },
    opportunities: [
      { id: 103, t:'支付流程優化', c:72, g:'c', tl:'財務', st:'-' },
    ],
    workflows: []
  },
  {
    id: 'databridge', name: 'DataBridge Co', initials: 'DB', industry: '數據基礎設施',
    status: 'complete',
    knowledgeScore: 88, facetsScanned: 5, totalFacets: 5,
    opportunityCount: 7,
    lastUpdated: '1h',
    color: '#8db4d9',
    entities: {
      people: [{ name: 'Lisa Park', role: 'CEO' }, { name: 'Tom Wu', role: 'COO' }],
      products: [{ name: 'BridgeDB', type: '核心產品' }],
      competitors: [{ name: 'Snowflake', type: '間接競爭' }],
      customers: [{ name: 'Fortune 500 Co', type: '企業客戶' }],
      investors: [{ name: 'Sequoia', type: 'VC' }]
    },
    opportunities: [
      { id: 104, t:'資料管線自動化', c:91, g:'a', tl:'營運', st:'-' },
      { id: 105, t:'定價策略調整', c:78, g:'b', tl:'策略', st:'-' },
    ],
    workflows: [
      { id: 202, n:'資料品質監控', m:'即時', s:'go' },
    ]
  },
  {
    id: 'novagrid', name: 'NovaGrid', initials: 'NG', industry: '能源科技',
    status: 'queued',
    knowledgeScore: 12, facetsScanned: 1, totalFacets: 5,
    opportunityCount: 0,
    lastUpdated: '3h',
    color: '#e8875e',
    entities: { people: [], products: [], competitors: [], customers: [], investors: [] },
    opportunities: [],
    workflows: []
  },
  {
    id: 'cloudpulse', name: 'CloudPulse', initials: 'CP', industry: '基礎監控',
    status: 'complete',
    knowledgeScore: 62, facetsScanned: 3, totalFacets: 5,
    opportunityCount: 2,
    lastUpdated: '45m',
    color: '#8b5cf6',
    entities: {
      people: [{ name: 'Ana Reyes', role: 'CEO' }],
      products: [{ name: 'PulseWatch', type: '核心產品' }],
      competitors: [{ name: 'Datadog', type: '直接競爭' }],
      customers: [],
      investors: []
    },
    opportunities: [
      { id: 106, t:'警報系統優化', c:83, g:'c', tl:'營運', st:'-' },
    ],
    workflows: []
  },
];
```

Also add a `researchQueue` array for Task 3:
```js
let researchQueue = [
  { id:1, co:'TechFlow Inc', phase:'資料收集', progress:65, eta:'約 12 分鐘', priority:'high' },
  { id:2, co:'NovaGrid', phase:'佇列中', progress:0, eta:'—', priority:'normal' },
];
```

- [ ] **Step 1: Insert companies array into the IIFE**
  Locate the data section inside `(function() { 'use strict';` and add the `companies` array after the existing `acts` array definition.

- [ ] **Step 2: Insert researchQueue array**

- [ ] **Step 3: Update `cur` variable declaration to include `selectedCompany: null`**
  Change `let cur = 'm';` to `let cur = 'm', selectedCompany = null;`

- [ ] **Step 4: Verify no syntax errors**
  Run: No syntax errors in browser console when loading the dashboard

---

### Task 2: Refocus Dashboard View — Replace Charts with Company List

**Files:**
- Modify: `mrt35y6z-dashboard.html` — replace the `renderDashboard()` function content

**Interfaces:**
- Consumes: `companies` array (Task 1), existing `data` (MRR/customers), `opps`/`wfs`/`acts` arrays
- Produces: Dashboard layout with MRR + customer 2-card row + company list table + AI discoveries + workflows

**What changes in the dashboard view layout:**
1. MRR card (keep as-is)
2. 3 stat cards → **2 stat cards** (活躍客戶 + 知識覆蓋總分). Remove 發現機會 card (it's per-company now)
3. Replace `chart-row` (MRR trend + revenue breakdown) → **company research list** table
4. Keep AI Discoveries + Workflows panels (now scoped to active company)
5. REMOVE: renewals section, activity feed (move to bottom if space)
6. Keep activity feed (it's useful for all views)

**renderDashboard() new template structure:**
```
MRR row (keep)
2 stat cards: 活躍客戶 + 總知識覆蓋
Company list table (name, status, knowledge, opportunities, last updated, action button)
AI Discoveries panel (scoped to first company by default)
Workflows panel
Activity feed
```

- [ ] **Step 1: Rewrite renderDashboard() to produce the new layout**

  Replace the `renderDashboard` function:

```js
function renderDashboard() {
  const el = document.getElementById('view-content');
  const d = data[cur];
  const totalKnowledge = Math.round(companies.reduce(function(s, c) { return s + c.knowledgeScore; }, 0) / companies.length);
  
  el.innerHTML =
    // MRR
    '<div class="mrr-h">'+
      '<div class="mrr-lb">月經常性收入</div>'+
      '<div class="mrr-row">'+
        '<span class="mrr-n" id="mrr-n">0</span>'+
        '<span class="mrr-ar u"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg><span id="mrr-pct">'+d.pct+'</span>%</span>'+
      '</div>'+
      '<div class="mrr-sub" id="mrr-sub">'+d.sub+'</div>'+
    '</div>'+
    // 2 stat cards
    '<div class="s3" style="grid-template-columns:1fr 1fr">'+
      '<div class="sc-c" style="animation-delay:0s">'+
        '<div class="sh"><span class="lb">活躍客戶</span><span class="chg"><span class="u" id="cust-chg">'+d.custChg+'</span></span></div>'+
        '<div class="nr" id="cust-n">'+d.cust+'</div>'+
        '<div class="gauge"><div class="f" id="cust-g" style="width:'+d.custPct+'%"></div></div>'+
        '<div class="gl" id="cust-gl">目標 3000 · 已達 '+d.custPct+'%</div>'+
      '</div>'+
      '<div class="sc-c" style="animation-delay:0.1s">'+
        '<div class="sh"><span class="lb">平均知識覆蓋</span><span class="chg"><span class="u">'+totalKnowledge+'%</span></span></div>'+
        '<div class="nr" style="font-size:36px">'+totalKnowledge+'<span style="font-size:14px;color:var(--muted)">%</span></div>'+
        '<div class="gauge"><div class="f" style="width:'+totalKnowledge+'%;background:linear-gradient(90deg,var(--accent),var(--rose))"></div></div>'+
        '<div class="gl">'+companies.filter(function(c){return c.status==='complete';}).length+'/'+companies.length+' 家公司研究完成</div>'+
      '</div>'+
    '</div>'+
    // Company list
    '<div class="pn" style="margin-bottom:12px">'+
      '<div class="ph"><h3>研究公司</h3><span class="ct" id="co-ct">'+companies.length+' 家</span></div>'+
      '<div class="pb" id="co-l"></div>'+
    '</div>'+
    // Panels
    '<div class="d2">'+
      '<div class="pn"><div class="ph"><h3>AI 發現</h3><span class="ct" id="opp-ct">0</span></div><div class="pb" id="opp-l"></div></div>'+
      '<div class="pn"><div class="ph"><h3>執行中流程</h3><span class="ct" id="wf-ct">0</span></div><div class="pb" id="wf-l"></div></div>'+
    '</div>'+
    // Activity
    '<div class="pn"><div class="ph"><h3>活動</h3><span class="ct">即時</span></div><div class="pb" id="act-l"></div></div>';

  countUp(document.getElementById('mrr-n'), d.mrr, 'K', 600);
  rCoList();  // new function
  rOpps();
  rWfs();
  rActs();
}
```

- [ ] **Step 2: Add `rCoList()` function to render the company table rows**

```js
function rCoList() {
  const el = document.getElementById('co-l');
  if (!el) return;
  document.getElementById('co-ct').textContent = companies.length + ' 家';
  
  // Status label map
  const st = { complete:'已完成', researching:'研究中', queued:'佇列中', error:'錯誤' };
  const stCls = { complete:'dn', researching:'go', queued:'st', error:'no' };
  // We need .no class for error state — add to CSS: .wf-b.no{background:var(--danger-bg);color:var(--danger)}
  
  el.innerHTML = companies.map(function(co) {
    return '<div class="op" data-id="'+co.id+'" onclick="openCompany(\''+co.id+'\')" style="cursor:pointer">'+
      '<div class="op-b"><div class="op-t" style="display:flex;align-items:center;gap:8px">'+
        '<span style="width:10px;height:10px;border-radius:50%;background:'+co.color+';flex-shrink:0"></span>'+
        co.name+
        ' <span style="font-size:10px;color:var(--muted);font-family:var(--font-m);font-weight:400">'+co.industry+'</span>'+
      '</div></div>'+
      '<span class="wf-b '+stCls[co.status]+'" style="cursor:default">'+st[co.status]+'</span>'+
      '<span style="font-family:var(--font-m);font-size:9px;color:var(--muted);min-width:50px;text-align:right">'+co.knowledgeScore+'%</span>'+
      '<span style="font-family:var(--font-m);font-size:9px;color:var(--muted);min-width:40px;text-align:right">'+co.opportunityCount+' 項</span>'+
      '<span style="font-family:var(--font-m);font-size:9px;color:var(--muted);min-width:30px;text-align:right">'+co.lastUpdated+'</span>'+
    '</div>';
  }).join('');
}
```

- [ ] **Step 3: Add CSS for `.wf-b.no` and tweak company list hover**

  Add to the CSS section:
  ```css
  .wf-b.no{background:var(--danger-bg);color:var(--danger)}
  /* Make company list items clickable */
  .op[onclick]{cursor:pointer}
  .op[onclick]:hover{background:var(--bg)}
  ```

- [ ] **Step 4: Add `window.openCompany()` stub function**

```js
// Opens company detail overlay — implemented in Task 4
window.openCompany = function(id) {
  selectedCompany = id;
  switchView('research');
  // Will show detail in an overlay in Task 4
};
```

- [ ] **Step 5: Update setRange() to work with new layout**

  `setRange()` already calls `renderDashboard()`, which now includes `rCoList()`. No changes needed.

- [ ] **Step 6: Update 3-card grid to 2-card in responsive CSS**

  Change the `.s3` grid-template-columns defaults: already 1fr 1fr at 1024px and below. The new grid is always 1fr 1fr (forcing inline style).

---

### Task 3: Rewrite Research View — Knowledge Graph SVG + Research Queue

**Files:**
- Modify: `mrt35y6z-dashboard.html` — replace `renderResearch()` function

**Interfaces:**
- Consumes: `companies` array, `researchQueue` array, `selectedCompany` (Task 1)
- Produces: Knowledge graph SVG rendering + research queue list

**Knowledge graph architecture:**
- Center node = target company (or first company if none selected)
- 5 orbit nodes: 人員, 產品, 競爭者, 客戶, 投資者
- Lines from center to each orbit node that has entities
- Node label + entity count badge
- Hover tooltip showing entity names

**Research queue:**
- Table rows showing each queued/researching company
- Phase label, progress bar, ETA, priority badge
- Start/pause button

- [ ] **Step 1: Replace renderResearch() with knowledge graph + queue**

```js
function renderResearch() {
  const co = selectedCompany ? companies.find(function(c) { return c.id === selectedCompany; }) : companies[0];
  if (!co) { document.getElementById('view-content').innerHTML = '<div class="empty">請先選擇一家公司</div>'; return; }
  
  const el = document.getElementById('view-content');
  el.innerHTML =
    // Top bar
    '<div class="tb" style="margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<span style="width:14px;height:14px;border-radius:50%;background:'+co.color+';flex-shrink:0"></span>'+
        '<h2 style="font-family:var(--font-d);font-size:16px;font-weight:600">'+co.name+'</h2>'+
        '<span style="font-size:11px;color:var(--muted);font-family:var(--font-m)">'+co.industry+'</span>'+
        '<select id="co-select" onchange="switchCompany(this.value)" style="margin-left:8px;padding:2px 8px;border-radius:var(--rm);border:1px solid var(--border);background:var(--surface);font-family:var(--font-m);font-size:10px;color:var(--fg)">'+
          companies.map(function(c) { return '<option value="'+c.id+'"'+(c.id===co.id?' selected':'')+'>'+c.name+'</option>'; }).join('')+
        '</select>'+
      '</div>'+
      '<button class="btn" onclick="window.sim()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>重新研究</button>'+
    '</div>'+
    // Two-column: Knowledge graph + Info panel
    '<div class="d2">'+
      '<div class="pn"><div class="ph"><h3>知識圖譜</h3><span class="ct">'+co.knowledgeScore+'% 覆蓋</span></div><div class="pb" id="kg-container" style="padding:16px;min-height:260px;display:flex;align-items:center;justify-content:center"></div></div>'+
      '<div class="pn"><div class="ph"><h3>公司摘要</h3><span class="ct">'+co.industry+'</span></div><div class="pb" style="padding:12px 16px">'+
        '<div style="margin-bottom:8px"><div style="font-family:var(--font-m);font-size:9px;color:var(--muted);margin-bottom:2px">研究狀態</div><span class="wf-b '+(co.status==='complete'?'dn':co.status==='researching'?'go':'st')+'" style="cursor:default">'+(co.status==='complete'?'已完成':co.status==='researching'?'研究中':'佇列中')+'</span></div>'+
        '<div style="margin-bottom:8px"><div style="font-family:var(--font-m);font-size:9px;color:var(--muted);margin-bottom:2px">知識分數</div><div style="font-family:var(--font-m);font-size:24px;font-weight:600">'+co.knowledgeScore+'<span style="font-size:12px;color:var(--muted)">/'+(co.totalFacets*20)+'</span></div></div>'+
        '<div><div style="font-family:var(--font-m);font-size:9px;color:var(--muted);margin-bottom:2px">已掃描面向</div><div style="font-family:var(--font-m);font-size:14px">'+co.facetsScanned+'/'+co.totalFacets+' <span style="color:var(--muted);font-size:11px">'+['','財務','團隊','產品','市場','營運'][co.facetsScanned]+'</span></div></div>'+
      '</div></div>'+
    '</div>'+
    // Research queue
    '<div class="pn" style="margin-bottom:12px">'+
      '<div class="ph"><h3>研究佇列</h3><span class="ct" id="rq-ct">'+researchQueue.length+' 項</span></div>'+
      '<div class="pb" id="rq-l"></div>'+
    '</div>'+
    // Data sources
    '<div class="pn">'+
      '<div class="ph"><h3>資料來源</h3><span class="ct">4 已連接</span></div>'+
      '<div class="pb">'+
        '<div class="op"><div class="op-b"><div class="op-t">SEC Edgar</div><span class="op-tg a">公開財報</span></div><span style="font-family:var(--font-m);font-size:9px;color:var(--muted)">即時</span></div>'+
        '<div class="op"><div class="op-b"><div class="op-t">Crunchbase</div><span class="op-tg b">公司資料</span></div><span style="font-family:var(--font-m);font-size:9px;color:var(--muted)">每 6h</span></div>'+
        '<div class="op"><div class="op-b"><div class="op-t">LinkedIn</div><span class="op-tg a">人員資料</span></div><span style="font-family:var(--font-m);font-size:9px;color:var(--muted)">每日</span></div>'+
        '<div class="op"><div class="op-b"><div class="op-t">SimilarWeb</div><span class="op-tg c">流量</span></div><span style="font-family:var(--font-m);font-size:9px;color:var(--muted)">每週</span></div>'+
      '</div>'+
    '</div>';

  drawKnowledgeGraph(co);
  rResearchQueue();
}
```

- [ ] **Step 2: Add `window.switchCompany()` helper**

```js
window.switchCompany = function(id) {
  selectedCompany = id;
  renderResearch();
};
```

- [ ] **Step 3: Add `drawKnowledgeGraph(co)` function**

```js
function drawKnowledgeGraph(co) {
  const el = document.getElementById('kg-container');
  if (!el) return;
  
  const w = 500, h = 240;
  const cx = 150, cy = 120; // center
  const rOrbit = 90;       // orbit radius
  
  // Categories that exist (have entities)
  const cats = [
    { key:'people', label:'人員', color:co.color },
    { key:'products', label:'產品', color:'#10b981' },
    { key:'competitors', label:'競爭者', color:'#ef4444' },
    { key:'customers', label:'客戶', color:'#8db4d9' },
    { key:'investors', label:'投資者', color:'#8b5cf6' },
  ];
  
  // Only show categories with entities
  const activeCats = cats.filter(function(c) { return co.entities[c.key] && co.entities[c.key].length > 0; });
  const angleStep = (2 * Math.PI) / Math.max(activeCats.length, 1);
  
  let lines = '';
  let nodes = '';
  
  activeCats.forEach(function(cat, i) {
    const angle = angleStep * i - Math.PI / 2;
    const nx = cx + rOrbit * Math.cos(angle);
    const ny = cy + rOrbit * Math.sin(angle);
    const entities = co.entities[cat.key] || [];
    
    // Line from center to orbit node
    lines += '<line x1="'+cx+'" y1="'+cy+'" x2="'+nx+'" y2="'+ny+'" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3"/>';
    
    // Orbit node circle
    const rNode = Math.max(18, 14 + entities.length * 3);
    nodes += '<circle cx="'+nx+'" cy="'+ny+'" r="'+rNode+'" fill="'+cat.color+'" opacity="0.15" stroke="'+cat.color+'" stroke-width="1.5"/>';
    
    // Label
    nodes += '<text x="'+nx+'" y="'+(ny- rNode - 6)+'" text-anchor="middle" font-family="var(--font-m)" font-size="8" fill="var(--muted)">'+cat.label+'</text>';
    
    // Entity count badge
    nodes += '<text x="'+nx+'" y="'+(ny+3)+'" text-anchor="middle" font-family="var(--font-m)" font-size="9" font-weight="600" fill="var(--fg)">'+entities.length+'</text>';
    
    // Hover tooltip area
    const tipText = entities.map(function(e) { return e.name + ' · ' + e.type; }).join('\\n');
    nodes += '<circle cx="'+nx+'" cy="'+ny+'" r="'+(rNode+4)+'" fill="transparent" '+
      'onmousemove="chartTip(event,\''+cat.label+'\',\''+tipText.replace(/'/g,"\\'")+'\')" onmouseleave="chartTipHide()" style="cursor:pointer"/>';
  });
  
  // Center node
  const centerR = 28;
  nodes += '<circle cx="'+cx+'" cy="'+cy+'" r="'+centerR+'" fill="'+co.color+'" opacity="0.2" stroke="'+co.color+'" stroke-width="2"/>';
  nodes += '<text x="'+cx+'" y="'+(cy+3)+'" text-anchor="middle" font-family="var(--font-m)" font-size="8" font-weight="600" fill="var(--fg)">'+co.initials+'</text>';
  
  el.innerHTML = '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" style="width:100%;height:100%;max-height:240px">'+
    lines + nodes +
  '</svg>';
  
  // If no entities at all, show empty state
  if (activeCats.length === 0) {
    el.innerHTML = '<div class="empty">尚無知識圖譜資料 — 請先執行研究</div>';
  }
}
```

- [ ] **Step 4: Add `rResearchQueue()` function**

```js
function rResearchQueue() {
  const el = document.getElementById('rq-l');
  if (!el) return;
  document.getElementById('rq-ct').textContent = researchQueue.length + ' 項';
  
  const priCls = { high:'a', normal:'c', low:'c' };
  const priLb = { high:'高優先', normal:'一般', low:'一般' };
  
  el.innerHTML = researchQueue.map(function(task) {
    return '<div class="wf">'+
      '<div class="wf-ic '+(task.progress > 0 ? 'go' : 'st')+'">'+
        (task.progress > 0
          ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
          : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>')+
      '</div>'+
      '<div class="wf-i"><div class="wf-n">'+task.co+'</div><div class="wf-m">'+task.phase+' · '+task.eta+'</div></div>'+
      '<div style="width:80px">'+
        '<div style="height:4px;background:var(--bg);border-radius:2px;overflow:hidden;margin-bottom:2px">'+
          '<div style="height:100%;width:'+task.progress+'%;background:linear-gradient(90deg,var(--accent),var(--success));border-radius:2px;transition:width 0.4s ease"></div>'+
        '</div>'+
        '<span style="font-family:var(--font-m);font-size:7px;color:var(--muted)">'+task.progress+'%</span>'+
      '</div>'+
      '<span class="op-tg '+priCls[task.priority]+'">'+priLb[task.priority]+'</span>'+
    '</div>';
  }).join('');
  
  if (researchQueue.length === 0) {
    el.innerHTML = '<div class="empty">佇列中無研究任務</div>';
  }
}
```

- [ ] **Step 5: Add CSS for `.wf-b.no` (check if already added in Task 2)**

---

### Task 4: Company Drill-Down Panel

**Files:**
- Modify: `mrt35y6z-dashboard.html` — add overlay functions and `openCompany()` full implementation

**Interfaces:**
- Consumes: `companies` array, `openCompany()` stub (Task 2)
- Produces: Slide-in overlay panel showing company details

**Panel content:**
- Company name + industry + status badge
- Knowledge score breakdown (faceted)
- Entity list per category (people, products, competitors, etc.)
- Per-company opportunities (click to approve/dismiss)
- Per-company workflow recommendations
- Research history timeline (last 5 actions)

- [ ] **Step 1: Replace `openCompany()` stub with full overlay**

```js
window.openCompany = function(id) {
  selectedCompany = id;
  const co = companies.find(function(c) { return c.id === id; });
  if (!co) return;
  
  // Build overlay
  const overlay = document.createElement('div');
  overlay.id = 'co-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100;background:rgba(0,0,0,0.3);display:flex;align-items:flex-start;justify-content:center;padding:40px 20px;animation:fi 0.2s ease forwards';
  
  overlay.innerHTML =
    '<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);width:100%;max-width:680px;max-height:85vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.2)">'+
      // Header
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface);z-index:1">'+
        '<div style="display:flex;align-items:center;gap:10px">'+
          '<span style="width:16px;height:16px;border-radius:50%;background:'+co.color+';flex-shrink:0"></span>'+
          '<h2 style="font-family:var(--font-d);font-size:16px;font-weight:600">'+co.name+'</h2>'+
          '<span style="font-size:10px;color:var(--muted);font-family:var(--font-m)">'+co.industry+'</span>'+
          '<span class="wf-b '+(co.status==='complete'?'dn':co.status==='researching'?'go':'st')+'" style="cursor:default">'+
            (co.status==='complete'?'已完成':co.status==='researching'?'研究中':'佇列中')+
          '</span>'+
        '</div>'+
        '<button onclick="closeCompanyOverlay()" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--muted)">'+
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'+
        '</button>'+
      '</div>'+
      // Body
      '<div style="padding:16px 20px">'+
        // Stats row
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">'+
          '<div style="background:var(--bg);border-radius:var(--rm);padding:10px;text-align:center"><div style="font-family:var(--font-m);font-size:9px;color:var(--muted);margin-bottom:2px">知識分數</div><div style="font-family:var(--font-m);font-size:20px;font-weight:600">'+co.knowledgeScore+'%</div></div>'+
          '<div style="background:var(--bg);border-radius:var(--rm);padding:10px;text-align:center"><div style="font-family:var(--font-m);font-size:9px;color:var(--muted);margin-bottom:2px">發現機會</div><div style="font-family:var(--font-m);font-size:20px;font-weight:600">'+co.opportunities.length+'</div></div>'+
          '<div style="background:var(--bg);border-radius:var(--rm);padding:10px;text-align:center"><div style="font-family:var(--font-m);font-size:9px;color:var(--muted);margin-bottom:2px">面向掃描</div><div style="font-family:var(--font-m);font-size:20px;font-weight:600">'+co.facetsScanned+'/'+co.totalFacets+'</div></div>'+
        '</div>'+
        // Entities section
        getEntitySectionsHTML(co) +
        // Opportunities section
        '<div style="margin-top:12px"><h4 style="font-family:var(--font-d);font-size:12px;font-weight:600;margin-bottom:6px">發現機會</h4>'+
          (co.opportunities.length === 0 ? '<div class="empty" style="padding:12px">尚未發現機會</div>' :
            co.opportunities.map(function(o) {
              const st = o.st === 'ok' ? '<span class="op-tg b" style="margin-left:4px">已核准</span>' : o.st === 'x' ? '<span class="op-tg c" style="margin-left:4px">已忽略</span>' : '';
              return '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.03)">'+
                '<div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:500">'+o.t+' <span class="op-tg '+o.g+'">'+o.tl+'</span>'+st+'</div></div>'+
                (o.st !== 'ok' && o.st !== 'x' ? '<button class="ok" onclick="window.ap('+o.id+')" style="width:22px;height:22px;border-radius:50%;border:1px solid var(--border);background:var(--surface);cursor:pointer;display:grid;place-items:center;color:var(--success)">'+
                  '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg></button>' : '')+
              '</div>';
            }).join('')
          )+
        '</div>'+
      '</div>'+
    '</div>';
  
  document.body.appendChild(overlay);
  document.addEventListener('keydown', closeOverlayKey);
};

function getEntitySectionsHTML(co) {
  const cats = [
    { key:'people', label:'人員', icon:'👤' },
    { key:'products', label:'產品', icon:'📦' },
    { key:'competitors', label:'競爭者', icon:'🏢' },
    { key:'customers', label:'客戶', icon:'🤝' },
    { key:'investors', label:'投資者', icon:'💰' },
  ];
  
  return cats.map(function(cat) {
    const entities = co.entities[cat.key] || [];
    if (entities.length === 0) return '';
    return '<div style="margin-bottom:10px">'+
      '<h4 style="font-family:var(--font-d);font-size:11px;font-weight:600;margin-bottom:4px">'+cat.label+' <span style="font-weight:400;color:var(--muted)">('+entities.length+')</span></h4>'+
      '<div style="display:flex;flex-wrap:wrap;gap:4px">'+
        entities.map(function(e) {
          return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:var(--rf);background:var(--bg);font-family:var(--font-m);font-size:9px;color:var(--fg)">'+
            '<span style="width:4px;height:4px;border-radius:50%;background:'+co.color+'"></span>'+
            e.name+' · '+e.type+
          '</span>';
        }).join('')+
      '</div>'+
    '</div>';
  }).join('');
}

window.closeCompanyOverlay = function() {
  const overlay = document.getElementById('co-overlay');
  if (overlay) { overlay.remove(); }
  document.removeEventListener('keydown', closeOverlayKey);
};

function closeOverlayKey(e) {
  if (e.key === 'Escape') closeCompanyOverlay();
}
```

- [ ] **Step 2: Update `openCompany()` in Task 2 to be a full implementation (not just stub)**

- [ ] **Step 3: Verify keyboard navigation (Escape closes overlay)**

---

### Task 5: Cross-Company Filtering for Opportunities & Workflows

**Files:**
- Modify: `mrt35y6z-dashboard.html` — update `renderOpportunities()`, `renderWorkflowsView()`, and `rOpps()`/`rWfs()` functions

**Interfaces:**
- Consumes: `companies` array (Task 1), existing `opps`/`wfs` arrays
- Produces: Filtered views by company

- [ ] **Step 1: Add company filter to opportunities view**

  Add a company dropdown select in `renderOpportunities()`:
```js
function renderOpportunities() {
  const el = document.getElementById('view-content');
  const a = opps.filter(function(o) { return o.st !== 'x'; });
  el.innerHTML =
    '<div class="tb" style="margin-bottom:12px">'+
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
        '<h2 style="font-family:var(--font-d);font-size:16px;font-weight:600">發現機會</h2>'+
        '<span class="ct" style="font-family:var(--font-m);font-size:10px;color:var(--muted);background:var(--bg);padding:2px 8px;border-radius:var(--rf)">'+a.length+' 項</span>'+
        // Company filter
        '<select id="opp-co-filter" onchange="rOppsFull(oppFilter)" style="padding:2px 8px;border-radius:var(--rm);border:1px solid var(--border);background:var(--surface);font-family:var(--font-m);font-size:10px;color:var(--fg)">'+
          '<option value="all">全部公司</option>'+
          companies.map(function(c) { return '<option value="'+c.id+'">'+c.name+'</option>'; }).join('')+
        '</select>'+
      '</div>'+
      '<div style="display:flex;gap:4px">'+
        '<button class="btn btn-p" onclick="filterOpps(\'all\')">全部</button>'+
        '<button class="btn" onclick="filterOpps(\'pending\')">待處理</button>'+
        '<button class="btn" onclick="filterOpps(\'approved\')">已核准</button>'+
      '</div>'+
    '</div>'+
    '<div class="pn" id="opp-full-list">'+
      '<div class="pb" id="opp-full-l"></div>'+
    '</div>';
  rOppsFull(oppFilter);
}
```

- [ ] **Step 2: Update `rOppsFull()` to filter by company**

```js
function rOppsFull(f) {
  const el = document.getElementById('opp-full-l');
  if (!el) return;
  
  // Get selected company filter
  const coFilter = document.getElementById('opp-co-filter');
  const coId = coFilter ? coFilter.value : 'all';
  
  var sourceOpps = opps;
  // If a specific company is selected, use that company's opportunities
  if (coId !== 'all') {
    var co = companies.find(function(c) { return c.id === coId; });
    sourceOpps = co ? co.opportunities : opps;
  }
  
  var list = f === 'all' ? sourceOpps : f === 'approved' ? sourceOpps.filter(function(o) { return o.st === 'ok'; }) : sourceOpps.filter(function(o) { return o.st === '-' || o.st === undefined; });
  
  if (!list.length) { el.innerHTML = '<div class="empty">無符合條件項目</div>'; return; }
  el.innerHTML = list.map(function(o) {
    const off = 94.25 - (94.25 * o.c / 100);
    const stLabel = o.st === 'ok' ? '<span class="op-tg b">已核准</span>' : o.st === 'x' ? '<span class="op-tg c">已忽略</span>' : '';
    return '<div class="op" data-id="'+o.id+'">'+
      '<div class="opr"><svg width="32" height="32" viewBox="0 0 32 32"><circle class="ob" cx="16" cy="16" r="15"/><circle class="of" cx="16" cy="16" r="15" stroke-dasharray="94.25" stroke-dashoffset="'+off+'"/></svg><span class="opv">'+o.c+'%</span></div>'+
      '<div class="op-b"><div class="op-t">'+o.t+'</div><span class="op-tg '+o.g+'">'+o.tl+'</span> '+stLabel+'</div>'+
      '<div class="op-ac">'+
        (o.st !== 'ok' ? '<button class="ok" onclick="window.ap('+o.id+')" title="核准"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg></button>' : '')+
        (o.st !== 'x' ? '<button class="no" onclick="window.di('+o.id+')" title="忽略"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' : '')+
      '</div></div>';
  }).join('');
}
```

- [ ] **Step 3: Similarly add company filter to workflows view**

- [ ] **Step 4: Update global `opps`/`wfs` references to include company-scoped ops**

  The global `window.ap()` and `window.di()` functions already work — they modify by ID. Add company awareness so approved opportunities update the company's data too.

---

### Task 6: Final Polish — Remove Old Sections, Fix All References

**Files:**
- Modify: `mrt35y6z-dashboard.html` — cleanup pass

- [ ] **Step 1: Remove revenue breakdown chart CSS and JS**

  Remove `.br`, `.br-item`, `.br-bar`, `.br-lb` CSS classes and `drawRevBreakdown()` function.

- [ ] **Step 2: Remove renewals CSS and JS**

  Remove `.rnl`, `.rn`, `.rn-d`, `.rn-i`, `.rn-n`, `.rn-m`, `.rn-tg`, `.rn-ac` CSS classes, `renewals` data array, `rRns()` function, `contactRenewal()`, `dismissRenewal()` functions.

- [ ] **Step 3: Verify all chart references work**

  Keep `drawMRRTrend()` but the chart container `#mrr-chart-c` no longer exists in dashboard view (removed). Move MRR trend chart to be a small inline chart inside the MRR card, or remove it since user only asked to keep MRR number + growth.

- [ ] **Step 4: Remove `drawRevBreakdown` call from `renderDashboard()`**

- [ ] **Step 5: Update `setRange()` — remove `rRns()` call**

- [ ] **Step 6: Verify all view switching works end-to-end**

  - Dashboard: MRR + customers + company list + discoveries + workflows + activity
  - Research: company dropdown + knowledge graph + summary + queue + data sources
  - Opportunities: cross-company filter + status filter
  - Workflows: company filter + toggle + add

- [ ] **Step 7: Verify responsive layout at 1024px, 768px, 480px**

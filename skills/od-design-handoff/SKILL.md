---
name: od-design-handoff
zh_name: "Open Design 设计交接"
description: |
  Bridge Claude Code coding sessions to Open Design for automated UI design.
  One round trip: send design brief + brand choice → Open Design generates
  HTML/CSS → collect result → integrate into project.
  No port config, no manual URL paste — the skill handles discovery.
zh_description: |
  将 Claude Code 编程项目递送给 Open Design 完成 UI 设计。
  一来一回：发设计简报 + 选品牌风格 → Open Design 生成 HTML/CSS →
  收回产物 → 集成到项目。无需配置端口参数。
triggers:
  - "design handoff"
  - "od design"
  - "open design"
  - "design this UI"
  - "generate UI design"
  - "ui handoff"
  - "设计交接"
  - "生成UI"
  - "设计界面"
od:
  mode: utility
  category: design-systems
---

# od-design-handoff

One round trip: describe your UI, pick a brand, get production HTML/CSS back.
No ports to configure, no browser tabs to manage.

## When to use

The user asks Claude Code to *design* a UI (not just write code):
- "Design a landing page for my SaaS"
- "Generate a dashboard with Stripe's brand style"
- "I need a settings panel, Linear design system"

## Workflow (Phase 1 — curl + bash, uses existing OD APIs)

### Step 1 — Find the Open Design daemon

```bash
# Option A: env var set by daemon spawn
echo "$OD_DAEMON_URL"

# Option B: CLI
od daemon url 2>/dev/null

# Option C: known location
curl -s http://127.0.0.1:7456/api/status 2>/dev/null
```

Store as `$OD_URL`. If OD is not running, tell the user how to start it.

### Step 2 — Pick a design system

Ask: "Which brand style?" Show top options.

```bash
curl -s "$OD_URL/api/design-systems" | python -c "
import json,sys
for d in json.load(sys.stdin)[:12]:
    print(f'  {d[\"id\"]}')
"
```

Common choices: `stripe`, `linear`, `vercel`, `airbnb`, `apple`, `anthropic`, `notion`.

### Step 3 — Create an OD project

```bash
RESP=$(curl -s -X POST "$OD_URL/api/projects" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"$PROJECT_NAME\",\"designSystemId\":\"$DESIGN_SYSTEM\",\"skillId\":\"canvas-design\"}")
PROJECT_ID=$(echo "$RESP" | python -c "import json,sys; print(json.load(sys.stdin)['id'])")
```

### Step 4 — Write the design brief

Synthesize a brief from the user's request:
- Page type, key sections, content, constraints
- Use the template at `assets/design-brief-template.md`  
- Write it to the project's working directory:

```bash
cat > "$OD_PROJECT_DIR/design-brief.md" << 'BRIEF'
# Design Brief
...
BRIEF
```

(The `OD_PROJECT_DIR` is returned in the project creation response.)

### Step 5 — Launch the design agent

```bash
od run "$PROJECT_ID" --prompt "Read design-brief.md, then create the UI using the active design system. Output HTML/CSS artifacts."
```

Wait for completion. The `od run` command blocks until the agent finishes or times out.

### Step 6 — Collect artifacts

```bash
# List generated files
curl -s "$OD_URL/api/projects/$PROJECT_ID/files" | python -c "
import json,sys
for f in json.load(sys.stdin):
    print(f['path'], f['size'])
"
```

### Step 7 — Integrate into user's project

Read the generated files and copy or adapt into the user's codebase.

## Workflow (Phase 2 — MCP server `od-mcp`)

Once `@open-design/od-mcp` is installed, Steps 2–6 collapse to one tool call:

```
Tool: od_design_handoff
  designSystemId: "stripe"
  projectName: "SaaS Landing"
  brief: "# Design Brief\n\n## Page Type\n..."
```

Returns:
```json
{
  "status": "completed",
  "files": [
    {"path": "artifacts/index.html", "size": 4521},
    {"path": "artifacts/index.css", "size": 2130}
  ],
  "projectDir": "/path/to/.od/projects/abc-123"
}
```

Then read the files with `read_file` and integrate.

## Design brief template

```markdown
# Design Brief

## Page Type
[landing page | dashboard | settings | blog | docs | other]

## Brand Style
[chosen design system name]

## Key Sections
1. [Name] — [purpose, content]
2. ...

## Constraints
- Viewport: [desktop-first | mobile-first | responsive]
- Color mode: [light | dark | both]
- Max width: [number || full-width]

## Content
[Real copy from the user's description]
```

See `assets/design-brief-template.md` for the full template.

## Error handling

| Symptom | Cause | Fix |
|---------|-------|-----|
| `curl` connection refused | Daemon not running | Tell user: `pnpm tools-dev start --prod` |
| Design system not found | Typo or missing brand | Re-run Step 2, list available IDs |
| Design agent timeout | Complex brief, slow model | Increase wait, simplify brief |
| Artifacts directory empty | Agent didn't write files | Check agent logs, retry with simpler prompt |

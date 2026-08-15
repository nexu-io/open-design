---
name: stitch-loop
description: |
  Teaches agents to iteratively build websites using Stitch with an autonomous baton-passing loop pattern
  (Vendored from the stitch-utilities plugin of google-labs-code/stitch-skills; original
  skill id `stitch-loop`. Requires the Stitch MCP server to be configured — see
  https://github.com/google-labs-code/stitch-skills for setup.)
triggers:
  - "stitch loop"
  - "design to code"
  - "design iteration"
  - "fidelity loop"
  - "baton passing loop"
od:
  mode: utility
  category: design-systems
  upstream: "https://github.com/google-labs-code/stitch-skills"
---

# Stitch Build Loop

You are an **autonomous frontend builder** participating in an iterative site-building loop. Your goal is to generate a page using Stitch, integrate it into the site, and prepare instructions for the next iteration.

## Overview

The Build Loop pattern enables continuous, autonomous website development through a "baton" system. Each iteration:
1. Reads the current task from a baton file (`.stitch/next-prompt.md`)
2. Generates a page using Stitch MCP tools
3. Integrates the page into the site structure
4. Writes the next task to the baton file for the next iteration

## Prerequisites

**Required:**
- Access to the Stitch MCP Server
- A Stitch project (existing or will be created)
- A `.stitch/DESIGN.md` file (generate one using the `design-md` skill if needed)
- A `.stitch/SITE.md` file documenting the site vision and roadmap

**Optional:**
- Chrome DevTools MCP Server — enables visual verification of generated pages

## The Baton System

The `.stitch/next-prompt.md` file acts as a relay baton between iterations:

```markdown
---
page: about
---
A page describing how jules.top tracking works.

**DESIGN SYSTEM (REQUIRED):**
[Copy from .stitch/DESIGN.md Section 6]

**Page Structure:**
1. Header with navigation
2. Explanation of tracking methodology
3. Footer with links
```

**Critical rules:**
- The `page` field in YAML frontmatter determines the output filename
- The prompt content must include the design system block from `.stitch/DESIGN.md`
- You MUST update this file before completing your work to continue the loop

## Execution Protocol

### Step 1: Read the Baton

Parse `.stitch/next-prompt.md` to extract:
- **Page name** from the `page` frontmatter field
- **Prompt content** from the markdown body

### Step 2: Consult Context Files

Before generating, read these files:

| File | Purpose |
|------|---------|
| `.stitch/SITE.md` | Site vision, **Stitch Project ID**, existing pages (sitemap), roadmap |
| `.stitch/DESIGN.md` | Required visual style for Stitch prompts |

**Important checks:**
- Section 4 (Sitemap) — Do NOT recreate pages that already exist
- Section 5 (Roadmap) — Pick tasks from here if backlog exists
- Section 6 (Creative Freedom) — Ideas for new pages if roadmap is empty

### Step 3: Generate with Stitch

Use the Stitch MCP tools to generate the page:

1. **Discover namespace**: Run `list_tools` to find the Stitch MCP prefix
2. **Get or create project**: 
   - If `.stitch/metadata.json` exists, use the `projectId` from it
   - Otherwise, call `[prefix]:create_project`, then call `[prefix]:get_project` to retrieve full project details, and save them to `.stitch/metadata.json` (see schema below)
   - After generating each screen, call `[prefix]:get_project` again and update the `screens` map in `.stitch/metadata.json` with each screen's full metadata (id, sourceScreen, dimensions, canvas position)
3. **Generate screen**: Call `[prefix]:generate_screen_from_text` with:
   - `projectId`: The project ID
   - `prompt`: The full prompt from the baton (including design system block)
   - `deviceType`: `DESKTOP` (or as specified)
4. **Retrieve assets**: Before downloading, check if `.stitch/designs/{page}.html` and `.stitch/designs/{page}.png` already exist:
   - **If files exist**: Ask the user whether to refresh the designs from the Stitch project or reuse the existing local files. Only re-download if the user confirms.
   - **If files do not exist**: Proceed with download:
     - `htmlCode.downloadUrl` — Download and save as `.stitch/designs/{page}.html`
      - `screenshot.downloadUrl` — Append `=w{width}` to the URL before downloading, where `{width}` is the `width` value from the screen metadata (Google CDN serves low-res thumbnails by default). Save as `.stitch/designs/{page}.png`

### Step 4: Integrate into Site

1. Move generated HTML from `.stitch/designs/{page}.html` to `site/public/{page}.html`
2. Fix any asset paths to be relative to the public folder
3. Update navigation:
   - Find existing placeholder links (e.g., `href="#"`) and wire them to the new page
   - Add the new page to the global navigation if appropriate
4. Ensure consistent headers/footers across all pages

### Step 4.5: Visual Verification (Optional)

If the **Chrome DevTools MCP Server** is available, verify the generated page:

1. **Check availability**: Run `list_tools` to see if `chrome*` tools are present
2. **Start dev server**: Use Bash to start a local server (e.g., `npx serve site/public`)
3. **Navigate to page**: Call `[chrome_prefix]:navigate` to open `http://localhost:3000/{page}.html`
4. **Capture screenshot**: Call `[chrome_prefix]:screenshot` to capture the rendered page
5. **Visual comparison**: Compare against the Stitch screenshot (`.stitch/designs/{page}.png`) for fidelity
6. **Stop server**: Terminate the dev server process

> **Note:** This step is optional. If Chrome DevTools MCP is not installed, skip to Step 5.

### Step 5: Update Site Documentation

Modify `.stitch/SITE.md`:
- Add the new page to Section 4 (Sitemap) with `[x]`
- Remove any idea you consumed from Section 6 (Creative Freedom)
- Update Section 5 (Roadmap) if you completed a backlog item

### Step 6: Prepare the Next Baton (Critical)

**You MUST update `.stitch/next-prompt.md` before completing.** This keeps the loop alive.

1. **Decide the next page**: 
   - Check `.stitch/SITE.md` Section 5 (Roadmap) for pending items
   - If empty, pick from Section 6 (Creative Freedom)
   - Or invent something new that fits the site vision
2. **Write the baton** with proper YAML frontmatter:

```markdown
---
page: achievements
---
A competitive achievements page showing developer badges and milestones.

**DESIGN SYSTEM (REQUIRED):**
[Copy the entire design system block from .stitch/DESIGN.md]

**Page Structure:**
1. Header with title and navigation
2. Badge grid showing unlocked/locked states
3. Progress bars for milestone tracking
```

## File Structure Reference

```
project/
├── .stitch/
│   ├── metadata.json   # Stitch project & screen IDs (persist this!)
│   ├── DESIGN.md       # Visual design system (from design-md skill)
│   ├── SITE.md         # Site vision, sitemap, roadmap
│   ├── next-prompt.md  # The baton — current task
│   └── designs/        # Staging area for Stitch output
│       ├── {page}.html
│       └── {page}.png
└── site/public/        # Production pages
    ├── index.html
    └── {page}.html
```

### `.stitch/metadata.json` Schema

This file persists all Stitch identifiers so future iterations can reference them for edits or variants. Populate it by calling `[prefix]:get_project` after creating a project or generating screens.

```json
{
  "name": "projects/6139132077804554844",
  "projectId": "6139132077804554844",
  "title": "My App",
  "visibility": "PRIVATE",
  "createTime": "2026-03-04T23:11:25.514932Z",
  "updateTime": "2026-03-04T23:34:40.400007Z",
  "projectType": "PROJECT_DESIGN",
  "origin": "STITCH",
  "deviceType": "MOBILE",
  "designTheme": {
    "colorMode": "DARK",
    "font": "INTER",
    "roundness": "ROUND_EIGHT",
    "customColor": "#40baf7",
    "saturation": 3
  },
  "screens": {
    "index": {
      "id": "d7237c7d78f44befa4f60afb17c818c1",
      "sourceScreen": "projects/6139132077804554844/screens/d7237c7d78f44befa4f60afb17c818c1",
      "x": 0,
      "y": 0,
      "width": 390,
      "height": 1249
    },
    "about": {
      "id": "bf6a3fe5c75348e58cf21fc7a9ddeafb",
      "sourceScreen": "projects/6139132077804554844/screens/bf6a3fe5c75348e58cf21fc7a9ddeafb",
      "x": 549,
      "y": 0,
      "width": 390,
      "height": 1159
    }
  },
  "metadata": {
    "userRole": "OWNER"
  }
}
```

| Field | Description |
|-------|-------------|
| `name` | Full resource name (`projects/{id}`) |
| `projectId` | Stitch project ID (from `create_project` or `get_project`) |
| `title` | Human-readable project title |
| `designTheme` | Design system tokens: color mode, font, roundness, custom color, saturation |
| `deviceType` | Target device: `MOBILE`, `DESKTOP`, `TABLET` |
| `screens` | Map of page name → screen object. Each screen includes `id`, `sourceScreen` (resource path for MCP calls), canvas position (`x`, `y`), and dimensions (`width`, `height`) |
| `metadata.userRole` | User's role on the project (`OWNER`, `EDITOR`, `VIEWER`) |

## Orchestration Options

The loop can be driven by different orchestration layers:

| Method | How it works |
|--------|--------------|
| **CI/CD** | GitHub Actions triggers on `.stitch/next-prompt.md` changes |
| **Human-in-loop** | Developer reviews each iteration before continuing |
| **Agent chains** | One agent dispatches to another (e.g., Jules API) |
| **Manual** | Developer runs the agent repeatedly with the same repo |

The skill is orchestration-agnostic — focus on the pattern, not the trigger mechanism.

## Design System Integration

This skill works best with the `design-md` skill:

1. **First time setup**: Generate `.stitch/DESIGN.md` using the `design-md` skill from an existing Stitch screen
2. **Every iteration**: Copy Section 6 ("Design System Notes for Stitch Generation") into your baton prompt
3. **Consistency**: All generated pages will share the same visual language

## Common Pitfalls

- ❌ Forgetting to update `.stitch/next-prompt.md` (breaks the loop)
- ❌ Recreating a page that already exists in the sitemap
- ❌ Not including the design system block from `.stitch/DESIGN.md` in the prompt
- ❌ Leaving placeholder links (`href="#"`) instead of wiring real navigation
- ❌ Forgetting to persist `.stitch/metadata.json` after creating a new project

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Stitch generation fails | Check that the prompt includes the design system block |
| Inconsistent styles | Ensure `.stitch/DESIGN.md` is up-to-date and copied correctly |
| Loop stalls | Verify `.stitch/next-prompt.md` was updated with valid frontmatter |
| Navigation broken | Check all internal links use correct relative paths |

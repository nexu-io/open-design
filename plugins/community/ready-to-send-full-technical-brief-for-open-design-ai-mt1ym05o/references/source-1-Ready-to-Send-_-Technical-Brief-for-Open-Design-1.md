# Ready to Send — Full Technical Brief for Open Design AI

## What this is

A fullstack web app for a NYC real estate agent (Bond New York) to manage rental listing units — write them up, toggle status (App/Rented/Flex/Free Rent), confirm availability, sort, filter, and eventually blast them to clients via Follow Up Boss.

**Published URL:** https://ready-to-send.pplx.app  
**Site ID:** 83655914-6468-4acc-93b0-03353e43d068  

---

## Architecture

### Stack
- **Frontend:** Single `index.html` file (inline CSS + vanilla JS, no framework)
- **Backend:** Node.js Express server (`server.js`) on port 5000
- **Database:** SQLite via `better-sqlite3` (`data.db`)
- **Package:** `"type": "module"` in package.json
- **Dependencies:** express, better-sqlite3, cors, pdf-parse

### File structure
```
ready-to-send/
├── server.js          # Express API + SQLite
├── public/
│   └── index.html     # Entire frontend (HTML + CSS + JS in one file)
├── package.json
├── .gitignore         # ignores node_modules/, data.db, data.db-wal, data.db-shm
└── data.db            # SQLite database (created at runtime)
```

### How the frontend connects to the backend
The `index.html` has this line near the top of its JS:
```javascript
const API_BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') ? '' : '__PORT_5000__';
```
- On localhost: API calls go to `/api/units` (same origin, port 5000)
- On published site: `__PORT_5000__` gets rewritten to the pplx.app proxy path (`/port/5000`)
- **Important:** If you edit index.html in Open Design, do NOT change this line or the `__PORT_5000__` placeholder. The publishing system replaces it automatically.

---

## Database Schema

### Table: `sections`
```sql
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);
```

### Table: `units`
```sql
CREATE TABLE IF NOT EXISTS units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER,
  unit TEXT DEFAULT '',
  address TEXT DEFAULT '',
  beds TEXT DEFAULT '',
  baths REAL DEFAULT 0,
  sqft INTEGER DEFAULT 0,
  price INTEGER DEFAULT 0,
  avail TEXT DEFAULT '',
  avail_sort TEXT DEFAULT '',
  flags TEXT DEFAULT '[]',          -- JSON array, e.g. ["OP","CONDO"]
  highlights TEXT DEFAULT '',
  concession TEXT DEFAULT '',
  links TEXT DEFAULT '[]',           -- JSON array of [label, url] pairs
  status TEXT DEFAULT '',            -- '', 'app', 'rented', 'flex', or 'freerent'
  confirmed_at TEXT DEFAULT '',      -- ISO timestamp or empty string
  sort_order INTEGER DEFAULT 0
);
```

**Current data:** ~80 units across ~14 sections on the live published site (as of Aug 16, 2026). Includes Two Trees Management buildings across Manhattan and Brooklyn.

---

## API Endpoints

### Public (no auth)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/units` | Returns all sections with their units, grouped by section |
| GET | `/api/sections` | Returns all sections (id + name) |

### Admin (requires `X-Admin-Token` header)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/admin/login` | Body: `{password}`, returns `{token}` |
| POST | `/api/units` | Create single unit |
| POST | `/api/units/bulk` | Body: `{units: [...]}`, creates multiple units |
| PUT | `/api/units/:id` | Update unit fields |
| PATCH | `/api/units/:id/status` | Body: `{status: 'app'|'rented'|'flex'|'freerent'|''}` |
| PATCH | `/api/units/:id/confirm` | Body: `{confirmed: true|false}`, sets `confirmed_at` to ISO timestamp or clears it |
| DELETE | `/api/units/:id` | Delete unit |
| POST | `/api/sections` | Create section |
| DELETE | `/api/sections/:id` | Delete section |
| POST | `/api/scrape` | Uses FireCrawl to fetch URL text (auth required) |
| POST | `/api/parse-pdf` | Uses pdf-parse to extract text from uploaded PDF (auth required) |

### Auth mechanism
- Admin password: `bond2026` (hardcoded in server.js as `process.env.ADMIN_PASSWORD || 'bond2026'`)
- On login, server generates a random 32-byte hex token, stores in a `Set` (in-memory, lost on restart)
- Client stores token in `localStorage` and sends via `X-Admin-Token` header
- The `authMiddleware` function checks the header against the Set

### GET /api/units response format
```json
[
  {
    "id": 1,
    "section": "The Ritz — 235 W 48th Street",
    "units": [
      {
        "id": 62,
        "unit": "#30L",
        "address": "235 W 48th Street",
        "beds": "1 BR",
        "baths": 1,
        "sqft": 0,
        "price": 4725,
        "avail": "IMM",
        "availSort": "2026-08-15",
        "flags": ["OP"],
        "highlights": "Corner unit, open concept kitchen...",
        "concession": "1 mo OP on 18-mo lease",
        "links": [["Floor Plan", "https://cleanshot.com/share/6CZTsHTw"]],
        "status": "",
        "confirmed_at": ""
      }
    ]
  }
]
```

---

## Frontend Details (index.html)

### Layout structure
```
<header>
  - Title: "Ready to Send"
  - Subtitle: "Written-up units ready to blast..."
  - Admin button (top right)
  - Filter bar: search input + bed filter chips (All/Studio/1BR/2BR/3BR) + sort dropdown
</header>
<div id="results">
  - Rendered dynamically by JS
  - Contains .building-group > .grid-section-header + .card-grid > .card elements
</div>
```

### Sort dropdown options (current)
1. **Recently added** (default, value="newest") — sorts by `b.id - a.id` (highest ID = most recently added)
2. **Price: low to high** (value="price-asc")
3. **Price: high to low** (value="price-desc")
4. **Availability** (value="avail") — sorts by `availSort` field
5. **Recently confirmed** (value="confirmed") — sorts by `confirmed_at` descending

### Building grouping logic (visual only, not a sort mode)
When sortMode is "newest" or "confirmed":
- Units are grouped by their `address` field
- Groups are sorted by the highest unit ID in each group (most recently added)
- If a group has 1 unit: no building header, just the card
- If a group has 2+ units: shows building header with address + unit count
- **Each building group gets its OWN separate `.card-grid` container** (NOT one unified grid)
When sortMode is price/avail: flat grid, no grouping.

### Card structure (generated by `cardHTML(u, idx)` function)
Each card contains:
- **Header row:** unit number, address, beds/baths, price, avail date
- **Flags:** OP (orange #fff3e0/#e65100), CONDO (blue #e3f2fd/#1565c0), NEW (green) as small colored badges
- **Concession line** (if any)
- **Highlights** text
- **Links:** clickable text links (Floor Plan, 3D Tour, etc.)
- **Status toggles:** "App" (orange), "Rented" (red), "Flex" (light pink #f4b8c4), "Free Rent" (light red #f9827a) — all with strikethrough when active
- **Confirm row:** "Updated today" / "Updated X days ago" badge (green dot) + "Confirm Available" / "Re-confirm" button
- **Admin actions:** Edit, Delete buttons (only in admin mode)
- **Expand/collapse:** card body toggles open/closed

### Status toggles (4 toggles, all work the same way)
- Click any toggle → unit.status = that value, button turns its color, card text gets `text-decoration: line-through` in that color
- Click again to toggle off → status cleared, strikethrough removed
- Calls `PATCH /api/units/:id/status`
- Colors:
  - **App** — orange (#e8902c active, #f0d5a0 border inactive)
  - **Rented** — red (#d92d20 active, #f0c0bd border inactive)
  - **Flex** — light pink (#f4b8c4 active, #f0d0d8 border inactive)
  - **Free Rent** — light red (#f9827a active, #f0c8c4 border inactive)

### Confirm Available button
- Click "Confirm Available" → calls `PATCH /api/units/:id/confirm` with `{confirmed: true}`
- Server stores `confirmed_at` as ISO timestamp (e.g. `2026-08-15T16:03:00.000Z`)
- Button turns green (#2a7a4a), text changes to "Re-confirm"
- Badge appears: green dot + "Updated today" (or "Updated 1 day ago" / "Updated X days ago")
- `relativeTime(iso)` function computes days since confirmation
- Click "Re-confirm" → refreshes timestamp to now, resets to "Updated today"
- Click again to unconfirm → clears `confirmed_at`, removes badge, button back to "Confirm Available"

### Bulk paste modal (3 tabs)
1. **Paste Text tab:** Textarea for pasting raw listing data. "Parse & Preview" button runs `parseUnitFromText()` regex parser. Shows preview list, then "Import X units" button.
2. **Scrape URL tab:** URL input, calls `POST /api/scrape` (FireCrawl), then parses the fetched text.
3. **Upload PDF tab:** File input, calls `POST /api/parse-pdf`, then parses extracted text.

### The regex parser (`parseUnitFromText` function) — KNOWN WEAKNESS
Current parser uses regex to extract:
- Price: `$X,XXX` format
- Beds: `Studio`, `1BR`, `1 BR`, `2 bed`, etc.
- Baths: `1BA`, `1 BA`, `1.5 bath`, etc.
- Unit: `#XXXX`, `Unit XXXX`, `Apt XXXX`
- Availability: `avail Sep 4`, `Avail 10/8`, `IMM`
- Concessions: `1/2 mo OP`, `OP`, `1 mo free`
- Links: any URLs in the text
- NYC addresses: number + direction (W/E/N/S) + street name + St/Ave/Blvd

**What it CANNOT handle (and why the user is frustrated):**
- Multi-line OLR data with building descriptions
- Condo sublet format: `ID Address Unit BuildingCode Beds Rooms/Sqft Price OP Expiration Listed Status Excl. Agent Management`
- Cleanshot links mixed with listing data
- 3D tour links on separate lines
- Building-wide concession headers (e.g. "ONLY 1MO OP ON 18 MONTH LEASES!!")
- Free-text descriptions with amenities listed inline

**The better approach (already working):** User pastes messy data in chat, the AI (Perplexity Computer) parses it using natural language understanding + NYC real estate knowledge, then pushes structured units to the API via curl. This worked perfectly for the Ritz/OLR data.

### Admin mode
- Click "Admin" button → password prompt → calls `POST /api/admin/login`
- Token stored in `localStorage` as `adminToken`
- Body gets `admin-mode` class → shows edit/delete buttons on cards, section admin buttons, "Add Section" button, "Add Unit" button, bulk paste button
- `adminHeaders()` function returns `{ 'Content-Type': 'application/json', 'X-Admin-Token': adminToken }`
- Admin can: add units, edit units (all fields), delete units, add sections, delete sections, toggle status, confirm availability, bulk paste

### Key CSS classes
- `--accent: oklch(0.55 0.14 150)` — GREEN (restored Aug 16, was blue 260.6)
- `--accent-text: oklch(0.45 0.14 150)` — GREEN
- `--accent-soft: oklch(0.93 0.04 150)` — GREEN soft
- `--bg: #f8f9fa` (page background)
- `--card-bg: #ffffff`
- `--border: #e0e0e0`
- `--text: #1a1a1a`
- `--text-muted: #666`
- Confirm button green: `#2a7a4a`
- `.building-group { width: 100%; }` — ensures grid fills container width
- `.card-grid { width: 100%; }` — ensures 3-col grid doesn't collapse left
- `main { max-width: 1400px; }` (widened from 1180px)
- `.head-inner { max-width: 1400px; }` (widened to match)
- Grid: `grid-template-columns: repeat(3, 1fr)` with tablet (2 cols at 900px) and mobile (1 col)
- Building grouping: separate grids per building (NOT unified), each building gets own `.card-grid` inside `.building-group` wrapper
- CONCESSION badge: REMOVED from cards (concession text still shows as line item if present)
- Status toggles: App=#e8902c (orange), Rented=#d92d20 (red), Flex=#f4b8c4 (light pink), Free Rent=#f9827a (light red)
- Key CSS classes:
  - `.card-grid` — the grid container for cards. Set to `grid-template-columns: repeat(3, 1fr)` with tablet breakpoint at 2 columns (900px) and mobile at 1 column.
- `.card` — individual unit card
- `.building-group` — wrapper for a building's separate grid section
- `.grid-section-header` — building header (h2 + unit count), shown only when 2+ units share an address
- `.confirm-row` — container for confirm badge + button
- `.confirm-btn` — green button, `.confirmed` class when active
- `.confirm-badge` — green dot + relative time text
- `.status-toggle` — App/Rented/Flex/Free Rent buttons; `.app` = orange, `.rented` = red, `.flex` = pink, `.freerent` = light red
- `.card[data-status="..."]` — triggers strikethrough with matching color per status
- `.flag` — small badge; `.flag-op` = orange, `.flag-condo` = blue, `.flag-new` = green

### Key JS functions
- `fetchData()` — loads units + sections from API, calls `render()`
- `render()` — main render function, handles filtering, sorting, grouping, and HTML generation
- `cardHTML(u, idx)` — generates HTML for a single card
- `toggleStatus(id, status)` — calls PATCH /api/units/:id/status, updates UI in-place
- `toggleConfirm(id)` — calls PATCH /api/units/:id/confirm, updates UI in-place
- `relativeTime(iso)` — converts ISO timestamp to "Updated today" / "Updated X days ago"
- `parseUnitFromText(text)` — regex parser for bulk paste (weak, see above)
- `openModal('bulk-modal')` / `closeModal('bulk-modal')` — bulk paste modal control
- `openUnitModal(unit)` / `saveUnit()` — add/edit unit form
- `adminHeaders()` — returns auth headers
- `toggleAdmin()` — login/logout flow
- `openSectionModal()` — create new section

---

## What Works (confirmed)

1. **Backend API** — all endpoints functional, tested via curl
2. **Database** — ~80 units across ~14 sections including Mercedes House (550 W 54th), One South First (Williamsburg), 300 Ashland Place (Fort Greene), 30 Washington Street (DUMBO), Court House Apartments (Downtown BK), 325 Kent Avenue (Williamsburg). Data persists across redeployments on published site.
3. **Admin auth** — login works, token system works
4. **Status toggles** — App (orange), Rented (red), Flex (pink), Free Rent (light red) — all with strikethrough, tested and deployed
5. **Confirm Available button** — stores ISO timestamp, shows "Updated today/days ago", re-confirm refreshes, tested and deployed
6. **Sort: Recently added** — default sort, sorts by unit ID descending (most recently added first), tested and deployed
7. **Building visual grouping** — groups by address, shows header only when 2+ units share address, building groups ordered by newest unit, each group gets its own separate grid, tested and deployed
8. **Grid: 3 columns** — `repeat(3, 1fr)` with tablet (2 cols at 900px) and mobile (1 col) breakpoints, tested and deployed
9. **Flags** — OP (orange), CONDO (blue), NEW (green) badges, comma-separated in admin form, tested and deployed. CONCESSION badge has been REMOVED from cards.
10. **Publishing** — site published at https://ready-to-send.pplx.app, republishing preserves existing data.db
11. **API proxy** — published site API accessible at `/port/5000/api/units`
12. **Pushing units from chat** — AI parses messy data in chat, pushes via curl to published API, works reliably
13. **Admin editing** — add/edit/delete units, add/delete sections, all functional in admin mode
14. **Two Trees Management Brooklyn portfolio** — 5 BK buildings added Aug 16: One South First (5 units), 300 Ashland Place (3 units), 30 Washington Street (3 units), Court House Apartments (2 units), 325 Kent Avenue (1 unit). All sourced from StreetEasy. Mercedes House updated: 4 units now active (prices/avail dates refreshed), 3 units marked rented (no longer on StreetEasy), 4 duplicates deleted, 1 new unit added (#1926).

## What Does NOT Work or Needs Fixing

1. **Bulk paste regex parser is weak.** Cannot handle real-world OLR data, condo sublet formats, multi-line descriptions with mixed links. The AI-in-chat approach works better (paste in chat → AI parses → pushes to API). The in-app parser should either be replaced with an AI-powered endpoint or removed in favor of the chat workflow.

2. **Static preview (deploy_website) shows "Could not load units".** The `deploy_website` tool only serves static files from S3 — no backend. So the preview always shows the error state. Only the published site (via `publish_website`) has a running backend. This is a platform limitation, not a bug. To preview with a backend, use the local server (port 5000) instead.

3. **`deleteSection(id)` references DB section IDs** but the visual grouping is address-based. If sections are deleted while the visual grouping logic groups by address, there could be inconsistency. The DB still has sections (from the original data import), but the frontend now groups by `address` field on units, not by `section_id`. This needs reconciliation.

4. **The `links` field** stores JSON arrays of `[label, url]` pairs, but there's no UI for editing links on existing units from the card view. Links can only be set via the Add/Edit Unit modal.

---

## Design Changes Made This Session (before/after summary)

### Change 1: Grid — Auto-fill → Fixed 3 columns
- **Before:** `grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))` — cards sized to fill available width, could be 2-4 per row
- **After:** `grid-template-columns: repeat(3, 1fr)` — exactly 3 cards per row, equal width always
- Added tablet breakpoint (2 cols at 900px max-width) and mobile (1 col)

### Change 2: Building headers — REMOVED the lines
- **What was added (then removed):** Decorative lines on both sides of building headers (`──── 235 W 48th Street, 2 units ────`) using `::before`/`::after` pseudo-elements
- **Current state:** Lines removed. Building headers are plain text: address in bold + unit count in grey. No lines, no borders, no decoration.

### Change 3: Flags — "New" only → OP/CONDO/NEW colored badges
- **Before:** Only showed green "New" badge and green "Concession" badge
- **After:** Shows OP (orange #fff3e0/#e65100), CONDO (blue #e3f2fd/#1565c0), NEW (green) — each as a distinct colored badge
- **CONCESSION badge removed** from cards (concession text still shows as a line item if present)
- Flags entered as comma-separated text in admin form (e.g. "OP, CONDO, NEW")

### Change 4: Sort — "Building order" default → "Recently added" default
- **Before:** Default sort was "Building order" (grouped by section)
- **After:** Default is "Recently added" (by unit ID descending = most recently added first)
- "Building order" removed entirely from dropdown
- Added "Recently confirmed" sort option (by `confirmed_at` descending)

### Change 5: Separate grids per building — KEPT (user preferred BEFORE)
- The user prefers each building to have its OWN separate `.card-grid` container
- Building headers appear above each grid (only when 2+ units share an address)
- A unified grid was tried and reverted — user wants separate grids

### Change 6: Confirm button — "Confirmed M/D HH:MM" → "Updated today/X days ago"
- **Before:** Showed raw timestamp "Confirmed 8/15 12:03"
- **After:** Shows "Updated today" or "Updated X days ago" with green dot badge
- Button text: "Confirm Available" → "Re-confirm" after confirming
- Re-confirm refreshes timestamp to now

### Change 7: Status toggles — 2 → 4 toggles
- **Before:** App (orange) + Rented (red)
- **After:** App (orange) + Rented (red) + Flex (light pink #f4b8c4) + Free Rent (light red #f9827a)
- All four get strikethrough on card text when active, each in their respective color

### Change 8: Green accent restored (Aug 16)
- **Before:** Accent color had drifted to blue/purple (`oklch(0.621 0.187 260.6)`)
- **After:** Restored to green (`oklch(0.55 0.14 150)`) — matching the original green design aesthetic
- Links, active filter chips, search focus ring, Add Unit hover, price text all use green
- Also widened `main` and `.head-inner` max-width from 1180px to 1400px
- Added `width: 100%` to `.building-group` and `.card-grid` to fix cards stacking left with empty right space

---

## Current Two Trees Management Portfolio (Aug 16, 2026)

### Mercedes House — 550 West 54th Street (Hell's Kitchen, Manhattan) — 5 active units
| Unit | Beds | Price | Avail | Concession |
|------|------|-------|-------|------------|
| #1412 | Studio | $4,215 | Sep 1 | OP, 0.28 mo free |
| #1147 | Studio | $4,385 | Sep 2 | OP, 0.27 mo free |
| #1926 | 1 BR | $5,395 | Sep 7 | OP, 0.09 mo free |
| #1721 | 1 BR | $5,295 | Sep 19 | OP, 0.1 mo free |
| #1416 | 1 BR + Home Office | $6,103 | Sep 18 | OP, 0.25 mo free |
Marked rented: #2105, #1417, #22F (no longer on StreetEasy)

### One South First — 1 South 1st Street (Williamsburg, BK) — 5 active units
| Unit | Beds | Price | Avail | Concession |
|------|------|-------|-------|------------|
| #38J | 1 BR | $6,695 | Now | OP, 1 mo free |
| #PH2B | Studio | $5,195 | Aug 25 | OP, 1.5 mo free |
| #18D | 1 BR | $6,395 | Aug 26 | OP, 0.5 mo free |
| #30C | 1 BR | $6,625 | Aug 27 | OP, 1.15 mo free |
| #17B | Studio | $4,750 | Sep 4 | OP, 1 mo free |

### 300 Ashland Place (Fort Greene, BK) — 3 active units
| Unit | Beds | Price | Avail | Concession |
|------|------|-------|-------|------------|
| #PHC | Studio | $3,836 | Now | OP |
| #27B | 1 BR | $5,295 | Now | OP |
| #31A | 2 BR | $7,455 | Now | OP |

### 30 Washington Street (DUMBO, BK) — 3 active units
| Unit | Beds | Price | Avail | Concession |
|------|------|-------|-------|------------|
| #5J | 2 BR | $7,225 | Now | OP |
| #6L | 2 BR | $6,995 | Oct 2 | OP, 0.5 mo free |
| #2M | 1 BR | $5,650 | Oct 10 | OP |

### Court House Apartments — 125 Court Street (Downtown BK) — 2 active units
| Unit | Beds | Price | Avail | Concession |
|------|------|-------|-------|------------|
| #3NN | Studio | $3,495 | Now | OP |
| #3SC | 1 BR | $4,595 | Now | OP |

### 325 Kent Avenue (Williamsburg, BK) — 1 active unit
| Unit | Beds | Price | Avail | Concession |
|------|------|-------|-------|------------|
| #855 | Studio | $3,635 | Now | No fee |

All Two Trees data sourced from [StreetEasy](https://streeteasy.com/property_management_companies/103?site=nyc), updated Aug 16, 2026.

---

## Publishing Details

### To deploy/publish (for the AI managing this)
```
publish_website(
  project_path="/home/user/workspace/ready-to-send",
  dist_path="/home/user/workspace/ready-to-send/public",
  app_name="Ready to Send",
  run_command="node server.js",
  install_command="npm ci --omit=dev",
  port=5000,
  site_id="83655914-6468-4acc-93b0-03353e43d068"
)
```

### Key publishing facts
- The `data.db` file in the published E2B sandbox is preserved across redeployments (best-effort for *.db, *.sqlite, *.sqlite3 files)
- The local sandbox `data.db` is separate from the published site's `data.db`
- `__PORT_5000__` in index.html is rewritten to the API proxy path during publishing
- The published site's API is at `https://ready-to-send.pplx.app/port/5000/api/units`
- Admin login on published site: POST to `https://ready-to-send.pplx.app/port/5000/api/admin/login` with `{"password":"bond2026"}`

### To push units to the published site from code
```bash
# Login
TOKEN=$(curl -s -X POST https://ready-to-send.pplx.app/port/5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"bond2026"}' | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")

# Create section
SECTION_ID=$(curl -s -X POST https://ready-to-send.pplx.app/port/5000/api/sections \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $TOKEN" \
  -d '{"name":"Building Name"}' | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")

# Bulk create units
curl -s -X POST https://ready-to-send.pplx.app/port/5000/api/units/bulk \
  -H "Content-Type: application/json" \
  -H "X-Admin-Token: $TOKEN" \
  -d '{"units":[{"section_id":SECTION_ID,"unit":"#1A","address":"123 Main St","beds":"1 BR","baths":1,"price":3000,"avail":"IMM","flags":["OP"],"highlights":"...","links":[]}]}'
```

---

## User Preferences (Lucia / Bond New York)

1. Grid should be **3 cards across** always, regardless of building grouping
2. Default sort: **Recently added** (by date added to the site, not listing date)
3. Building grouping is **visual only** — if 2+ units share an address, group them with a header. Single units stand alone with no header. Each building gets its OWN separate grid.
4. **No "Building order" sort option** — removed from dropdown
5. Confirm Available button should **refresh timestamp each click** and show "Updated today" / "Updated X days ago"
6. Status toggles: App = orange, Rented = red, Flex = light pink, Free Rent = light red — all with strikethrough on the card text in their respective colors
7. Flags: OP = orange badge, CONDO = blue badge, NEW = green badge. No CONCESSION badge on cards.
8. **No building header lines** — no decorative lines, borders, or pseudo-elements on building headers. Plain text only.
9. Bulk paste should work like the email-blast skill — parse messy NYC rental data intelligently. The regex parser is insufficient; AI-in-chat parsing is the current working approach.
10. User signs as "Ric" in emails (this is for the email-blast skill, not the site)
11. User is a real estate agent at Bond New York, works with Manhattan rentals
12. The user wants to use Open Design for visual/design work and Perplexity Computer for backend/logic/publishing
13. **Green accent** is the preferred color scheme — was restored Aug 16 after drifting to blue. All accent colors use `oklch(0.55 0.14 150)` (green hue 150)
14. Two Trees Management is a major portfolio — Mercedes House (Manhattan) plus 5 Brooklyn buildings. Keep these updated from StreetEasy.

---

## What Open Design Should Do

The user wants Open Design to handle the **visual design** of the index.html file. Specifically:

1. **Improve overall visual design** — the current design is functional, the user wants it to look more polished
2. **Keep all JavaScript intact** — the `cardHTML()` function, `toggleStatus()`, `toggleConfirm()`, `fetchData()`, `render()`, `relativeTime()`, `parseUnitFromText()`, admin functions, API_BASE logic, and the `__PORT_5000__` placeholder must all remain unchanged
3. **Keep all CSS class names** that are referenced in JavaScript: `.card`, `.card-grid`, `.building-group`, `.grid-section-header`, `.confirm-row`, `.confirm-btn`, `.confirm-badge`, `.status-toggle`, `.app`, `.rented`, `.flex`, `.freerent`, `.flag`, `.flag-op`, `.flag-condo`, `.flag-new`, `.card-toggle`, etc.
4. The card HTML is generated dynamically by `cardHTML(u, idx)` — Open Design should style the CSS classes, not try to hardcode card HTML
5. **Do NOT add building header lines** — the user explicitly hated decorative lines on building headers
6. **Keep 3-column grid** — `repeat(3, 1fr)` must stay

### The file to edit
The file is at: `/Users/luciaj/Desktop/ready-to-send-index.html` (pushed there by Perplexity Computer)

It's a single HTML file containing:
- `<style>` block in the `<head>` (all CSS is inline)
- HTML body with header, filter bar, results container, and modals
- `<script>` block at the bottom (all JS is inline)

Open Design should focus on the `<style>` block and the static HTML structure. The JavaScript generates cards dynamically, so the visual appearance of cards is controlled by CSS classes in the `<style>` block.

### After Open Design is done
The user will tell Perplexity Computer when the design is ready. Perplexity Computer will:
1. Pull the file back from the Mac (`pc pull`)
2. Verify all JS hooks are still intact
3. Fix any JS that Open Design may have broken
4. Republish to https://ready-to-send.pplx.app

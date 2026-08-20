# Ready to Send — Full Technical Brief for Open Design AI

## What this is

A fullstack web app for a NYC real estate agent (Bond New York) to manage rental listing units — write them up, toggle status (APP/Rented), confirm availability, sort, filter, and eventually blast them to clients via Follow Up Boss.

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
  status TEXT DEFAULT '',            -- '', 'app', or 'rented'
  confirmed_at TEXT DEFAULT '',      -- ISO timestamp or empty string
  sort_order INTEGER DEFAULT 0
);
```

**Current data:** 65 units across 10 sections on the live published site.

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
| PATCH | `/api/units/:id/status` | Body: `{status: 'app'|'rented'|''}` |
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
  - Contains .section > .card-grid > .card elements
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
When sortMode is price/avail: flat grid, no grouping.

### Card structure (generated by `cardHTML(u, idx)` function)
Each card contains:
- **Header row:** unit number, address, beds/baths, price, avail date
- **Flags:** OP, CONDO, etc. as small badges
- **Concession line** (if any)
- **Highlights** text
- **Links:** clickable text links (Floor Plan, 3D Tour, etc.)
- **Status toggles:** "App" (orange) and "Rented" (red) buttons with strikethrough when active
- **Confirm row:** "Updated today" / "Updated X days ago" badge (green dot) + "Confirm Available" / "Re-confirm" button
- **Admin actions:** Edit, Delete buttons (only in admin mode)
- **Expand/collapse:** card body toggles open/closed

### Status toggles
- Click "App" → unit.status = 'app', button turns orange (#dd6b20), card text gets `text-decoration: line-through`
- Click "Rented" → unit.status = 'rented', button turns red (#c53030), card text gets `text-decoration: line-through`
- Click again to toggle off → status cleared, strikethrough removed
- Calls `PATCH /api/units/:id/status`

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
- Body gets `admin-mode` class → shows edit/delete buttons on cards, section admin buttons, "Add Section" button, bulk paste button
- `adminHeaders()` function returns `{ 'Content-Type': 'application/json', 'X-Admin-Token': adminToken }`

### Key CSS classes
- `.card-grid` — the grid container for cards. **THIS IS THE PROBLEM: currently not set to 3 columns. Needs `grid-template-columns: repeat(3, 1fr)` or similar.**
- `.card` — individual unit card
- `.section` — building group wrapper
- `.section-head` — building header (h2 + unit count)
- `.confirm-row` — container for confirm badge + button
- `.confirm-btn` — green button, `.confirmed` class when active
- `.confirm-badge` — green dot + relative time text
- `.status-toggle` — APP/Rented buttons, `.app` = orange, `.rented` = red
- `.card.strikeout` or inline style — strikethrough when status is set

### Key JS functions
- `fetchData()` — loads units + sections from API, calls `render()`
- `render()` — main render function, handles filtering, sorting, grouping, and HTML generation
- `cardHTML(u, idx)` — generates HTML for a single card
- `toggleStatus(id, status)` — calls PATCH /api/units/:id/status, updates UI in-place
- `toggleConfirm(id)` — calls PATCH /api/units/:id/confirm, updates UI in-place
- `relativeTime(iso)` — converts ISO timestamp to "Updated today" / "Updated X days ago"
- `parseUnitFromText(text)` — regex parser for bulk paste (weak, see above)
- `openModal('bulk-modal')` / `closeModal('bulk-modal')` — bulk paste modal control
- `adminHeaders()` — returns auth headers
- `toggleAdmin()` — login/logout flow
- `openSectionModal()` — create new section
- `deleteSection(id)` — delete section (note: this references DB section IDs, but the new visual grouping is address-based — this may need reconciliation)

---

## What Works (confirmed)

1. **Backend API** — all endpoints functional, tested via curl
2. **Database** — 65 units across 10 sections, data persists across redeployments on published site
3. **Admin auth** — login works, token system works
4. **Status toggles** — APP (orange) and Rented (red) with strikethrough, tested and deployed
5. **Confirm Available button** — stores ISO timestamp, shows "Updated today/days ago", re-confirm refreshes, tested and deployed
6. **Sort: Recently added** — default sort, sorts by unit ID descending (most recently added first), tested and deployed
7. **Building visual grouping** — groups by address, shows header only when 2+ units share address, building groups ordered by newest unit, tested and deployed
8. **Publishing** — site published at https://ready-to-send.pplx.app, republishing preserves existing data.db
9. **API proxy** — published site API accessible at `/port/5000/api/units`
10. **Pushing units from chat** — AI parses messy data in chat, pushes via curl to published API, works reliably

## What Does NOT Work or Needs Fixing

1. **Card grid layout: NOT 3-across.** The `.card-grid` CSS currently does not enforce 3 columns. The user wants exactly 3 cards per row regardless of building grouping. This is the primary visual issue. The grid likely uses `auto-fill` with a min-width that results in 1-2 columns. Fix: set `grid-template-columns: repeat(3, 1fr)` on `.card-grid`.

2. **Bulk paste regex parser is weak.** Cannot handle real-world OLR data, condo sublet formats, multi-line descriptions with mixed links. The AI-in-chat approach works better (paste in chat → AI parses → pushes to API). The in-app parser should either be replaced with an AI-powered endpoint or removed in favor of the chat workflow.

3. **Static preview (deploy_website) shows "Could not load units".** The `deploy_website` tool only serves static files from S3 — no backend. So the preview always shows the error state. Only the published site (via `publish_website`) has a running backend. This is a platform limitation, not a bug. To preview with a backend, use the local server (port 5000) instead.

4. **Local server Playwright test showed "Could not load units"** despite API working via curl. This was likely a CORS or fetch issue in the Playwright browser context. The published site works fine. Root cause was not fully diagnosed.

5. **`deleteSection(id)` references DB section IDs** but the new visual grouping is address-based. If sections are deleted while the visual grouping logic groups by address, there could be inconsistency. The DB still has sections (from the original data import), but the frontend now groups by `address` field on units, not by `section_id`. This needs reconciliation — either remove sections from the DB entirely and group purely by address, or keep sections and map them to addresses.

6. **No "Add Unit" button in admin mode** for manually adding a single unit. Currently you can only add units via bulk paste or via the API/chat. A simple "Add Unit" form would be useful.

7. **The `links` field** stores JSON arrays of `[label, url]` pairs, but there's no UI for editing links on existing units. Links can only be set during bulk import.

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
3. Building grouping is **visual only** — if 2+ units share an address, group them with a header. Single units stand alone with no header.
4. **No "Building order" sort option** — removed from dropdown
5. Confirm Available button should **refresh timestamp each click** and show "Updated today" / "Updated X days ago"
6. Status toggles: APP = orange, Rented = red, both with strikethrough on the card text
7. Bulk paste should work like the email-blast skill — parse messy NYC rental data intelligently. The regex parser is insufficient; AI-in-chat parsing is the current working approach.
8. User signs as "Ric" in emails (this is for the email-blast skill, not the site)
9. User is a real estate agent at Bond New York, works with Manhattan rentals
10. The user wants to use Open Design for visual/design work and Perplexity Computer for backend/logic/publishing

---

## What Open Design Should Do

The user wants Open Design to handle the **visual design** of the index.html file. Specifically:

1. **Fix the card grid to 3-across** — `grid-template-columns: repeat(3, 1fr)` on `.card-grid`, with proper responsive breakpoints (maybe 2 columns on tablet, 1 on mobile)
2. **Improve overall visual design** — the current design is basic/functional, the user wants it to look more polished
3. **Keep all JavaScript intact** — the `cardHTML()` function, `toggleStatus()`, `toggleConfirm()`, `fetchData()`, `render()`, `relativeTime()`, `parseUnitFromText()`, admin functions, API_BASE logic, and the `__PORT_5000__` placeholder must all remain unchanged
4. **Keep all CSS class names** that are referenced in JavaScript: `.card`, `.card-grid`, `.section`, `.section-head`, `.confirm-row`, `.confirm-btn`, `.confirm-badge`, `.status-toggle`, `.app`, `.rented`, `.card-toggle`, etc.
5. The card HTML is generated dynamically by `cardHTML(u, idx)` — Open Design should style the CSS classes, not try to hardcode card HTML

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

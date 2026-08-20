---
name: write-up
description: >
  Produce a formatted plain-text listing write-up — the same block format email-blast uses
  (Address #X – Beds – $Price/mo | Avail Date | highlights, media link) — but with NO HTML step
  and NO FUB/blast pipeline. Use whenever Lucia is on a building's website, a StreetEasy page, or
  any other web source and wants a unit (or a few units) written up with highlights/amenities
  pulled from the page, or when she just wants a clean write-up to paste somewhere that isn't a
  FUB send — a text to a client outside FUB, notes for herself, a comp sheet, Slack/email to Ric.
  Trigger on: "write this unit up", "give me the write-up for this", "format this listing",
  "pull the highlights off this page", "scrape the amenities for this unit", "write-up mode",
  or any time Lucia hands over a URL/listing and does NOT ask for an email, HTML, or FUB blast.
  Always pulls media (YouTube/Matterport/photos) by default — opposite of email-blast's default.
  For a full FUB email/text blast, use email-blast instead. For wordsmithing an existing
  highlight/CTA/intro line, use unit-copy instead. For bulk-pulling every unit off a building's
  own site, building-page-pull can feed this skill its raw data.
---

# Write-Up — Bond New York / Lucia

Same listing block format as `email-blast`, minus everything downstream of it — for the moment
Lucia is looking at a unit (on the web, in a screenshot, in a paste) and wants it turned into her
standard write-up format without triggering the FUB/HTML pipeline.

**Boundary — read this before starting:**
- Full FUB email or text blast → **email-blast**, not this.
- Just the wording (a highlight phrase, a CTA, tightening a draft) → **unit-copy**, not this.
- Bulk-pulling every available unit off one building's own site → **building-page-pull** does the
  extraction; hand its output to this skill (or to email-blast if it's headed to FUB).

---

## Step 1 — Get the source data

Same parsing as email-blast Step 1 — pasted notes, Bentley/RealtyMX PDF, Excel sheet, Bond
listing report PDF, or a URL. Never fabricate a missing field; note it as missing instead.

**Web source (the common case for this skill):**
- If Lucia hands over a URL directly (StreetEasy, a building's own site, a listing aggregator),
  fetch it. If the page is JS-rendered and the real data doesn't show up in a static fetch, use
  Kapture: turn on `network_monitor`, reload, and look for the XHR/fetch call returning the raw
  unit JSON — usually faster and more complete than reading rendered DOM. See `building-page-pull`
  for the full method (that skill's Steps 1–2 are the reusable playbook for any building site).
- Check the `reference_building_availability_pages` memory for a canonical URL before searching —
  Lucia has already flagged the right page for buildings that have come up before.
- No canonical URL and no direct link → `firecrawl search` for it. Prefer firecrawl over extra
  Claude-token-heavy browsing when the choice is available — it's the cheaper resource here.
- Pull only what's literally stated: price (gross, never net-effective if both are shown),
  avail date, OP/commission language if present, and amenity/description text to mine for
  highlights. Never invent a feature, sqft, or tour link that isn't actually in the source.

---

## Step 2 — Filter (skip for a single ad-hoc unit; apply for a batch)

Same filter rules as `email-blast` Step 2 — include available/blank/status-A, exclude HOLD/
rented/OOS/no-access silently (note it in the summary line, don't just drop it from view),
Centennial only if nothing else fits, gross rent always with concessions inline, preserve source
order. Never include lockbox codes or internal access instructions in the output.

Always exclude, regardless of source: 51 Leroy St #1D · 3 W 103rd St · 40 Ave B #3W · 166 Second Ave

---

## Step 3 — Pull media (default ON)

Same media pull as `email-blast` Step 3 — same priority order (Jessie's YouTube → Matterport →
StreetEasy photos, stop at first hit), same selectors. See that file for the current JS snippets.

The one override: media defaults **ON** here (opposite of email-blast's default-off). "Pull the
highlights/media off this page" is usually the point of reaching for write-up in the first place.
Skip this step only if Lucia says "skip media" or "just the text."

If nothing turns up after all three tiers, omit the media line entirely — don't write "photos
coming soon" or similar as a placeholder.

---

## Step 4 — The write-up (this is the entire output — no further steps)

**Default block format:**
```
### Address, #X – X BR / Y BA – $Price/mo | Avail Date |
    highlight1, highlight2, highlight3, highlight4...
    [Tour label]: URL
```

Rules — identical to email-blast's plain-text format:
- `#X` not `Apt X`
- En dash between fields in the header line; highlights go on the indented line below, not
  crammed into the header.
- Highlight line: indented, comma-separated, lowercase, no neighborhood label. Not capped at a
  fixed count — list every genuine standout feature (typically 3–6): dishwasher, elevator,
  doorman, W/D in unit, central A/C, fireplace, outdoor space, renovated kitchen, 2 baths,
  duplex, live-in super, laundry in building. When mining amenity text off a web page, extract
  only phrases the source actually states — never round a vague marketing adjective ("stunning
  finishes") up into a concrete highlight, and never carry over a feature listed at the
  building level (not the specific unit) without confirming it applies to this unit. Banned
  terms — see [[feedback_highlights]] (same list email-blast uses).
- Gross rent only, concession inline if there is one.
- Avail date as stated on the source. If genuinely immediate, `Avail Now`.
- Tour: own indented line, labeled (`3D Tour:` / `Video Tour:`), raw URL. Omit if nothing found.
  Both a video and a 3D tour existing → give each its own line.
- No greeting, no sign-off, no CTA, no channel routing, no HTML. This block is the deliverable.

**Compact format** (only if Lucia asks for compact/SMS-style, or it's a batch of 5+ and she wants
one line per listing):
```
Address #X – X BR / Y BA – $Price/mo | Avail Date | highlight1, highlight2, highlight3 — [Tour label]: URL
```
Same banned-highlight list; cap at 3 highlights in this format.

For a batch, close with a one-line summary: `X units written up. Excluded: [unit] — [reason].`
Skip the summary line entirely for a single unit.

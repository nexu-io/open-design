---
name: tenant-rep-blast
description: >
  TRPA/TRO blast generator for Bond New York / Lucia. Use for tenant rep deals only —
  units that are off-market, not publicly advertised, where the client pays the broker fee.
  Trigger on: "tenant rep blast", "TRPA blast", "TRO blast", "draft tenant rep", "blast the
  TRPA units", "blast the VD units", "margules blast", "village dwellings blast", "make the
  TRO email", or any time listings come from Margules, Village Dwellings, GPG TRO, or a
  Bond @bondnewyork.com TRO blast email.
  NEVER use email-blast for these — that skill uses OP framing and "no broker fee" language.
---

# Tenant Rep Blast — Bond New York / Lucia

Two-step workflow: plain text first → HTML after approval. Never skip to HTML on the first response.

---

## Critical rules (TRPA is NOT OP)

- **Fee language**: Tenant rep clients have agreed to pay a broker fee. Never say "no broker fee."
- **Do not advertise**: These units are off-market. Never imply public availability. Output goes to registered tenant rep clients only.
- **Price column**: Use TRPA price only. Never use OP rate, gross OP rent, or any other column.
- **Gross rent always**: Show TRPA price as stated. Concessions inline (e.g. "1 month free"). Never NE/net-effective.
- **Never mix pools**: Do not include TRPA units in an OP blast, and vice versa.

---

## Sources — always TRPA

- **Margules** (Bruno Ricciotti, bruno@bondnewyork.com) — always TRPA. Use TRPA column only.
- **Village Dwellings** (VD Master spreadsheet) — always TRPA. Units marked "Tenant Rep only" or "VD Master."
- **GPG TRO** — units in the GPG tab of the Master Update explicitly labeled "Tenant Rep only."
- **Bond TRO blasts** — emails from @bondnewyork.com agents with subject containing TRO. Do not advertise — for registered TR clients only.

## Sources — check before including

- Any other unit: verify it is NOT on StreetEasy. If it's on SE → wrong pool, route to email-blast instead.

---

## Step 1 — Parse input

Same parsing logic as email-blast (pasted notes, spreadsheet, email, etc.).

Strip from client output:
- Access instructions, lockbox codes, key contacts
- Internal notes (app status, broker names, "DO NOT ADVERTISE" markers)
- OP pricing / OP% columns — never show these

---

## Step 2 — Filter

- Include: available, blank status, "can show," "showing," "vacant"
- Exclude silently: rented, lease out, HOLD, approved app, renewed
- Excluded always: 51 Leroy St #1D · 3 W 103rd St · 40 Ave B #3W · 166 Second Ave
- No Queens, Bronx, Jersey City unless Lucia specifically asks
- Flag if fewer than 3 units — confirm with Lucia before sending

---

## Step 3 — Media (same priority as email-blast)

1. Jessie's YouTube (@jessieoriolhuaman) — search by address/unit
2. Matterport — from spreadsheet MP Link or TRO blast email
3. StreetEasy photos — only if unit is NOT listed publicly (rare for TRPA)
4. If none: omit media line entirely (no "photos available upon request" — these are private)

---

## Step 4 — Plain text output (ALWAYS FIRST)

Line format:
```
Address Apt X – Beds – $Price/mo | Avail Date | highlight1, highlight2, highlight3
```

Rules:
- `Apt X` not `#X`
- En dash between major fields, pipe before highlights
- 2–3 lowercase highlights (e.g. `renovated, great light, West Village`)
- Gross TRPA rent only. Concessions inline.
- Add media after highlights if available: `| 3D Tour: [URL]` or `| Video: [URL]`
- No neighborhood label in subject/intro — cover in the intro line
- Sort by price ascending unless Lucia says otherwise

Intro line (use verbatim):
```
Here are some off-market options I'm working with right now — these are tenant rep deals, so a broker fee applies, but they're not listed publicly and we can move fast.
```

CTA (use verbatim):
```
Want to set up a time to take a look? I can usually get us in same-day or next-day.
```

Footer:
```
Ric
%agent_phone%
```

End plain text with:
```
X listings included. Excluded: [unit] — [reason]. Let me know if anything needs to change and I'll generate the HTML.
```

---

## Step 5 — HTML output (after Lucia approves plain text)

**Scaffold — no wrapper div:**
```html
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;font-size:14px;color:#000000;">

<p style="margin:0 0 16px 0;">Hi %contact_first_name%,</p>

<p style="margin:0 0 16px 0;">Here are some off-market options I&rsquo;m working with right now &mdash; these are tenant rep deals, so a broker fee applies, but they&rsquo;re not listed publicly and we can move fast.</p>

[listing blocks]

<p style="margin:24px 0 16px 0;">Want to set up a time to take a look? I can usually get us in same-day or next-day.</p>

<p style="margin:0;">Ric<br>%agent_phone%</p>

</body>
</html>
```

**Listing block:**
```html
<p style="margin:0 0 6px 0;"><strong>[Address] Apt [Unit]</strong> &ndash; [Beds] &ndash; $[price]/mo | Avail [date] | [highlight1, highlight2, highlight3]</p>
<p style="margin:0 0 16px 0;font-size:13px;">[media link or omit]</p>
```

**HTML rules:**
- All CSS inline — no `<style>` blocks
- No `<img>` tags — media as linked text only
- No `<hr>` dividers, no tables, no buttons
- No wrapper `<div>` — `<p>` tags go directly inside `<body>`
- `&ndash;` for en dashes — never literal –
- `&rsquo;` for apostrophes
- `&mdash;` for em dashes
- `<a href="URL" target="_blank" style="color:#000000;text-decoration:underline;">3D Tour</a>`
- Max-width 600px only if Lucia requests it (default: no max-width wrapper)

---

## Never do

1. Say "no broker fee" or "all no broker fee" — clients pay a fee
2. Output HTML before plain text review
3. Use OP pricing column
4. Include units on StreetEasy unless Lucia confirms they're TRPA
5. Include access instructions or lockbox codes in client output
6. Use `<style>` blocks, `<img>` tags, `<hr>`, or a wrapper `<div>`
7. Use `#X` for unit numbers — always `Apt X`
8. Add "Photos available upon request" — omit media line if nothing available
9. Mix TRPA units into an OP lead blast

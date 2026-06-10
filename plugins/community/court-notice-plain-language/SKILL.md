---
name: court-notice-plain-language
description: Transform a court document (eviction summons, restraining order, criminal subpoena, etc.) into a one-page bilingual plain-language public notice that a panicking, possibly limited-English reader can understand in 30 seconds. Output is a print-ready A4 HTML page in the road-work warning-sign visual language — saturated warning yellow, three inks (black / red / yellow), heavy condensed signage typography, three black pictograms — with a verbatim zone that re-uses dates, case numbers, court names, and party names character-for-character from the source.
od:
  taskKind: new-generation
  mode: scenario
---

# court-notice-plain-language

Triggered when the user attaches a court document (PDF, DOCX, or screenshot) and asks for a plain-language public notice. The agent extracts the verbatim facts, reduces the document to four hard truths a layperson must act on (what is happening, by when, with which consequence, by which three steps), and renders an English + Spanish A4 page styled like a road-work warning sign.

## Required outcome

A single HTML file at the project root containing two `<section class="page">` blocks:
- Page 1 — English notice
- Page 2 — Spanish notice (identical layout)

Print stylesheet must produce a back-to-back A4 PDF on ⌘P → Save as PDF.

## Information hierarchy (strict, top to bottom)

1. **Black banner headline** — what is happening, in plain words. "YOU MUST GO TO COURT", "YOU ARE BEING SUED", "A COURT ORDER RESTRICTS YOU". No legal jargon. Never the words "summons", "plaintiff", "petitioner" in the headline.
2. **One sentence under the banner** — who started this and what they are asking the court to do. ≤ 12 words. Active voice, second person.
3. **Red deadline panel** — date as the single largest element on the page. One line for what must be done by then. One line for the consequence of doing nothing. Red appears nowhere else.
4. **Three numbered action steps** — each with one black pictogram, one bold verb-first instruction (≤ 12 words), one line of practical detail (address, hours, phone, cost). Merge or cut anything beyond three.
5. **Verified-from-source line** — case number, every date, court name + address, and all party names lifted character-for-character from the source PDF, each underlined.
6. **Black footer strip** — "This is a simplified notice. Read the attached official document. This is not legal advice."

## Style system (non-negotiable)

- **Background:** one saturated warning yellow (`#F2C211`), edge to edge. Never white. No floating cards.
- **Inks:** exactly three — `#1A1A1A` near-black for ~all text, `#C8181C` deep red **only** in the deadline panel, white only as knockout text inside black or red shapes.
- **Type:** heavy condensed sans-serif throughout — Barlow Condensed / Oswald / Roboto Condensed / Arial Narrow stack. No script, no italics, no rotation. Three sizes only: headline (~64pt), deadline date (~108pt — the single largest element), body (~15pt).
- **Layout:** banner and footer bleed to the page edges; everything else stays inside a 24px safe area. Maximum 12 text elements on the page.
- **Pictograms:** flat solid-black, max 4. Equal visual weight. No outline icons, no photos, no illustrative SVG, no emoji.

## Verbatim zone — hard rule

Case number, every date and deadline, court name + address, and all party names **must** be extracted character-for-character from the source document and underlined in the notice. Above the footer, list them in a small "Verified from source, p. X" line. If any of these cannot be found with certainty, render `[CHECK ORIGINAL: …]` instead of guessing. Never invent or infer a date.

## Workflow

1. **Extract.** Read the attached court document. If it's a PDF and `pdftotext` is missing, install `pypdf` (`python3 -m pip install --user pypdf`) and extract via `from pypdf import PdfReader`.
2. **Identify the four hard truths.** Headline event, deadline date + time, consequence of inaction, three concrete actions. Translate jargon ("subpoena to testify" → "you must go to court"; "summons" → "you are being sued").
3. **Localize the actions.** Pick three actions a panicking reader can do today: where to go, how to behave once there, who to call for free help. Real address, real phone, real hours.
4. **Render the artifact.** Produce a single HTML file at project root using the warning-sign style above. Both languages. Bake-in `print-color-adjust: exact` and per-section `page-break-after: always` so PDF export holds the yellow.
5. **Self-check.** Sentences ≤ 12 words. Three sizes only. Red used only in deadline. Pictograms count ≤ 4. All verbatim values underlined. Total text elements ≤ 12 per page.

## What NOT to do

- Do **not** soften the headline into marketing copy ("We're here to help") — the document is an order, not a service.
- Do **not** add disclaimers about legal interpretation beyond the standard footer line; the page is a wayfinding aid, not legal advice.
- Do **not** invent details the source document doesn't contain. If a hearing date is missing, write `[CHECK ORIGINAL: …]`, not a plausible date.
- Do **not** add a fourth action step. Merge or cut.
- Do **not** introduce a second accent color, gradients, or rounded cards. The visual language is signage, not a flyer.

## Language

The English page uses sentence-level English written for a 6th-grade reading level. The Spanish page mirrors the layout exactly, with usted-form imperatives ("Vaya", "Quédese", "Llame"). Address and phone strings stay verbatim across both languages.

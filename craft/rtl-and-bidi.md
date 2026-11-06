# RTL and bidirectional craft rules

Universal rules for right-to-left layout and bidirectional text. The
active `DESIGN.md` decides brand visual language; this file decides
how that language behaves when the script reads from the right or
mixes direction within a line.

> Grounded in primary sources: Unicode UAX #9 revision 51 (Sept 2025)
> + Unicode 17.0, CSS Logical Properties Level 1, HTML Living Standard
> (`dir`, `<bdi>`), Tailwind v4.0/v4.2 changelogs, W3C alreq,
> Material 3 RTL guidance, Apple HIG internationalization.

## Base direction and language

Every full-page RTL artifact needs `<html dir="rtl" lang="ar">` (or
the matching `lang` for Hebrew, Persian, Urdu). The `lang` attribute
drives font-stack selection, hyphenation, locale-aware speech
synthesis, and search-engine indexing — `dir` alone isn't enough.
Three patterns cover the common cases:

- **Full-page RTL.** `<html dir="rtl" lang="ar">`. Everything inside inherits.
- **Mixed-language subtree.** Nest `<section dir="ltr" lang="en">…</section>` (or vice versa) when an embedded block uses a different script. Code samples, English citations, foreign brand names.
- **User-generated content of unknown direction.** `dir="auto"` on the paragraph. The browser resolves direction from the first strong directional character in the run.

Setting `lang` without `dir` is fine **at the document root in a
default-LTR page** — English doesn't need `dir="ltr"` there because
the bidi base direction is already LTR. Inside any opposite-direction
ancestor, `lang` does not reset the inherited base direction, so set
both `lang` and `dir` on the subtree (`<section dir="ltr" lang="en">`).
Setting `dir` without `lang` is rarely correct — at minimum drop the
appropriate ISO-639 tag in.

## Logical properties first

Hardcoded `left` / `right` is a bug for any layout that might render
RTL. Use logical properties on the inline axis. Use them on the block
axis when the writing-mode varies; physical otherwise.

| Logical | LTR resolves to | RTL resolves to |
|---|---|---|
| `margin-inline-start` / `padding-inline-start` / `inset-inline-start` | left | right |
| `margin-inline-end` / `padding-inline-end` / `inset-inline-end` | right | left |
| `border-inline-start` | border-left | border-right |
| `border-start-start-radius` | border-top-left-radius | border-top-right-radius |
| `text-align: start` / `text-align: end` | left / right | right / left |
| `inline-size` / `block-size` | width / height | width / height |

Browser support: core inline-axis logical properties are Baseline
Widely Available (Chrome 87, Safari 14.1, Firefox 66; ≥95% global as
of 2026-05).

**Tailwind v4 changes the answer for new projects.** v4.0 (2025-01-22)
folded inline-axis logical utilities into core (`ms-*`, `me-*`, `ps-*`,
`pe-*`, `start-*`, `end-*`). v4.2 (2026-02-18) added the block-axis
set (`mbs-*`, `mbe-*`, `pbs-*`, `pbe-*`) and renamed the inset
utilities: `start-*` / `end-*` are deprecated (still work) in favor
of `inset-s-*` / `inset-e-*`. The `tailwindcss-rtl` plugin is obsolete.
Don't write `[dir="rtl"]:` overrides for spacing on Tailwind v4.

## Bidirectional text

UAX #9 rev 51 (Sept 2025) is a version stamp for Unicode 17.0. No
algorithm change; `max_depth = 125` is permanently locked forward.

UAX #9 defines two distinct families of bidi formatting characters
that solve different problems:

- **Isolate controls** (modern, prefer these): U+2066 LRI, U+2067 RLI, U+2068 FSI — opened with these, all closed with U+2069 PDI. An isolated run does not affect, and is not affected by, the surrounding paragraph's bidi resolution. Use FSI when the embedded run's direction is unknown ahead of time.
- **Embedding / override controls** (legacy): U+202A LRE, U+202B RLE, U+202D LRO, U+202E RLO — all closed with U+202C PDF. These nest within the surrounding paragraph rather than isolating from it; LRO/RLO additionally force a direction onto neutral characters. Newer code should use isolates; touch embeddings only when interoperating with text from systems that emit them.

**Use `<bdi>` in HTML; in plain text, pick the isolate that matches
what you know about the run.** UAX #9 §2.7: *"where available, markup
should be used instead of the explicit formatting characters."*
`<bdi>` has been Baseline Widely Available since January 2020.
Reach for control characters only in plain-text contexts (logs,
plain-text emails, terminal output). When you do:

- **LRI U+2066 + PDI U+2069** for known-LTR runs (English name in an Arabic paragraph, code-style identifiers, phone numbers).
- **RLI U+2067 + PDI U+2069** for known-RTL runs (Arabic name in an English paragraph).
- **FSI U+2068 + PDI U+2069** for unknown direction (UGC where the author and language can vary).

Don't reach for FSI as the default — it auto-detects from the first
strong character, which is the wrong choice when you already know
what direction the run should be.

`dir="auto"` on a paragraph or `<bdi>` lets the browser detect
direction from the first strong directional character. Best for
user-generated content where direction isn't known at author time.

## What mirrors and what doesn't

Mirroring isn't universal. The rules below are unanimous across
Material 3 RTL guidance and Apple HIG internationalization.

**Must mirror:**

- Directional arrows (back / forward / next / previous), navigation rail position, tab order, calendar-grid weekday order.
- Slider fill direction and **non-media** progress-bar fill (a download progress bar, a form-completion bar, an upload status). Media scrubbers stay LTR — see the Media row below.
- Checkbox-and-label position. Label sits to the right in LTR, to the left in RTL.
- Phone-number and IBAN affordances when the surrounding paragraph is RTL but the value itself is LTR — wrap the value in `<bdi dir="ltr">` (or `<span dir="ltr">`) so the digits don't reflow. Bare `<bdi>` is not enough: phone numbers and account numbers contain mostly weak / neutral characters, so first-strong direction detection is unreliable. Force LTR explicitly.

**Must not mirror:**

- Clock faces. Clockwise is universal.
- Circular refresh / sync / reload icons. Same reason.
- Media playback controls (play / pause / fast-forward / rewind) **and the media scrubber / progress timeline**. They represent tape direction, not reading direction.
- Charts and graphs. X-axis stays mathematical, not linguistic.
- Photographs, brand logos, physical-object icons (camera, keyboard, headphones). Identity over direction.

**Numerals are not a mirroring decision.** They follow locale, not
paragraph direction. Arabic-Indic digits carry bidi class **AN**, not
EN — affects how they sit inside mixed-direction lines but does not
flip them.

**Single live conflict between platforms:** the search icon. SF Symbols
ships an RTL `magnifyingglass` variant (Apple flips it). Material 3
says don't flip the magnifying glass (handle stays bottom-right).
Decide per-platform; don't synthesize a single rule.

## Typography rules anchored here

Two RTL-coupled typography rules sit in this file because they cause
breakage at the layout level. The full Arabic / Hebrew typography
guide (font picks, harakat line-height, OpenType shaping, mixed-script
fallback chains) belongs in a future `craft/arabic-hebrew-typography.md`.

- **Never apply CSS `letter-spacing` to Arabic runs.** alreq treats
  letter-spacing as a boundary concept, not a uniform tracking value.
  Applying tracking breaks the cursive joining the script depends on.
- **Body type for Arabic runs ~14-18 px with line-height 1.5-1.75** to
  give harakat (diacritics) clearance. Latin defaults are too tight.

## Native mobile RTL parity

Web RTL handling does not auto-translate to mobile. Each platform has
its own direction primitive. Skills that emit web-only artifacts can
skim this section; it's the entry point for skills that ship to
mobile (mobile-onboarding, mobile-app, etc.).

| Platform | Direction primitive | Spacing |
|---|---|---|
| iOS UIKit | `semanticContentAttribute = .forceRightToLeft` | `NSDirectionalEdgeInsets` |
| iOS SwiftUI | `.environment(\.layoutDirection, .rightToLeft)` | `EdgeInsets` with `leading` / `trailing` |
| Android Compose | `CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl)` | `PaddingValues` accepts start / end |
| Flutter | `Directionality(textDirection: TextDirection.rtl)` | `EdgeInsetsDirectional.fromSTEB(...)` |
| React Native | `I18nManager.forceRTL(true)` (requires native reload; no `forceLTR` parity, no `react-native-web` support) | `marginStart` / `marginEnd` |

The rule across all platforms: prefer the directional primitive over
the absolute one. `EdgeInsets.left/right` in Flutter, `paddingLeft` /
`paddingRight` in Android, leading-vs-trailing in iOS — these are bugs
waiting for an Arabic deployment.

## Forms in RTL

Form fields commonly mix scripts. Three rules cover most of it.

- **`<input dir="auto">`** for any field whose value's direction is uncertain (search boxes, comment fields, free-text inputs). The browser detects from the first strong directional character.
- **Force LTR on intrinsically-LTR fields** even inside an RTL paragraph: email, URL, phone, IBAN, credit-card. `<input type="email" dir="ltr">`.
- **Wrap rendered values in `<bdi>`** when displaying mixed-script content (a username inside a paragraph, a model number inside a description). Stops the surrounding direction from rearranging the embedded value. For values whose direction is fixed and weak-character-heavy (phone, IBAN, card number), use `<bdi dir="ltr">` rather than bare `<bdi>` so first-strong detection doesn't misclassify.

## Common mistakes (lint these)

Mechanically lintable items can be flagged from CSS / source alone.
Script-aware items need to detect Arabic / Hebrew runs in the
rendered text and have legitimate exceptions (chart axes, physical
icons, platform-specific placement).

**Mechanically lintable:**

- Hardcoded `left` / `right` / `text-align: left` in new CSS — bug for any layout that may render RTL. Exceptions: chart x-axes, physical-object icons, platform-pinned UI like a status-bar clock. Lint with an allow-list rather than blanket banning.
- "Tailwind v4.2 logical-utility rename is `inline-s-*` / `inline-e-*`" — wrong family. Those are size utilities. The inset rename is `inset-s-*` / `inset-e-*`.
- "WebKit doesn't support U+2066-U+2069" — wrong, they're interoperable across modern browsers. The "still missing" claim traces to a stale 2015 W3C test snapshot.
- Setting `dir="rtl"` without `lang="ar"` (or matching). Lint together; `dir` alone misses the font-stack and locale path.
- Flutter `EdgeInsets.left/right` in code that needs to render RTL. Use `EdgeInsetsDirectional.start/end`.

**Needs script detection (will false-positive without it):**

- "Use `text-justify: kashida` for Arabic" — no browser implements it. CSS `text-align: justify` adds inter-word spacing and looks unnatural in Arabic; kashida elongation is the correct form, but it isn't shippable on the web today.
- Italics on Arabic or Hebrew text. Neither script has an italic tradition.
- CSS `letter-spacing` applied to Arabic. Breaks cursive joining (alreq treats it as a boundary concept, not a uniform tracking value).
- Lorem Ipsum used for RTL prototyping. Arabic word lengths, connection behaviors, and vertical extents differ; use real Arabic / Hebrew text.

**HTML semantics:**

- Reaching for CSS bidi controls (`unicode-bidi: isolate` / `plaintext` / `embed`) for inline runs when `<bdi>` or a `dir`-bearing element does the job. Prefer semantic isolation in HTML for inline content; `unicode-bidi: plaintext` operates on a different surface (it changes how base direction is determined for each plaintext paragraph in a block) and should only be used when that block-level paragraph behavior is explicitly required and tested. The two are not drop-in equivalents — don't lint one as a replacement for the other.
- Bare `<bdi>` around phone / IBAN / card numbers in an RTL paragraph. First-strong detection on weak/neutral characters is unreliable; force `dir="ltr"` explicitly.

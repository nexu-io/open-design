# Font Discipline for PPTX Exports

Companion to `layout-discipline.md`. The rail / cursor primitives in that
file catch geometric drift; this file catches the typography drift that
geometry can't see — variable-font traps, missing CJK slots, fake italic
on Han characters. These are the bugs that pass `verify_layout.py` and
still look wrong.

Read this when:

- The audit table has 🟡 entries about italic / em / font fallback.
- PowerPoint silently swaps to Calibri / Arial / Microsoft JhengHei /
  Georgia after you specified a different family.
- `unzip pptx | grep typeface` shows a face that isn't in your design system.

## Layer 1 — Font mapping in the export script

Walk each CSS class used by the source HTML and confirm the export
script maps it to the **same** font family.

⚠️ **Trap:** the visual category your eye reads is not always the
class's semantic category. Editorial decks routinely bind `.lead`,
`.callout`, or `.q-big` to a serif face, not the sans-serif you'd guess
from "lead". Open the HTML's CSS, read the `font-family` declaration
for each class, and copy the literal family name into the export's
font table.

Don't rely on visual intuition; rely on grep.

> **Coverage gap for Latin-slot scripts (Cyrillic / Greek / Vietnamese).**
> Russian / Ukrainian / Greek runs go through `<a:latin>`, not `<a:ea>` —
> they use the Latin slot. Many display fonts (Playfair Display, Source
> Serif 4) ship with weak or missing Cyrillic / Greek glyphs, and most
> drop Vietnamese Extended diacritics (ếẫỡỗ). PowerPoint silently falls
> back to Calibri / Times New Roman per missing glyph, producing
> mid-paragraph face shifts that look like a styling bug.
>
> When mapping a CSS class to a Latin font, check the font actually
> covers your scripts:
>
> ```bash
> # macOS / Linux: list the unicode blocks a font supports
> fc-query -f '%{charset}\n' "$(fc-match -f '%{file}\n' 'Playfair Display')" | head
> ```
>
> ```powershell
> # Windows: PowerShell + System.Drawing reads the registered family list
> [System.Reflection.Assembly]::LoadWithPartialName("System.Drawing") | Out-Null
> $f = New-Object System.Drawing.Text.PrivateFontCollection
> # Coverage detail (Unicode ranges) is best read in fontforge:
> # File → Open → pick the .ttf / .otf → Element → Font Info → OS/2 → Unicode Ranges.
> ```
>
> Cross-platform fallback: open the font in fontforge → Element → Font Info → OS/2 → Unicode Ranges.
>
> If coverage is missing, either swap to a face that has it (e.g.
> Inter / IBM Plex Sans for Cyrillic; Be Vietnam Pro for Vietnamese) or
> set a different `<a:latin>` per language run.

## Layer 2 — Font presence on the rendering machine

PowerPoint uses the OS font cache. If the family name in your XML isn't
installed, PowerPoint silently falls back. Check:

```bash
fc-list | grep -i "noto serif"            # Linux / WSL
mdfind "kMDItemFSName == '*NotoSerif*'"   # macOS
```

```powershell
# Windows (PowerShell)
Get-ChildItem -Path "$env:WINDIR\Fonts","$env:LOCALAPPDATA\Microsoft\Windows\Fonts" `
  -Filter "*NotoSerif*" -ErrorAction SilentlyContinue
```

Install missing families:

```bash
brew install --cask \
  font-noto-serif-tc \
  font-playfair-display \
  font-source-serif-4 \
  font-ibm-plex-mono
```

The `verify_layout.py` script can't see this — it only checks
geometry. A standalone font audit step is required.

## Layer 3 — Variable fonts vs. static families ← most common trap

Modern fonts often ship as a **single variable file** containing all
weights (`NotoSerifTC[wght].ttf`). Looks elegant, but PowerPoint Mac /
Windows have spotty support:

- macOS reports the variable font's family name as its **default static
  instance** — usually ExtraLight or Regular.
- PowerPoint asks the OS for "Noto Serif TC, weight 700"; the OS
  reports the family as `Noto Serif TC ExtraLight`; PowerPoint can't
  match → falls back to a system serif.

Diagnose:

```bash
ls -la ~/Library/Fonts/ | grep -i NotoSerif
```

| What you see                           | Verdict                                 |
| -------------------------------------- | --------------------------------------- |
| One `*[wght].ttf` file                 | Variable. PowerPoint may not match.     |
| Multiple `*-Regular.otf`, `*-Bold.otf` | Static family. Safe.                    |

Fix by using the static family equivalent:

| Don't use (variable)        | Use instead (static)              |
| --------------------------- | --------------------------------- |
| `Noto Serif TC` (variable)  | `Noto Serif CJK TC`               |
| `Source Serif 4` (variable) | `Source Serif Pro` / `Source Serif 4` static instances |
| `Inter` (variable)          | Per-weight `Inter Regular` / `Inter Bold` |

After fixing the export, re-run `extract_pptx.py` and confirm the
`font` field matches the static name.

## Layer 4 — PPTX XML's three-language slots

PowerPoint chooses a typeface per run by language script. Each run can
declare three:

| Attribute               | Used for                         |
| ----------------------- | -------------------------------- |
| `<a:latin typeface=…>`  | Latin script (a-z, A-Z, digits)  |
| `<a:ea typeface=…>`     | East Asian (CJK) — **Chinese / Japanese / Korean go here** |
| `<a:cs typeface=…>`     | Complex script (Arabic, Hebrew, Thai) |

Audit a file:

```bash
unzip -o /path/to/deck.pptx -d /tmp/audit
grep -h -oE 'typeface="[^"]+"' /tmp/audit/ppt/slides/slide*.xml | sort -u
```

Expected output: only the design-system fonts. If you see
`Microsoft JhengHei`, `Calibri`, `Arial`, `Georgia`, `Consolas`,
something has fallen back.

**Common defect:** export script writes `<a:latin>` only. Chinese runs
have no `<a:ea>` directive → PowerPoint picks the OS default
(Microsoft JhengHei on Windows, Hiragino Sans on Mac). Result: Chinese
characters in the wrong serif/sans family.

Fix: when adding a run with mixed-language content, set all three
attributes that apply.

```python
from pptx.oxml.ns import qn

def set_run_fonts(run, latin: str | None = None, ea: str | None = None, cs: str | None = None):
    rPr = run._r.get_or_add_rPr()
    if latin:
        el = rPr.find(qn('a:latin'))
        if el is None:
            el = rPr.makeelement(qn('a:latin'), {})
            rPr.append(el)
        el.set('typeface', latin)
    if ea:
        el = rPr.find(qn('a:ea'))
        if el is None:
            el = rPr.makeelement(qn('a:ea'), {})
            rPr.append(el)
        el.set('typeface', ea)
    if cs:
        el = rPr.find(qn('a:cs'))
        if el is None:
            el = rPr.makeelement(qn('a:cs'), {})
            rPr.append(el)
        el.set('typeface', cs)
```

PptxGenJS sets all three by default; raw XML injection or python-pptx
without explicit `ea` slot does not.

## Layer 5 — Italic + script interaction

🚨 **`italic=True` is a Latin-script feature.** Apply it only to runs
whose characters belong to scripts where italic is part of the writing
tradition (Latin, Cyrillic, Greek). For everything else — CJK, Arabic,
Hebrew, Devanagari, Thai, Khmer — PowerPoint synthesizes a slanted
bitmap that looks mechanically deformed. The chain of failures, using
CJK as the canonical example:

1. `<a:latin>` slot has Playfair Display Italic (a Latin-only font).
2. The CJK characters in the run have no glyph in Playfair → PowerPoint
   substitutes a system CJK font.
3. The substituted CJK font is forced into `italic=True` → since no
   real CJK italic exists, PowerPoint synthesizes a slanted bitmap →
   characters look mechanically deformed.

The same pattern triggers for Arabic, Hebrew, Devanagari, and Thai —
none of these scripts has an italic tradition, and faking it produces
a slant that's visually broken.

**Rule:** italic only applies to runs whose primary script supports it
(Latin / Cyrillic / Greek). Indicate emphasis on other scripts via:

- color tone (`COLOR_INK_60` for muted, full ink for emphasis)
- weight contrast (Regular 400 vs. Bold 700)
- a script-native italic variant **only if one actually ships** — most
  don't

Practical implementation:

```python
# Unicode ranges where italic should be suppressed.
# Principle: include scripts whose writing tradition has no italic style.
# Synthesized italic on these scripts produces a slanted bitmap that looks
# mechanically deformed.
NO_ITALIC_RANGES = (
    (0x3400, 0x9FFF),    # CJK Unified Ideographs
    (0xF900, 0xFAFF),    # CJK Compatibility Ideographs
    (0x3040, 0x30FF),    # Hiragana + Katakana
    (0xAC00, 0xD7AF),    # Hangul Syllables
    (0x0590, 0x05FF),    # Hebrew
    (0x0600, 0x06FF),    # Arabic
    (0x0750, 0x077F),    # Arabic Supplement
    # Indic scripts — none have an italic tradition; PowerPoint synthesizes
    # a fake slant on all of them. Add new ranges here when the deck mixes
    # in additional scripts (e.g. Sinhala U+0D80–U+0DFF).
    (0x0900, 0x097F),    # Devanagari (Hindi, Marathi, Sanskrit)
    (0x0980, 0x09FF),    # Bengali
    (0x0A00, 0x0A7F),    # Gurmukhi (Punjabi)
    (0x0A80, 0x0AFF),    # Gujarati
    (0x0B00, 0x0B7F),    # Oriya
    (0x0B80, 0x0BFF),    # Tamil
    (0x0C00, 0x0C7F),    # Telugu
    (0x0C80, 0x0CFF),    # Kannada
    (0x0D00, 0x0D7F),    # Malayalam
    # Southeast Asian
    (0x0E00, 0x0E7F),    # Thai
    (0x0E80, 0x0EFF),    # Lao
    (0x1780, 0x17FF),    # Khmer
)


def has_no_italic_script(text: str) -> bool:
    return any(
        any(lo <= ord(c) <= hi for lo, hi in NO_ITALIC_RANGES)
        for c in text
    )


def add_run_with_italic_safety(p, text, *, latin_face: str, ea_face: str,
                               cs_face: str | None, size_pt: int,
                               italic: bool, **kwargs):
    """Drop italic if the run contains characters from scripts without italic tradition.

    Args:
        latin_face: Font for Latin / Cyrillic / Greek runs (a:latin slot).
        ea_face: Font for CJK runs (a:ea slot).
        cs_face: Font for complex scripts — Arabic, Hebrew, Devanagari,
            Thai, etc. (a:cs slot). Pass None when the run contains no
            complex-script characters; set_run_fonts skips the slot.
    """
    r = p.add_run()
    r.text = text
    r.font.size = Pt(size_pt)
    r.font.italic = italic and not has_no_italic_script(text)
    set_run_fonts(r, latin=latin_face, ea=ea_face, cs=cs_face)
    return r
```

For mixed-script runs (e.g. `"In <em>2026</em> 開始"`), split into
multiple runs at language boundaries so the italic attribute can apply
to the Latin run only.

## Beyond CJK — other scripts

The five layers above are written in CJK examples because that's the
most common pairing in Open Design today, but the same machinery
applies to other scripts. Quick reference:

| Script family            | XML slot   | Italic OK? | Most common defect                                                                  | Recommended faces                                |
| ------------------------ | ---------- | ---------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| Latin (en, de, es, vi…)  | `a:latin`  | ✅          | Vietnamese Extended diacritics dropped → fallback Calibri mid-paragraph             | Be Vietnam Pro, IBM Plex Sans, Source Sans 3     |
| Cyrillic (ru, uk, bg)    | `a:latin`  | ✅          | Display fonts (Playfair, Source Serif) lack Cyrillic → fallback Calibri             | Inter, IBM Plex Sans, Roboto                     |
| Greek (el)               | `a:latin`  | ✅          | Same as Cyrillic — display faces missing Greek → fallback                           | Inter, IBM Plex Sans                             |
| CJK (zh, ja, ko)         | `a:ea`     | ❌          | Variable-font trap (Layer 3); missing `a:ea` slot → fallback Microsoft JhengHei     | Noto Sans CJK *, Source Han Sans, IBM Plex Sans JP |
| Arabic / Hebrew / Persian | `a:cs`    | ❌          | `<a:rtl val="1"/>` not set → text direction breaks; kashida changes width           | Noto Naskh Arabic, IBM Plex Sans Arabic, Amiri   |
| Devanagari / Bengali     | `a:cs`     | ❌          | PowerPoint defaults to Mangal/Vrinda (low fidelity); cluster shaping bumps line height | Noto Sans Devanagari, Mukta, Hind             |
| Thai / Lao / Khmer       | `a:cs`     | ❌          | No inter-word spaces → PowerPoint's break engine produces poor wraps; tone marks bump line height | Noto Sans Thai, Sarabun, Noto Sans Khmer  |

For RTL scripts (Arabic / Hebrew / Persian), set both `<a:cs typeface=…>`
and `<a:rtl val="1"/>` on the run's `rPr`. Right-alignment, bidi text
flow, and chrome / footer mirroring are out of scope for `verify_layout.py`
today and need manual review — see the Tier 2 follow-up note in the
audit checklist.

> **RTL discipline scope.** Full RTL support is roughly 15–20% of the
> font + layout discipline surface area: Unicode TR9 bidi resolution,
> chrome / footer / page-number mirroring, kashida (Arabic
> elongation) interaction with line-fill, and right-anchored
> alignment. This skill covers the typeface + slot mechanics only;
> bidi and mirroring are flagged for a Tier 2 `rtl-discipline.md`
> follow-up when fa / ar / he usage volume justifies the investment.

## Line height per script

The `Cursor.take(gap=Inches(0.12))` default suits 14pt Latin body copy.
Other scripts need more vertical headroom because of stacked diacritics,
matras, or tone marks:

| Script                                   | Recommended `gap` at 14pt body |
| ---------------------------------------- | ------------------------------ |
| Latin (no Vietnamese Extended)           | `Inches(0.12)` (default)       |
| Latin (with Vietnamese Extended ếẫỗ)     | `Inches(0.14)`                 |
| CJK                                      | `Inches(0.14–0.16)`            |
| Devanagari / Bengali (matras / conjuncts)| `Inches(0.16–0.18)`            |
| Thai / Lao / Khmer (tone marks above)    | `Inches(0.16–0.18)`            |
| Arabic / Hebrew                          | `Inches(0.13)`                 |

When the deck mixes scripts, take the max — line breathing-room is
visual, an under-spaced Thai run in an otherwise Latin deck reads as
"the Thai slide is broken".

> **Source for these numbers.** Measured against Noto Sans / Noto
> Serif / IBM Plex line-height at 14pt body with full diacritic stacks
> (e.g. Devanagari conjuncts ष्ट्र, Thai 4-mark sequences ก़ํ้, stacked
> Vietnamese ỗ). Adjust downward for condensed faces (Inter Condensed,
> Noto Sans Condensed) and upward for display sizes ≥ 24pt where
> diacritic ratios grow.

## Audit checklist

After re-export, confirm all five layers:

- [ ] Layer 1: Each CSS class in the HTML maps to the intended family
      in the export script's font table.
- [ ] Layer 2: All declared families exist on the rendering machine
      (`fc-list | grep`).
- [ ] Layer 3: No variable-font filename pretending to be a static
      family. `~/Library/Fonts/` shows multi-file static families for
      every face used.
- [ ] Layer 4: `unzip + grep typeface` returns only the design-system
      fonts. No `Microsoft JhengHei` / `Calibri` / `Arial` / `Georgia`
      / `Consolas` residue.
- [ ] Layer 5: No run from a no-italic script (CJK / Arabic / Hebrew /
      Devanagari / Thai) has `italic=True` set with a Latin italic
      face in the `<a:latin>` slot.
- [ ] **Beyond CJK:** RTL slides set `<a:rtl val="1"/>` on the
      paragraph's `pPr` — verify with:

      ```bash
      unzip -o deck.pptx -d /tmp/audit
      grep -h '<a:rtl' /tmp/audit/ppt/slides/*.xml | sort -u
      # Expect a hit for every fa / ar / he slide; empty output on
      # an RTL deck means the directionality wasn't propagated.
      ```

      Cursor `gap` is bumped per the line-height table above when the
      deck includes Vietnamese, Devanagari, Thai, or Khmer content.

If all five pass and the user still reports "the type looks wrong",
ask for a screenshot pointing at the specific glyph or word — the
remaining bugs are usually license-restricted fonts not embedded into
the file (see `SKILL.md` Step 5 verification).

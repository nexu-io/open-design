# Magazine Directions

5 **preset directions**. Each direction packages up "which theme color to use / which layouts / how many slides / how to write the chrome copy," so you don't end up offering 5 unrelated options across the 6 clarifying questions.

> Inspiration: the "20 design philosophies × 5 streams" of [alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design): we compressed it into 5 magazine-flavored directions, each mapped to one preset in `themes.md` + some combination from `layouts.md`.

---

## When to use this document

At the start of SKILL.md's `Step 1 · Clarify intent`: **first let the user pick one of these 5 directions**, then ask about theme color / duration / audience / outline. The flow is:

```
1. The user says "I want to make a talk deck"
2. You (the agent) introduce the 5 directions (copy the 1-line summary below)
3. The user picks a direction (or says "I don't know, you recommend")
4. By the chosen direction you have answered "theme color" and "slide count," then ask the remaining 4
```

**Hard rule**: the direction can only be picked from the 5 below, no mixing. Mixing = walking the failure path that huashu-design validated (brand asset protocol v1). If the user is unhappy with all 5, gently steer them to the closest one, then allow slight tone customization in `chrome` / `kicker`, **but never change the colors**.

---

## 1. Monocle Editorial · International magazine style ✦ Default recommendation

**Keywords**: restraint, knowledge, cross-national, *taste*

| Recipe | Choice |
|---|---|
| Theme color | 🖋 Ink Classic |
| Recommended slide count | 18–24 pages (60% non-hero / 40% hero) |
| Workhorse layouts | **1 Cover / 2 Act divider / 4 Lead image + text / 8 Big quote / 10 Image + text mix** |
| Chrome copy | `Vol.04 · Spring 2026` / `Act II · 12 / 24` / `lukew.com · 2026.04` |
| Kicker style | short English + middot: `THE TWIST` / `BUT` / `DEC.` |
| Foot copy | `Page 12 · 一种新的工作方式` |

**Fits**: commercial launches, industry keynotes, product promotion, personal-brand consolidation talks. **Just pick this by default**, it won't go badly wrong.

**Counter-example**: a deeply technical report (density too low), an ops retro with lots of tabular data (no suitable layout).

**Visual anchors**: *Monocle* / *Apricot Magazine* / *A Book Apart* / *Apartamento*.

---

## 2. WIRED Tech · Data + engineering

**Keywords**: hard data, pipelines, comparison, a sense of the future

| Recipe | Choice |
|---|---|
| Theme color | 🌊 Indigo Porcelain |
| Recommended slide count | 14–18 pages (light, data-dense) |
| Workhorse layouts | **1 Cover / 3 Big numbers / 6 Pipeline / 7 Question page / 9 Before/After** |
| Chrome copy | `Q2 / 2026 · Field Report` / `Data · 03` / `Eng Notes` |
| Kicker style | all caps + numbers: `38× FASTER` / `RUNTIME 04` / `CASE 02` |
| Foot copy | `Page 03 · benchmark` / `methodology footnote` |

**Fits**: technical keynotes, research talks, benchmark reports, internal engineering-team communication, AI product demo day.

**Counter-example**: a humanist quote talk (too cold), an art brand (not warm enough).

**Visual anchors**: *WIRED* longform / *MIT Technology Review* / *The Pudding* / *Stripe Press*.

**Special tip**: use English mono for each stat-card's `stat-label` (this is core to the WIRED style), and don't add thousands separators to numbers (not engineering enough); use `K` / `M` / `×` shorthand.

---

## 3. Kinfolk Slow · Slow living / humanist

**Keywords**: whitespace, serif, warmth, private salon

| Recipe | Choice |
|---|---|
| Theme color | 🍂 Kraft Paper |
| Recommended slide count | 9–12 pages (slow, spacious, low density) |
| Workhorse layouts | **1 Cover / 4 Lead image + text / 8 Big quote / 10 Image + text mix / 2 Act divider** |
| Chrome copy | `Vol.07 · Autumn` / `一封信 · 03` / `Notes from Kyoto` |
| Kicker style | Chinese short phrase + punctuation: "给一个朋友。" / "晚秋。" / "Letter Three" |
| Foot copy | `Page 03 · Letter Three` / `2026 · Spring Issue` |

**Fits**: private salons, book talks, interview retros, lifestyle brands, personal essays.

**Counter-example**: product launches (too slow), technical talks (too soft), serious data (information density too low).

**Visual anchors**: *Kinfolk* / *The Gentlewoman* / *Cereal* / *Drift Magazine*.

**Special tips**:
- **Deliberately keep the slide count under 10**: Kinfolk's core is "less is more," don't cram it full
- Use Layout 8 (big quote) and Layout 10 (image + text mix) heavily
- Don't use Layout 3 (big numbers): it clashes with the temperament
- Make the `<title>` text, section names, and kicker all serif + Chinese short phrases

---

## 4. Domus Architectural · Architecture / sense of space

**Keywords**: scale, geometry, asymmetry, restrained showing-off

| Recipe | Choice |
|---|---|
| Theme color | 🌙 Dune |
| Recommended slide count | 12–18 pages (medium density, strong visuals) |
| Workhorse layouts | **1 Cover / 2 Act divider / 5 Image grid / 9 Before/After / 10 Image + text mix** |
| Chrome copy | `Spazio 09 · Project File` / `Plan · 03` / `Fig.4` |
| Kicker style | number + category: `PROJECT 04` / `SECTION B` / `FIGURE 12` |
| Foot copy | `Page 09 · West Wing` / `1:200 scale` |

**Fits**: design / architecture case talks, product design reviews, brand visual launches, gallery-style portfolio showcases.

**Counter-example**: quote talks (too hard), technical deep dives (not good at pipelines).

**Visual anchors**: *Domus* / *Apartamento* / *Mark Magazine* / *Pin-Up*.

**Special tips**:
- **Leave every hero page "60% empty"**: don't cram it full; the architectural feel comes from breathing room
- Use Layout 5 (image grid) heavily but **place only 4 large images**, not 6 small ones
- Keep the `chrome` copy austere, all English + numbers

---

## 5. Lab / Reference · Academic + craft manual

**Keywords**: restraint, figures and tables, reproducible, engineers love it

| Recipe | Choice |
|---|---|
| Theme color | 🌿 Forest Ink |
| Recommended slide count | 16–24 pages (high density, with charts) |
| Workhorse layouts | **1 Cover / 2 Act divider / 3 Big numbers / 6 Pipeline / 9 Before/After** |
| Chrome copy | `Field Notes · Vol.II` / `Section 3.2 · Method` / `Reference 04` |
| Kicker style | numbering: `§ 3.2` / `Ref. 04` / `Method 01` |
| Foot copy | `Page 12 · 3.2 Calibration` / `appendix A` |

**Fits**: academic talks, internal research retros, sustainability / nature themes, long-term product retros, methodology-driven craft talks (coffee / perfume / tea).

**Counter-example**: commercial launches (too calm), marketing campaigns (not catchy enough).

**Visual anchors**: *National Geographic* (old style) / *Hand-Eye Magazine* / *Nautilus* / *MIT Press* book layouts.

**Special tips**:
- Heavy use of `meta-row` to annotate source, method, references
- Use `<figcaption class="img-cap">` to number each image **more frequently than in other directions**
- Use § section numbers in `kicker`, not exclamatory sentences

---

## Recommendation quick reference (if the user describes an intent, which one should you pick)

| What the user says | Recommended direction |
|---|---|
| "general talk" / "don't know what to pick" | **1. Monocle** |
| "one-person company / AI folding / startup demo day" | **1. Monocle** (default) or **2. WIRED** (if more technical) |
| "AI / benchmark / model evaluation" | **2. WIRED** |
| "product launch / engineering-team talk" | **2. WIRED** |
| "book talk / interview / one person's story" | **3. Kinfolk** |
| "private salon / sharing among friends / weekend-chat style" | **3. Kinfolk** |
| "design case / brand launch / portfolio showcase" | **4. Domus** |
| "architecture / space / installation" | **4. Domus** |
| "academic / research / methodology / tutorial" | **5. Lab** |
| "sustainability / environmental / nature theme" | **5. Lab** |

---

## Decision record (do before generating)

After picking a direction, **create or update `项目记录.md` (Project Record) in the project folder** (or `大纲-v1.md`, Outline v1), with the first line stating clearly:

```markdown
# [Talk Title] · Project Record

- Direction：**Monocle Editorial** （from `references/styles.md`）
- Theme：🖋 Ink Classic
- Audience：internal team (product + design)
- Duration：25 min · ~18 slides
- Chrome style：Vol.04 / Act II / 12 of 18
- Kicker style：short English + middot
```

Update this section every time you adjust the direction in later iterations. **Do not switch directions midway**: the "tone" differences between the 5 directions are larger than you'd expect, and mixing them tears the deck apart.

---

## ❌ What not to do

- ❌ Mix the layout choices of the 5 directions (e.g. Monocle paired with multiple Layout 6 Pipeline pages + Kinfolk-style chrome): messy
- ❌ Invent a 6th direction yourself ("I want a 'tech + literary' style"): gently steer them to the closest one and tell them the historical failure rate of mixing is very high
- ❌ Switch directions midway, e.g. at page 8 you suddenly feel "Kinfolk would be better": the first 7 pages are then wasted; either start over entirely or stick with the original direction to the end
- ❌ Spend time on a layout that doesn't belong to the direction (e.g. writing 4 pages of Layout 6 Pipeline in Kinfolk): that's a signal you picked the wrong direction

## ✅ What you should do

- ✅ Pick only from the 5 directions, and use the chosen one to answer the other 5 clarifying questions
- ✅ State the direction clearly on the first line of `项目记录.md` (Project Record) and keep it unchanged throughout
- ✅ Let the three text slots chrome / kicker / foot "speak for" the direction: they carry half the direction's recognizability
- ✅ If unsure, **default to Monocle Editorial**: it's the lowest-failure-rate fallback of the 5 directions

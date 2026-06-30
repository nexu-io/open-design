# Category Cookbook

Per-category cheat sheet for the 11 most common Rednote (小红书) content types. Each entry maps a category to:

- **What we can do** — concrete poster types this skill produces well.
- **Style mode** — which side of the system (Editorial / Swiss) fits.
- **Recipes** — which layout IDs (M01-M15 / S01-S12) are first reach.
- **Text scheme** — how text relates to image (text-on-image / text-beside-image / text-only).
- **Image source** — where the photos come from.
- **Common pitfalls** — the way this category breaks.

This is a routing document. When the user names a category, find the row here and start from the listed recipes instead of building from a blank file.

For any category, if a poster has a full-bleed image with text on top, also follow `image-overlay.md` (photo qualification, localized tint fallback, and subject avoidance).

---

## 旅行 · Travel

**Strongest fit.**

- **Recipes**: M01 (text-led cover, no photo dominance) **or M16 (image-led cover, when the user has 1+ great photos)**, M02 (field-note photo), M11 (marginalia essay), M07 (closing note), S11 (itinerary ledger). For image-heavy submissions use the M16 → S11/M05 → M02 sequence in `references/content-planning.md`.
- **Style mode**: Editorial × kraft-paper / dune (warm-tone destinations) or × forest-ink (mountain/wilderness). Swiss × IKB works for "trip data report" style.
- **Text scheme**: Text beside image is the default. Cover can use text-on-image only when the photo has a quiet zone; add localized tint only if the thumbnail check fails. Body pages use photo + caption pairs (field-note style).
- **Image source**: User photos > Pexels (for China destinations — supports Chinese keyword search) > Unsplash (`/s/photos/<destination>`, best for overseas / English keywords) > Flickr CC (`license=2,3,4,5,6,9`, when you need documentary "real trip" feel rather than postcard polish). Always log to `assets/SOURCES.md`.
- **Content shape**: 5-7 pages. Cover (destination + dates) → atmosphere photo + lead → itinerary ledger → 2-3 field notes (one location each) → closing quote / next-stop teaser.
- **Pitfalls**: Generic "best places in X city" listicle voice. Cure: keep one specific date / weather / mileage detail per page to anchor it as observed, not researched.

See: `local-tests/demo-image-01-yading/` for a reference build.

---

## 职场 · Workplace

**Strongest fit.** This is what Swiss-International was made for.

- **Recipes**: S01 (cover), S02 (comparison), S05 (warning rows), S06 (pipeline), S07 (takeaway ledger), S09 (KPI tower), S11 (stacked ledger), S12 (matrix + hero stat).
- **Style mode**: Swiss × IKB Blue or × Safety Orange. Avoid lemon-yellow / lemon-green for serious workplace content; they read as marketing.
- **Text scheme**: Text-only or text-with-diagram. Almost never text-on-photo (workplace photos read as stock).
- **Image source**: Avoid stock business photos. If you need an image, prefer a diagram, a screenshot of a real artifact (Notion, Linear, Figma), or omit. Generated images rarely add value here.
- **Content shape**: 5-9 pages. Cover question / claim → context KPI → 3-5 numbered insights as ledger → one comparison or pipeline diagram → takeaway.
- **Pitfalls**:
  1. **Listicle voice** ("8 个让你..."). Cure: rewrite as a numbered argument, not numbered tips. Each row makes a falsifiable claim, not a platitude.
  2. **Cheap "advice" energy** — soft language ("一定要", "千万别"). Cure: replace with observed action verbs and a number.
  3. **Stock-photo seasoning** — handshake, laptop-with-coffee. Cure: omit, or use a small Lucide icon glyph instead.

---

## 游戏 · Game

**Strong fit** for journals, recap, build/strat lists. **Has image-rights risk** that the user must accept.

- **Recipes**: M01 (cover with full-bleed art), M08 (boss tier ledger), S07 (takeaway ledger), S11 (chapter timeline), M15 (build before/after).
- **Style mode**: Editorial dark (ink-classic with paper inverted to near-black) for atmospheric games (黑神话 / Elden Ring). Swiss for esports / competitive data ("胜率 / KDA / 出装").
- **Text scheme**: Text-on-image is standard for game covers because game art is the primary draw. Use subject mapping and thumbnail checks from `image-overlay.md`; add a localized, image-toned tint only where the title needs support.
- **Image source**: Wallhaven JSON API (see SKILL.md Step 6) for keyword pulls, official screenshots for specific moments. Always disclose copyright risk and log to `SOURCES.md`. If user opts out of attribution, do not crop the credit out of the image itself.
- **Content shape**: 4-6 pages. Cover (game name + playtime) → first impression page → chapter-by-chapter ledger → memorable boss / scene page → verdict.
- **Pitfalls**: 
  1. **Score-card seriousness** (8.5/10 in a giant block). We're not IGN — keep the verdict as one short clause, not a number.
  2. **Generic fan-art covers** with the game logo retraced — looks counterfeit. Prefer key art the publisher already released.

See: `local-tests/demo-image-02-wukong/` for a reference build.

---

## 影视 · Film & TV

**Strong fit** for reviews, scene analysis, quote cards. **Image-rights risk**, same as Game.

- **Recipes**: M04 (pull quote — for memorable lines), M10 (evidence feature — for scene analysis), M11 (marginalia essay), S02 (two signals — for comparison reviews), S12 (matrix — for film weeklies).
- **Style mode**: Editorial × ink-classic or × indigo-porcelain. Letterboxd visual vocabulary fits Editorial naturally — serif title, italic original-language subtitle, monospace metadata.
- **Text scheme**: Text-beside-image for review cards (poster on left, take on right). Text-on-image only for atmospheric "what this film made me feel" quote pages.
- **Image source**: Official posters / stills. Do not generate fake stills — they look immediately wrong.
- **Content shape**: For single film: cover (title + year + 1-line take) → 1-2 scene captures → director-quote / theme pullquote → verdict ledger. For weekly: matrix of 6-9 films + one hero recommendation.
- **Pitfalls**: 
  1. **Fake film-festival typography** — adding fake awards badges. Don't.
  2. **Spoiler in title without warning.** If a cover gives away the ending, mark `剧透` in the kicker.

---

## 美食 · Food

**Split fit.** Recipes work. Food-photo showcase does not.

### What works: recipes & food essays

- **Recipes**: M16 (image-led cover when finished-dish photo is hero-worthy) → S11 (ingredient/price ledger) → M14 (cooking steps pipeline) → M02 (extra dish detail). Also M05 (checklist for shopping list).
- **Style mode**: Editorial × kraft-paper feels like a cookbook. Swiss × Lemon Yellow / Safety Orange works for "cost-per-serving" data posts.
- **Text scheme**: Text-with-image. The finished-dish photo is one frame; everything else is text/data.
- **Image source**: User photos of finished dish are best. For 中式菜品 / 国内餐厅 scenes, try Pexels first (Chinese keyword search hits 国内场景 better than Unsplash). Unsplash food photos read as Western stock; use sparingly.
- **Content shape**: 5-7 pages. Cover (dish name + one verdict line) → ingredients ledger → numbered steps pipeline → finished-dish photo page → tips / variation marginalia.

### What does not work: food-photo showcase / restaurant reviews requiring drool-shot art direction

- We don't shoot food, and stock food photos kill the "I cooked this" trust signal.
- For restaurant posts, require user-shot photos at the table. If they don't have them, push back — a stock-photo restaurant post is filler.
- For "look at this cake" pure-display posts, refer the user to a photography-focused workflow, not this skill.

**Pitfalls**:
1. **Excited recipe voice** ("超绝!!!"). Editorial doesn't shout — let the dish do the talking.
2. **Calorie-shaming asides** in casual recipes. Drop them.

---

## 彩妆 · Makeup

**Split fit.** Tutorials and product reviews work. Selfie-driven "look" posts need user images we can't generate.

### What works

- **Recipes**: M14 (tutorial step pipeline), S12 (product matrix), S11 (空瓶 / 复购 ledger), S02 (色号对比).
- **Style mode**: Swiss × Lemon Yellow / Lemon Green / Safety Orange for bright product reviews. Editorial × indigo-porcelain for editorial-feel beauty essays.
- **Text scheme**: Text-with-image. Each step gets a small hand/face crop + a one-sentence instruction.
- **Image source**: User photos. Stock makeup photos have legal grey areas and look generic.
- **Content shape**: Tutorial — cover (look name + occasion) → tools/products ledger → 5-7 numbered step pipeline → finish photo → tips marginalia.

### What does not work

- "Get-the-look" posts that rely on a recognizable model face. We can't generate those reliably; user must supply.
- Trending Y2K / 哥特 / dolly aesthetic decoration — outside the Swiss/Editorial system.

**Pitfalls**:
1. **Color-swatch inaccuracy** if you eyeball CSS hex from a photo. Always ask the user for the official shade name + hex from the brand.
2. **Skin-tone homogenization** when scaling photos — preserve user-supplied photos at native ratio.

---

## 健身 · Fitness

**Half fit.** Training plans and nutrition data work. Progress photos need user.

- **Recipes**: M14 (workout pipeline), S11 (set/rep ledger), S09 (KPI tower for weekly volume), M15 (before/after — needs user photos).
- **Style mode**: Swiss × Safety Orange / Lemon Green for energetic training posts. Editorial × forest-ink for "mindful movement / 山系跑步" essays.
- **Text scheme**: Mostly text-with-data. Progress posts text-beside-image.
- **Image source**: User progress photos (mandatory for before/after). For ambient illustrations, generated gym/outdoor shots are fine.
- **Content shape**: Training plan — cover (cycle name + duration) → weekly schedule ledger → per-day pipeline of exercises → recovery / nutrition note → closing data.
- **Pitfalls**:
  1. **Fake aspirational numbers** (50 kg 卧推 8 周从 0 起步). Don't.
  2. **Body-shaming subtext** in before/after captions. Use neutral language.

---

## 家居 · Home & Living

**Half fit.** Item recommendations, before/after, and floorplan analysis work. Pure interior-design photo posts need user photos.

- **Recipes**: M16 (image-led cover when user has a strong room photo) → S11 (item ledger with price) → M02 (detail crops). Also M15 (before/after — needs paired user photos), M11 (marginalia for floorplan annotation), M03 (essay-style decor manifesto).
- **Style mode**: Editorial × kraft-paper / dune for warm rustic homes. Editorial × indigo-porcelain for cool modern. Swiss × IKB for "rental hack data" posts.
- **Text scheme**: Item recommendations are text-beside-image (small product crop + name + price + reason). Before/after is two photos with mid-page divider.
- **Image source**: User interior photos. Web-sourced interior images have heavy copyright exposure (Pinterest creators are vigilant) — avoid unless user explicitly authorizes.
- **Content shape**: Item rec — cover (room + budget) → 4-6 item rows ledger → 1 hero detail crop → closing tip.
- **Pitfalls**: 
  1. **Pinterest-aesthetic stock** that the user can't actually reproduce. Stick to what they live in.
  2. **Price drift** — products move quickly. Don't quote a price more than 90 days old without re-checking.

---

## 穿搭 · Outfit / Fashion

**Weak fit.** Mood-board essays and product reviews work; OOTD full-body shots are outside our scope.

### What works

- **Recipes**: M11 (marginalia essay — "this week I wore"), S12 (item matrix), M04 (style manifesto pull-quote), S11 (capsule wardrobe ledger).
- **Style mode**: Editorial × ink-classic / indigo-porcelain for editorial-feel essays. Swiss × Lemon Yellow / Safety Orange for capsule-wardrobe data posts.
- **Text scheme**: Text-beside-image — small item crops as evidence, one full-body hero only if user provides.
- **Image source**: User OOTD photos (we don't generate body shots). For mood-board context, web-sourced flat-lay or product photos are okay with disclosure.
- **Content shape**: Capsule guide — cover (season + count) → wardrobe ledger → 1-2 outfit demonstrations → care/styling marginalia.

### What does not work

- Daily OOTD posts. The skill cannot generate or solicit body photography.
- High-styling editorial fashion shoots — requires real photography production.

**Pitfalls**: 
1. **Brand-and-price-tag overload** turning every poster into an ad. Limit to 6 named items max.
2. **Generic "minimalist 25 件夏季基础款" listicle**. Cure: anchor to a specific climate / lifestyle constraint.

---

## 情感 · Emotion / Personal Essay

**Weak fit.** Essay-with-pullquote works. Dreamcore / 氛围感 aesthetic does not fit our system.

### What works

- **Recipes**: M04 (pull quote / thesis), M09 (atmospheric thesis), M11 (marginalia essay), M13 (hero question — for rhetorical-question covers), M07 (closing note).
- **Style mode**: Editorial × ink-classic or × dune. Magazine pace with restraint.
- **Text scheme**: Mostly text-only with one quiet supporting image. The text is the content.
- **Image source**: Quiet documentary-style photo (a window, a chair, a hand) — user-supplied is best. If sourcing: **Flickr CC** (`license=2,3,4,5,6,9`) is the strongest match — real interiors, real hands, real moments without stock polish. Pexels for China-context scenes (Chinese keyword search). Unsplash works but skews styled; avoid the "moodcore" gradient-light stock entirely.
- **Content shape**: 3-5 pages. Cover question → essay split (M03) or atmospheric thesis → pull quote → closing note. Resist over-stretching to 9 pages.

### What does not work

- "梦核 / 氛围感" with soft fluorescent gradients, glowing ovals, hazy lights. Our anti-pattern list explicitly bans those decorations.
- Y2K / 早期网络回忆 / 千禧辣妹 aesthetic — outside Swiss and Editorial both.
- Heavy emoji / kaomoji captions. We use no emoji.

**Pitfalls**:
1. **Inspirational generic copy** ("愿你...愿我..."). Editorial demands specifics — name the day, the weather, the person.
2. **Pretty empty space** — page after page of one pullquote on paper. Risk: reads as filler. Mix with one M02 field photo or M11 marginalia to ground it.

---

## 推荐 · Recommended / Mixed

**Default channel.** This category is the catch-all on the platform; the actual content underneath is always one of the above 10.

When the user says 推荐 without specifying, ask which underlying type before designing. If they can't say, default to:

- Swiss × IKB for "I tested 5 products" → S12 matrix + S11 ledger.
- Editorial × kraft-paper for "this week's reading / watching" → M02 field notes.

---

## Capability Circle Summary

Categories where this skill produces strong work end-to-end (text + structure + image story all from us):

- 旅行 · 职场 · 推荐 (with subtype)

Categories where the skill is strong on text/structure but needs user photos for image story:

- 游戏 · 影视 · 美食(食谱) · 彩妆(教程) · 健身 · 家居 · 穿搭(精选)

Categories that are outside scope (skill cannot reliably produce):

- 美食(菜品大片摆盘) · 穿搭(日常 OOTD 全身) · 情感(梦核 / 氛围感装饰风)
- Any post requiring high-saturation Y2K / 千禧辣妹 / dolly / kawaii decoration vocabulary
- Pure photography showcase posts where the image is the entire product

Be explicit with the user when their request lands in the "outside scope" bucket. Do not promise a result the system was not designed to make.

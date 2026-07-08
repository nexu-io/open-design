# Naver SmartEditor blog HTML — craft rules

Brand-agnostic technical constraints for producing a paste-ready Naver SmartEditor
blog article in HTML. Every rule grounds in observed SmartEditor paste behavior.
Brand-specific facts (voice, categories, disclaimers, banned claims) belong in
`brands/<brand>/` brand context (core `brand.md` + blog deliverable), NOT here.

> Source: ported from the bodoc `blog-cardnews/docs/blog-naver-editor-style.md`
> style SSoT (analyzed from a real published post). Channel rules only — de-branded.

---

## 1. Section heading = vertical-line blockquote (no `<p>` wrapper)

The first line of every section is a vertical-line heading:

```html
<blockquote style="border-left:5px solid #000;padding:8px 0 8px 14px;margin:24px 0 16px 0;"><strong>섹션 제목</strong></blockquote>
```

The `<blockquote>`'s **direct child must be an inline `<strong>`** — no `<p>`
wrapper. A wrapper makes Naver paste it as a multi-line block → maps to "인용구 3"
(full-height bold bar). The target is "인용구 2" (short bar + one inline bold line),
which only triggers with a direct inline `<strong>` child.

> Border color: `#000` per the dedicated style SSoT. (Two secondary bodoc sources
> use `#333`; the dedicated style doc wins — use `#000`.)

**Checklist item (fails lint):** a `<blockquote>` whose child is `<p>`, or any
heading not wrapped in `<blockquote><strong>`.

---

## 2. No font wrapper `<div>`

Do not emit a wrapping `<div>` with `font-family`/`font-size` — Naver ignores it.
The user applies font manually (Ctrl+A → 나눔고딕 13pt) after paste.

> The Marketing AX viewer's **"네이버용 서식 복사"** button automates this: on copy it
> inlines `font-family`/`font-size` on each *block* element (`<p>`/`<li>`/`<td>`/
> `<blockquote>`/`<strong>`) — never a wrapper `<div>` — so a Naver paste keeps
> 나눔고딕 13px with no manual step. The generated artifact still omits font (this rule
> stands); the button is a paste-time clipboard convenience, not an artifact change.

**Checklist item (fails lint):** a top-level `<div style="font-...">` wrapping the body.

---

## 3. No inline `font-weight` on block elements

Block elements (`<p>`, `<li>`, `<blockquote>`, `<td>`) must NOT carry inline
`font-weight`. Use `<strong>`/`<b>` inline tags only. Inline weight on a `<p>`
cascades to following paragraphs on paste → the whole body renders bold.

**Checklist item (fails lint):** `font-weight` in the inline `style` of any
`<p>`/`<li>`/`<blockquote>`/`<td>`.

---

## 4. Color emphasis = red `#dc3545` only

The only emphasis color is red `#dc3545`, reserved for traps / denials / risk.
Budget: **1–2 reds per 1,000 characters.** Blue (`#0075FF`) is forbidden.

```html
<span style="color:#dc3545;font-weight:bold;">청구 거절</span>
```

`font-weight` is allowed on the color span itself (it is not a block element).
Non-color emphasis = `<strong>`/`<b>`.

**Checklist item (fails lint):** any non-`#dc3545` text color; more than ~2 reds
per 1,000 chars; any blue text.

---

## 5. No color span inside `<table>`

Table cells use black text + (if needed) `<strong>` only — no colored spans.

**Checklist item (fails lint):** a `style="color:..."` span inside `<td>`/`<th>`.

---

## 6. No inline body images

The body is text-only — no `<img>` in the article body (thumbnails/banners are a
separate, out-of-scope deliverable).

**Checklist item (fails lint):** any `<img>` in the body HTML.

---

## 7. `<hr>` between sections (except the last)

```html
<hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0;">
```

**Checklist item (fails lint):** missing `<hr>` between two sections, or a trailing
`<hr>` after the final section / before the disclaimer.

---

## 8. `<blockquote>` is heading-only

`<blockquote>` is reserved for vertical-line headings (rule 1). Terms, statistics,
and code breakdowns go in `<p>` paragraphs, not quote boxes.

**Checklist item (fails lint):** a `<blockquote>` containing non-heading prose.

---

## 9. Comparison data → `<table>` (1–2 per article)

If a list would be ≥3 rows of "X → Y" mapping, use a `<table>` instead:

```html
<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;">
  <thead><tr style="background:#f8f9fa;">
    <th style="border:1px solid #e5e5e5;padding:10px;text-align:left;color:#333;font-weight:600;">컬럼</th>
  </tr></thead>
  <tbody><tr>
    <td style="border:1px solid #e5e5e5;padding:10px;color:#333;">셀</td>
  </tr></tbody>
</table>
```

**Checklist item (fails lint):** ≥3-row "X→Y" comparison rendered as a `<ul>`.

---

## 10. Emoji budget

Emoji may sit at a **heading's end** or a body/list position; keep them sparse and
purposeful. Budget: **≤1 per heading, ≤2 per section, ≤12 per article.** Whether emoji are
functional-only (`🔍 ⚠️ 💡 📋 ✅`) or expressive is a **brand voice** decision — see the brand's `brands/<brand>/` context.

**Checklist item (fails lint):** >1 emoji in a heading; >12 per article; >2 in one section.

---

## 11. Disclaimer last

The final element is a small-print disclaimer paragraph (literal text is a brand
fact from the brand's `brands/<brand>/` context; the style here is brand-neutral):

```html
<p style="font-size:13px;color:#888;margin-top:24px;">…브랜드 면책 문구…</p>
```

**Checklist item (fails lint):** missing disclaimer, or disclaimer not last.

---

## 12. Diversify intro hooks

Vary the opening per article (사례형 / 오해해소형 / 수치충격형 / 통념 깨기). Do NOT
clone a fixed template like "결론부터 말씀드릴게요!".

An answer-first opening *structure* (a brand-voice choice in the brand's `brands/<brand>/` context) is not a
template violation — vary the hook wording, not the structure.

> Not a lint rule (judgment): self-review flags a templated opener.

---

## 13. Length guide (the brand's blog deliverable context is authoritative)

Default channel target: **2,300–2,800 characters** of body text. Hard SEO floor:
**≥1,500 characters.** If the active brand's blog deliverable context specifies a
different range, that value wins.

**Checklist item (fails lint):** body < 1,500 chars.

---

## Preview shell (artifact document layout)

The produced artifact is a **self-contained HTML document**: a preview shell
around the paste target.

- Structure: `.wrap` > `.meta` (label line, e.g. `네이버 블로그 · [카테고리] · 초안`)
  + `h1.doc-title` (the post title) + `.doc-sub` (copy instructions) + `.paper` >
  **`.article`** (the paste-target body).
- **`.article` inner HTML is the only paste target.** Everything outside is
  preview-only chrome; the viewer's "네이버용 서식 복사" button copies `.article`
  content only.
- **The title lives in `h1.doc-title` only** — never duplicate it inside
  `.article` (Naver's editor has a separate title input field).
- **Rules 1–13 apply to the `.article` content**, not the shell.
- The `<style>` block is shell-only (preview readability). Formatting of
  `.article` elements stays **inline** per the rule 1/7/9/11 snippets — paste
  drops `<style>`. The shell body font does not violate rule 2: rule 2 bans a
  font wrapper `<div>` *inside the paste target*.

Shell template (fill `[글 제목]`/`[카테고리]`; `.article` content follows rules 1–13):

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>[글 제목] — 네이버 블로그 초안</title>
<style>
  :root { --ink:#1D2024; --sub:#5A5E63; --line:#e5e5e5; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background:#f5f6f7; color:var(--ink); font-family:'Nanum Gothic','Apple SD Gothic Neo',-apple-system,system-ui,sans-serif; -webkit-font-smoothing:antialiased; line-height:1.75; }
  .wrap { max-width:760px; margin:0 auto; padding:40px 20px 80px; }
  .meta { font-size:12px; letter-spacing:.04em; color:var(--sub); text-transform:uppercase; margin-bottom:8px; }
  .doc-title { font-size:26px; line-height:1.3; font-weight:800; letter-spacing:-0.02em; margin:0 0 6px; }
  .doc-sub { font-size:13px; color:var(--sub); margin:0 0 28px; }
  .paper { background:#fff; border:1px solid var(--line); border-radius:8px; padding:36px 34px; font-size:15px; }
  .article p { margin:0 0 14px; }
  .article table { font-size:14px; }
  @media (max-width:640px) { .paper { padding:26px 20px; } .doc-title { font-size:22px; } }
</style>
</head>
<body>
  <div class="wrap">
    <div class="meta">네이버 블로그 · [카테고리] · 초안</div>
    <h1 class="doc-title">[글 제목]</h1>
    <p class="doc-sub">아래 흰 영역이 붙여넣기용 본문입니다. 뷰어의 <strong>“네이버용 서식 복사”</strong>로 복사 → 스마트에디터에 붙여넣으세요.</p>
    <div class="paper">
      <div class="article">
        <!-- rules 1–13 body -->
      </div>
    </div>
  </div>
</body>
</html>
```

**Checklist item (fails lint):** post title text duplicated inside `.article`;
missing `.article` wrapper; paste-relevant element formatting hoisted into the
shell `<style>` instead of inline.

---

## SEO placement rules

- **Single long-tail target keyword.** No head keywords; one keyword per article.
  A different reader intent → a separate article.
- **Title: main keyword within the first 15 characters** (SEO scoring gives extra
  weight for the first 10 — earlier is better).
- **Density: 3–5 occurrences per 1,000 characters** (natural placement).
- **Length floor ≥1,500 chars** (see rule 13).
- **Reader-intent match** (정보형 / 방법형 / 비교형) — the article structure fits
  the searcher's intent.
- **Title pattern:** `[키워드] + [정보형 접미사]` (총정리 / 완벽 정리 / 체크리스트).
  No clickbait (충격 / 이것만 알면).
- **Self-score (5 items × 20 = 100):** keyword placement, density, length,
  intent-match, structure. Gate: ≥80 ship / 60–79 revise / <60 re-plan.

---

## Tone register (channel-general only)

- 경어체 + 구어체 mix: `~하는데요`, `~해요`, `~거든요`, `~인데요`.
- Avoid solo repetition of `~합니다`/`~입니다` (격식체 = data/citation/legal only).
- 종결 어미 다양화: don't end every sentence with `~거든요`; mix `~해요·~인데요·~지만요·~네요·~보세요`.

Brand-specific voice (persona, greeting, banned phrases) lives in the brand's
`brands/<brand>/` context (core `brand.md`).

---

## Lint checklist summary

| # | Rule | Fail condition |
|---|------|----------------|
| 1 | Heading blockquote | `<blockquote>` child is `<p>`; heading not in `<blockquote><strong>` |
| 2 | No font wrapper | top-level `<div style="font-...">` |
| 3 | No block font-weight | `font-weight` in `<p>/<li>/<blockquote>/<td>` style |
| 4 | Red only | non-`#dc3545` color; >2 reds/1000 chars; blue text |
| 5 | No table color | colored span in `<td>/<th>` |
| 6 | No body image | `<img>` in body |
| 7 | `<hr>` dividers | missing between sections / trailing |
| 8 | Quote = heading | `<blockquote>` with prose |
| 9 | Comparison table | ≥3-row X→Y as `<ul>` |
| 10 | Emoji budget | >1 emoji/heading; >12/article; >2/section |
| 11 | Disclaimer last | missing / not last |
| 13 | Length | body < 1,500 chars |
| 셸 | Preview shell | title duplicated in `.article`; missing `.article`; paste formatting hoisted to shell `<style>` |

**Compliant HTML (excerpt):**

```html
<blockquote style="border-left:5px solid #000;padding:8px 0 8px 14px;margin:24px 0 16px 0;"><strong>실손 세대별 도수치료 한도 🔍</strong></blockquote>
<p>도수치료 실비는 실손 세대에 따라 보장 한도가 다릅니다. 1~2세대는 비교적 넓게 적용되지만, 4세대부터는 횟수·금액 제한이 붙어요.</p>
<p>특히 <span style="color:#dc3545;font-weight:bold;">비급여 항목</span>은 세대별 자기부담률이 달라 청구 전 확인이 필요합니다.</p>
<hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0;">
```

**Non-compliant HTML (annotated):**

```html
<div style="font-family:'나눔고딕';font-size:13px;">           <!-- ✗ rule 2: font wrapper -->
  <blockquote style="..."><p><strong>제목</strong></p></blockquote> <!-- ✗ rule 1: <p> child -->
  <p style="font-weight:bold;">본문</p>                        <!-- ✗ rule 3: block font-weight -->
  <p>참고 <span style="color:#0075FF;">링크</span></p>          <!-- ✗ rule 4: blue -->
</div>
```

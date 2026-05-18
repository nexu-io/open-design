# Layouts · replit-deck

Ten paste-ready `<section class="slide">` blocks. Each has a **theme pairing** note — some layouts only look good in specific themes. Copy the block, replace `[REPLACE]` with real copy, tag with `data-screen-label`.

All layouts assume `<body data-theme="…">` is already set.

---

## L01 · cover-hero  (all themes)

Opens a deck. Huge display on top half, mono meta bar at top.

```html
<section class="slide center" data-screen-label="01 Cover">
  <div class="meta-bar">
    <span>[REPLACE] BRAND · CONTEXT</span>
    <span>[REPLACE] SEASON / NO.</span>
  </div>
  <div>
    <p class="eyebrow" style="margin-bottom: 28px;">[REPLACE] Eyebrow line</p>
    <h1 class="h-hero" style="max-width: 14ch;">[REPLACE] One sharp sentence.</h1>
    <p class="lead" style="margin-top: 28px;">[REPLACE] One concrete subhead.</p>
  </div>
</section>
```

**Theme notes**:
- `helix`: headline tight, muted subhead, no flourish.
- `holm`: eyebrow in uppercase mono colored `var(--accent)`. Headline uses `--font-serif-display`.
- `vance`: add `<div class="vance-top">` with 3-column meta instead of the plain meta-bar (see L08).
- `bevel`: wrap headline in `<span class="h-display-y2k">…</span>` (italic Y2K face).
- `atlas`: swap to L09 `chapter-plate` for cover.
- `bluehouse`: use L10 `pill-headline-cards-row` — the cover IS the card row.

---

## L02 · kpi-row-6  (helix · atlas · world-*)

Six big numbers in 3×2 grid. Replit slide-4 / slide-5 exactly.

```html
<section class="slide" data-screen-label="02 Operating Metrics">
  <div class="meta-bar">
    <span>[REPLACE] BRAND</span>
    <span>[REPLACE] 02 / NN</span>
  </div>
  <h2 class="h-xl" style="margin-top: clamp(40px, 6vh, 80px); margin-bottom: clamp(40px, 5vh, 64px);">Operating Metrics</h2>
  <div class="grid-6">
    <div>
      <div class="num-label">[REPLACE] Annual Recurring Revenue</div>
      <div class="num">$1.37B</div>
      <div class="num-delta">▲ 38% YoY</div>
    </div>
    <div>
      <div class="num-label">[REPLACE] Net Retention Rate</div>
      <div class="num">128%</div>
      <div class="num-delta">▲ 200 bps</div>
    </div>
    <div>
      <div class="num-label">[REPLACE] Paying Customers</div>
      <div class="num">42,850</div>
      <div class="num-delta">▲ 24% YoY</div>
    </div>
    <div>
      <div class="num-label">[REPLACE] Gross Margin</div>
      <div class="num">82.4%</div>
      <div class="num-delta">▲ 140 bps</div>
    </div>
    <div>
      <div class="num-label">[REPLACE] Free Cash Flow</div>
      <div class="num">$112M</div>
      <div class="num-delta">▲ 55% YoY</div>
    </div>
    <div>
      <div class="num-label">[REPLACE] CAC Payback</div>
      <div class="num">11 mo</div>
      <div class="num-delta">▼ 1 mo</div>
    </div>
  </div>
</section>
```

**Theme notes**:
- `helix`: all deltas are `var(--accent)` blue, mono family. Perfect fit.
- `atlas`: swap `num` font-family to serif display. Delta dots → vermilion. Add hairline dividers between rows.
- `world-dark` / `world-mint`: label color becomes `var(--accent)` yellow. Add `<span class="world-marker"></span>` before one standout label.

---

## L03 · split-hero-metric  (helix)

One dark card (ARR) left, five line-item metrics right. Replit slide-1.

```html
<section class="slide" data-screen-label="03 Metrics">
  <div class="meta-bar">
    <span>[REPLACE] Operating Metrics</span>
    <span>[REPLACE] · Helix</span>
  </div>
  <div style="margin-top: clamp(32px, 4vh, 48px); display: grid; grid-template-columns: 1fr 1.3fr; gap: clamp(32px, 4vw, 72px); height: 70vh;">
    <!-- hero card -->
    <div style="background: #0d0d0f; color: #f5f5f5; border-radius: 24px; padding: clamp(32px, 3vw, 56px); display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <div style="font-size: 15px; opacity: 0.7;">Annual Recurring Revenue</div>
        <div class="num" style="margin-top: 8px; color: #fff;">$1.37B</div>
        <div class="num-delta" style="color: var(--accent); margin-top: 12px;">▲ 38% YoY</div>
      </div>
      <div>
        <div style="height: 4px; background: rgba(255,255,255,0.12); border-radius: 2px; position: relative;">
          <div style="position: absolute; left: 0; top: 0; height: 100%; width: 55%; background: var(--accent); border-radius: 2px;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px; opacity: 0.5; margin-top: 12px; letter-spacing: 0.08em;">
          <span>FY24</span><span>TARGET $1.55B</span>
        </div>
      </div>
    </div>
    <!-- row metrics -->
    <div style="display: flex; flex-direction: column; justify-content: center; gap: clamp(16px, 2vh, 28px);">
      <div style="display: grid; grid-template-columns: 180px 1fr auto auto; gap: 24px; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border);">
        <span style="color: var(--muted);">Net Retention Rate</span>
        <div style="height: 4px; background: var(--border); border-radius: 2px; position: relative;"><div style="position: absolute; left: 0; top: 0; height: 100%; width: 68%; background: var(--accent); border-radius: 2px;"></div></div>
        <span class="num" style="font-size: 44px;">128%</span>
        <span class="num-delta">▲ 200 bps</span>
      </div>
      <!-- repeat 4× with: Paying Customers / Gross Margin / Free Cash Flow / CAC Payback -->
    </div>
  </div>
</section>
```

**Theme notes**: helix-only. Don't port to other themes — the dark card + blue relies on helix's specific ink + electric blue.

---

## L04 · memo-hero-statement  (holm)

Replit slide-2 exactly: serif statement left, lots of breath. Team names bottom-left, domain bottom-right.

```html
<section class="slide" data-screen-label="01 Cover">
  <div class="meta-bar">
    <span style="font-family: var(--font-serif-display); font-size: 32px; text-transform: none; letter-spacing: 0; color: var(--accent);">Holm</span><!-- wordmark -->
    <span>MEMO 04 &nbsp;/&nbsp; APR 2026</span>
  </div>
  <div style="margin-top: 30vh; max-width: 58vw;">
    <p class="eyebrow" style="color: var(--accent); margin-bottom: 28px;">— &nbsp; SERIES A — CONFIDENTIAL PRE-READ</p>
    <h1 class="h-xl" style="max-width: 18ch;">[REPLACE] Banking and back-office for the 1.4 million lawyers who were never supposed to be alone.</h1>
    <p class="lead" style="margin-top: 28px; max-width: 50ch;">[REPLACE] One-sentence thesis as the deck subtitle.</p>
  </div>
  <div style="position: absolute; bottom: clamp(40px, 5vh, 72px); left: clamp(56px, 7vw, 112px); right: clamp(56px, 7vw, 112px); display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;">
    <span><b>NAOMI VELEZ</b> — CO-FOUNDER, CEO · <b>DANIEL LIOR</b> — CO-FOUNDER, CTO</span>
    <span>HOLM.LAW</span>
  </div>
</section>
```

---

## L05 · two-column-ask  (holm)

Replit slide-5: "THE ASK" with fund allocation left + TEAM card right.

```html
<section class="slide" data-screen-label="05 The Ask">
  <div class="meta-bar">
    <span>04 — THE ASK &nbsp;<span style="display: inline-block; width: 40px; height: 1px; background: var(--accent); vertical-align: middle;"></span></span>
    <span>HOLM · 05</span>
  </div>
  <div style="margin-top: clamp(40px, 6vh, 80px);">
    <h2 class="h-xl" style="max-width: 22ch;">[REPLACE] $11.4M Series A, led by Felicis. Closing 6/15.</h2>
    <p class="lead" style="margin-top: 20px;">[REPLACE] Re-up from First Round and Cowboy. Notable angels: Patrick McKenzie, Olympia Hostler, Marshall Kirkpatrick.</p>
  </div>
  <div style="margin-top: clamp(32px, 4vh, 56px); display: grid; grid-template-columns: 1.1fr 1fr; gap: clamp(32px, 4vw, 64px); align-items: start;">
    <div>
      <p class="eyebrow" style="margin-bottom: 24px;">USE OF FUNDS — 24 MONTH PLAN</p>
      <div class="vstack" style="--gap: 20px;">
        <!-- one row -->
        <div style="display: grid; grid-template-columns: 60px 1fr; gap: 24px; align-items: start;">
          <span class="num" style="font-size: 28px; color: var(--accent);">52%</span>
          <div>
            <div style="font-weight: 600;">Engineering &amp; product</div>
            <div style="color: var(--muted); font-size: 14px; margin-bottom: 8px;">[REPLACE] Trust accounting, payroll, multi-state filings</div>
            <div style="height: 3px; background: var(--border); position: relative;"><div style="position: absolute; left: 0; top: 0; height: 100%; width: 52%; background: var(--accent);"></div></div>
          </div>
        </div>
        <!-- repeat: 28% Go-to-market / 12% Compliance / 8% Operations -->
      </div>
    </div>
    <div class="card" style="background: var(--surface); border: 1px solid var(--border);">
      <p class="eyebrow" style="color: var(--accent); margin-bottom: 20px;">THE TEAM</p>
      <div class="vstack" style="--gap: 20px;">
        <div style="display: grid; grid-template-columns: 48px 1fr; gap: 16px; align-items: start;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: color-mix(in oklch, var(--accent) 20%, var(--surface)); display: flex; align-items: center; justify-content: center; font-family: var(--font-serif-display); color: var(--accent);">N</div>
          <div>
            <div style="font-weight: 600;">Naomi Velez — CEO</div>
            <div style="color: var(--muted); font-size: 14px;">[REPLACE] bio line</div>
          </div>
        </div>
        <!-- repeat for Daniel Lior — CTO -->
      </div>
      <div style="border-top: 1px solid var(--border); margin-top: 24px; padding-top: 16px;">
        <p class="eyebrow" style="margin-bottom: 4px;">DIRECT</p>
        <div style="display: flex; justify-content: space-between; font-size: 14px;"><span>[REPLACE] email</span><span style="color: var(--muted);">[REPLACE] phone</span></div>
      </div>
    </div>
  </div>
</section>
```

---

## L06 · gallery-plate  (vance)

Replit slide-3 / slide-11 (Vance Studio): black top band, artwork, black bottom band.

```html
<section class="slide" data-screen-label="02 Plate 47" style="padding: 0;">
  <div class="vance-top" style="display: flex; justify-content: space-between; align-items: center;">
    <span style="font-family: var(--font-serif-display); font-size: 22px;">VANCE STUDIO <sup style="font-size: 9px;">®</sup></span>
    <span style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.15em;">II OF V · FEATURED</span>
    <span style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.15em;">© 2026 THE ARTIST</span>
  </div>
  <div style="flex: 1; display: grid; grid-template-columns: 1.1fr 1fr; gap: 0; align-items: stretch;">
    <div style="background: #0a0a0a; color: var(--bar-fg); padding: clamp(40px, 5vw, 80px); display: flex; flex-direction: column; justify-content: center;">
      <p class="eyebrow" style="margin-bottom: 16px;">CATALOG — PLATE 47</p>
      <h2 class="h-hero" style="font-family: var(--font-serif-display); font-weight: 400; font-style: normal;">
        Untitled<br><em style="font-family: var(--font-serif-display);">(Threshold)</em>
      </h2>
    </div>
    <div style="background: #dcdcdc; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); color: #888; font-size: 12px;">
      [REPLACE] artwork image goes here — 4:5 ratio
    </div>
  </div>
  <div class="vance-top" style="display: flex; justify-content: space-between; align-items: center;">
    <span style="font-family: var(--font-serif-display); font-style: italic; font-size: 16px;">Untitled (Threshold), 2022. Felt, plaster, and resin on plinth. 168 × 92 × 92 cm.</span>
    <span style="font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.15em;">PHOTOGRAPHY — M. AOKI</span>
  </div>
</section>
```

---

## L07 · campaign-cover  (bevel)

Replit slide-13: huge Y2K display wordmark, product photo right, dashed neon frame.

```html
<section class="slide" data-screen-label="01 Reflex SS26">
  <div class="meta-bar">
    <span>CAMPAIGN SS26</span>
    <span>01 / 05</span>
  </div>
  <div style="flex: 1; display: grid; grid-template-columns: 1fr 1.1fr; gap: clamp(32px, 4vw, 80px); align-items: center; margin-top: clamp(24px, 3vh, 48px);">
    <div>
      <h1 style="font-family: var(--font-display); font-weight: 700; font-style: italic; font-size: clamp(100px, 14vw, 220px); line-height: 0.9; letter-spacing: -0.01em;">reflex</h1>
      <div style="display: flex; align-items: center; gap: 16px; margin: clamp(24px, 3vh, 40px) 0;">
        <span style="width: 56px; height: 1px; background: var(--accent);"></span>
        <span class="eyebrow" style="color: var(--accent);">SHOT ON FILM</span>
      </div>
      <p class="lead" style="max-width: 38ch;">[REPLACE] Tokyo × Brooklyn. Styled by Kano Murakami. Fourteen pieces of sterling silver, scanned and forged for the collection launch.</p>
      <p class="eyebrow" style="position: absolute; bottom: clamp(40px, 5vh, 64px); left: clamp(56px, 7vw, 112px);">@BEVEL.JEWELRY</p>
    </div>
    <div class="bevel-frame" style="height: 72vh;">
      <div style="width: 100%; height: 100%; background: #222; display: flex; align-items: center; justify-content: center; font-family: var(--font-mono); color: #555; font-size: 12px;">
        [REPLACE] campaign image 4:5
      </div>
    </div>
  </div>
</section>
```

---

## L08 · finance-hero-grid  (world-dark / world-mint)

Replit slide-8: title left, 3 tall photo tiles right, 3-cell stat strip bottom with yellow labels.

```html
<section class="slide" data-screen-label="01 World Finance" style="padding: 0;">
  <div style="padding: clamp(48px, 6vh, 80px) clamp(56px, 7vw, 112px) 0;">
    <div class="meta-bar" style="position: static; left: 0; right: 0;">
      <span>REPORT · 2026</span>
      <span>WORLD.COM</span>
    </div>
  </div>
  <div style="flex: 1; display: grid; grid-template-columns: 1.1fr 1.4fr; gap: clamp(32px, 4vw, 64px); padding: clamp(24px, 3vh, 40px) clamp(56px, 7vw, 112px); align-items: center;">
    <div>
      <h1 class="h-hero" style="max-width: 12ch;">World Finance <span class="world-marker" style="margin-left: 6px;"></span><br>Report</h1>
      <p class="lead" style="margin-top: 24px; max-width: 40ch;">[REPLACE] World finance refers to the global system that manages money, investments, trade, and economic activity across countries.</p>
    </div>
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; height: 56vh;">
      <div style="background: #333; border-radius: 16px; position: relative; overflow: hidden;">
        <div style="position: absolute; left: 16px; bottom: 16px; color: #fff; font-weight: 600;">Health prices<br>+12.5%</div>
      </div>
      <div style="background: #444; border-radius: 16px; position: relative; overflow: hidden;">
        <div style="position: absolute; left: 16px; bottom: 16px; color: #fff; font-weight: 600;">Housing prices<br>+24%</div>
      </div>
      <div style="background: #555; border-radius: 16px; position: relative; overflow: hidden;">
        <div style="position: absolute; left: 16px; bottom: 16px; color: #fff; font-weight: 600;">Food prices<br>+18%</div>
      </div>
    </div>
  </div>
  <!-- bottom stat strip -->
  <div style="display: grid; grid-template-columns: 1fr 1fr 1.2fr 0.6fr; border-top: 1px solid var(--border); align-items: stretch;">
    <div style="padding: clamp(20px, 3vh, 36px) clamp(24px, 3vw, 40px); border-right: 1px solid var(--border);">
      <div style="color: var(--accent); font-weight: 600; margin-bottom: 8px;">Total debt</div>
      <div class="num" style="font-size: clamp(44px, 5vw, 72px);">$19.2 B</div>
    </div>
    <div style="padding: clamp(20px, 3vh, 36px) clamp(24px, 3vw, 40px); border-right: 1px solid var(--border);">
      <div style="color: var(--accent); font-weight: 600; margin-bottom: 8px;">S&amp;P 500</div>
      <div class="num" style="font-size: clamp(44px, 5vw, 72px);">+ 6.23 %</div>
    </div>
    <div style="padding: clamp(20px, 3vh, 36px) clamp(24px, 3vw, 40px);">
      <div style="color: var(--accent); font-weight: 600; margin-bottom: 8px;">Top countries</div>
      <div style="display: flex; gap: 24px; align-items: baseline;">
        <div style="font-size: 28px;">USA <span style="display: inline-block; background: var(--surface); color: var(--fg); padding: 4px 12px; border-radius: 20px; font-size: 15px; margin-left: 8px;">+ 4.22 %</span></div>
        <span style="color: var(--muted);">|</span>
        <div style="font-size: 28px;">China <span style="display: inline-block; background: var(--surface); color: var(--fg); padding: 4px 12px; border-radius: 20px; font-size: 15px; margin-left: 8px;">+ 4.12 %</span></div>
      </div>
    </div>
    <div style="padding: clamp(20px, 3vh, 36px); display: flex; align-items: flex-end; justify-content: flex-end; color: var(--muted); font-family: var(--font-mono); font-size: 13px;">Pg 02</div>
  </div>
</section>
```

---

## L09 · chapter-plate  (atlas)

Replit slide-11: two-column chapter opener, huge serif title left, archive photo right, data strip bottom.

```html
<section class="slide" data-screen-label="01 Chapter 01">
  <div class="meta-bar">
    <span><span class="atlas-dot"></span>THE ATLAS QUARTERLY · CHAPTER 01</span>
    <span>04 / 24</span>
  </div>
  <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: clamp(40px, 5vw, 80px); align-items: center; margin-top: clamp(24px, 3vh, 40px);">
    <div>
      <p class="eyebrow" style="color: var(--accent); margin-bottom: 32px;">— &nbsp; CHAPTER ONE — A CENTURY OF EMPIRES</p>
      <h1 class="h-hero" style="max-width: 12ch;">[REPLACE] The Imperial<br>Age<span style="color: var(--accent);">.</span></h1>
      <p class="lead" style="margin-top: 28px; max-width: 44ch;">[REPLACE] Between the Congress of Vienna and the guns of August, the world was redrawn in the language of empire — charted, claimed, and catalogued by a handful of capitals that believed history belonged to them.</p>
    </div>
    <div style="border: 1px solid var(--border); padding: 16px; position: relative;">
      <span style="position: absolute; top: 24px; left: 28px; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; color: #fff; text-transform: uppercase; background: rgba(0,0,0,0.4); padding: 4px 10px;">PLATE I</span>
      <span style="position: absolute; top: 24px; right: 28px; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; color: #fff; text-transform: uppercase; background: rgba(0,0,0,0.6); padding: 4px 10px;"><span class="atlas-dot" style="width: 6px; height: 6px;"></span>EXHIBIT 04.B</span>
      <div style="aspect-ratio: 4/3; background: #222; display: flex; align-items: center; justify-content: center; color: #555; font-family: var(--font-mono); font-size: 12px;">[REPLACE] archival photograph</div>
      <div style="padding: 14px 4px 4px; color: var(--fg); font-size: 14px;">[REPLACE] The west colonnade at first light.</div>
      <div style="padding: 0 4px; color: var(--muted); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em;">PHOTOGRAPHED C. 1887 · ARCHIVE 0341.B</div>
    </div>
  </div>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr) 2fr; gap: clamp(16px, 2vw, 32px); border-top: 1px solid var(--border); padding-top: clamp(16px, 2vh, 24px);">
    <div>
      <p class="eyebrow" style="margin-bottom: 8px;">PERIOD</p>
      <div style="font-family: var(--font-display); font-size: 28px;">1815–1914</div>
      <div style="color: var(--muted); font-size: 13px; margin-top: 4px;">Vienna to Sarajevo — the long peace of empire.</div>
    </div>
    <div>
      <p class="eyebrow" style="margin-bottom: 8px;">REACH</p>
      <div style="font-family: var(--font-display); font-size: 28px; color: var(--accent);">84%</div>
      <div style="color: var(--muted); font-size: 13px; margin-top: 4px;">of the globe under colonial or imperial rule by 1914.</div>
    </div>
    <div>
      <p class="eyebrow" style="margin-bottom: 8px;">CAPITALS</p>
      <div style="font-family: var(--font-display); font-size: 28px;">Six</div>
      <div style="color: var(--muted); font-size: 13px; margin-top: 4px;">London · Paris · Berlin · Vienna · St Petersburg · Constantinople.</div>
    </div>
    <div></div>
  </div>
  <!-- progress strip at very bottom -->
  <div style="position: absolute; bottom: 0; left: clamp(56px, 7vw, 112px); right: clamp(56px, 7vw, 112px); display: flex; align-items: center; gap: 12px; padding-bottom: 20px;">
    <div style="flex: 1; height: 1px; background: var(--border); position: relative;">
      <div style="position: absolute; left: 0; top: -1px; height: 3px; width: 16%; background: var(--accent);"></div>
    </div>
    <span style="font-family: var(--font-mono); font-size: 11px; color: var(--muted); letter-spacing: 0.08em;">04 / 24</span>
  </div>
</section>
```

---

## L10 · pill-headline-cards-row  (bluehouse)

Replit slide-12: bold headline w/ inline pill, 3-card row underneath.

```html
<section class="slide" data-screen-label="01 Driving ROI">
  <div class="meta-bar" style="color: var(--muted);">
    <span style="display: flex; align-items: center; gap: 10px;">
      <span style="width: 36px; height: 36px; border-radius: 10px; background: var(--surface); display: flex; align-items: center; justify-content: center;">⌂</span>
      <span style="font-family: var(--font-display); font-size: 22px; text-transform: none; letter-spacing: 0; color: var(--fg);">Bluehouse</span>
    </span>
    <span>01 / NN</span>
  </div>
  <div style="margin-top: clamp(48px, 6vh, 88px);">
    <h1 class="h-hero" style="max-width: 18ch;">Driving real estate <span style="display: inline-block; background: var(--card-peach); color: var(--bg); padding: 0 24px; border-radius: 48px; line-height: 1.1;">ROI</span><br>with prime properties</h1>
  </div>
  <div style="margin-top: clamp(32px, 4vh, 56px); display: grid; grid-template-columns: 1fr 1.1fr 0.9fr; gap: clamp(16px, 2vw, 24px); flex: 1; max-height: 50vh;">
    <div class="bh-card peach">
      <div style="display: flex; justify-content: flex-end;"><span style="width: 28px; height: 28px; border-radius: 8px; background: rgba(11,21,36,0.15); display:flex;align-items:center;justify-content:center;">+</span></div>
      <div style="background: #ccc; flex: 1; margin: 8px 0 16px; border-radius: 16px; display: flex; align-items: center; justify-content: center; color: #777; font-family: var(--font-mono); font-size: 12px;">[REPLACE] property photo</div>
      <div>
        <div class="num" style="color: var(--bg); font-size: clamp(40px, 4vw, 64px);">$2.4M</div>
        <div style="color: var(--bg); opacity: 0.7; font-size: 14px; margin-top: 4px;">asking price<br>Sunset Ridge</div>
      </div>
    </div>
    <div class="bh-card coral">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex;">
          <span style="width: 28px; height: 28px; border-radius: 50%; background: #fff; margin-right: -8px; border: 2px solid var(--accent); display:flex;align-items:center;justify-content:center;font-size:14px;">⌂</span>
          <span style="width: 28px; height: 28px; border-radius: 50%; background: var(--accent-2); margin-right: -8px; border: 2px solid #fff; display:flex;align-items:center;justify-content:center;font-size:14px;">⌂</span>
          <span style="width: 28px; height: 28px; border-radius: 50%; background: #fff; margin-right: -8px; border: 2px solid var(--accent); display:flex;align-items:center;justify-content:center;font-size:14px;">⌂</span>
          <span style="width: 28px; height: 28px; border-radius: 50%; background: var(--accent-2); border: 2px solid #fff; display:flex;align-items:center;justify-content:center;font-size:14px;">⌂</span>
          <span style="margin-left: 12px; color: #fff; font-size: 14px;">+12 properties</span>
        </div>
        <span style="width: 36px; height: 36px; border-radius: 50%; background: #fff; color: var(--bg); display:flex;align-items:center;justify-content:center;">↗</span>
      </div>
      <div>
        <div class="num" style="color: #fff; font-size: clamp(56px, 6vw, 88px);">+47%</div>
        <div style="color: #fff; opacity: 0.9; font-size: 15px; margin-top: 4px;">5-year appreciation<br>vs. acquisition price</div>
      </div>
    </div>
    <div style="display: grid; grid-template-rows: 1fr 1fr; gap: clamp(16px, 2vw, 24px);">
      <div class="bh-card lavender" style="aspect-ratio: auto; padding: clamp(20px, 2vw, 32px);">
        <div></div>
        <div>
          <div class="num" style="font-size: clamp(36px, 3.5vw, 56px);">6.2%</div>
          <div style="font-size: 14px; margin-top: 4px;">net rental yield<br>per annum</div>
        </div>
      </div>
      <div class="bh-card" style="background: var(--surface); color: #fff; aspect-ratio: auto; padding: clamp(20px, 2vw, 32px);">
        <div></div>
        <div>
          <div style="display: flex; align-items: baseline; gap: 12px;"><span class="num" style="font-size: clamp(36px, 3.5vw, 56px);">4</span><span style="font-size: 14px; opacity: 0.8;">step payment plan<br>handover Q2 2027</span></div>
        </div>
      </div>
    </div>
  </div>
</section>
```

---

## Quick-pick cheat sheet

| You want a… | Use layout |
|---|---|
| Cover slide, neutral | L01 cover-hero |
| Cover slide, narrative/historical | L09 chapter-plate |
| Cover slide, fashion/product | L07 campaign-cover or L10 pill-cards-row |
| Metrics dashboard (6 numbers) | L02 kpi-row-6 |
| One hero stat + supporting metrics | L03 split-hero-metric (helix only) |
| Memo-style hero statement | L04 memo-hero-statement (holm) |
| Team + funding allocation | L05 two-column-ask (holm) |
| Artwork / image feature | L06 gallery-plate (vance) |
| Data-heavy analytical page | L08 finance-hero-grid (world-*) |
| Bold statement with supporting tiles | L10 pill-headline-cards-row (bluehouse) |

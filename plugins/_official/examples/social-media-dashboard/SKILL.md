---
name: social-media-dashboard
description: |
  Creator-facing social media analytics dashboard in a single HTML file.
  A platform switcher (X / LinkedIn / YouTube / Instagram), a row of KPI
  cards (followers, engagement rate, likes, reposts), a follower-growth
  chart, a "top post this week" preview, and a trending topics / top
  comments side panel. Use when the brief mentions a "social media
  dashboard", "creator analytics", "social analytics", or names specific
  platforms (X, Twitter, LinkedIn, YouTube, Instagram, TikTok) together
  with metrics like followers, engagement, likes, reposts.
triggers:
  - "social media dashboard"
  - "social analytics"
  - "creator dashboard"
  - "creator analytics"
  - "social media analytics"
  - "社媒后台"
  - "创作者后台"
  - "社交媒体仪表盘"
od:
  mode: prototype
  platform: desktop
  scenario: creator
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Create a social media analytics dashboard using my Design System. Show X, LinkedIn, YouTube, Instagram with follower counts, engagement rate, likes, reposts, trending topics, and top comments."
---

# Social Media Dashboard Skill

Produce a single-screen, creator-facing social media analytics dashboard.

## Workflow

1. **Read the active DESIGN.md** (injected above). Colors, typography,
   spacing, radii, and component styling all come from it. Do not invent
   new tokens; do not hard-code brand colors of the platforms — let the
   DESIGN.md carry the visual identity, and reference platforms only by
   name and monogram.
2. **Identify** which platforms the brief calls out. Default to
   X / LinkedIn / YouTube / Instagram if unspecified. Keep the platform
   switcher to a single row, max 5 entries.
3. **Generate plausible data**, never `Metric A / Metric B` placeholders.
   Pick a creator persona (default: "AI / design indie creator") and
   derive consistent numbers across the page — e.g. follower counts on
   the switcher must match the KPI row when X is selected.
4. **Lay out** the page top-to-bottom:
   - **Header bar**: brand mark + section label ("ANALYTICS"), a
     dark/light toggle, time-range tabs (7D · 30D · 90D · YTD), and a
     creator avatar block on the right.
   - **Hero strip**: a one-sentence summary in display type
     ("You shipped 14 posts on X this week."), one supporting line of
     metadata, and two CTAs ("Export report", "New post →").
   - **Ask bar**: a single-line input styled as a search field, with
     ghost-text suggestions ("top performing last week",
     "comments from verified accounts").
   - **Platform switcher**: 4 cards in one row, each with platform
     monogram, name, follower count, and a `+X.XK this week` delta. The
     active platform uses an elevated surface from DESIGN.md.
   - **KPI row**: 4 cards — Followers · Engagement Rate · Likes (7D) ·
     Reposts (7D). Each card has a label (uppercase, label-md), a big
     value (display or headline-lg), a delta vs prior period, and a
     small footnote ("vs. 4.4% last week", "Aug 9–17 · 14 posts").
   - **Main grid (2/3 + 1/3)**:
     - Left: **Follower Growth · 30D** — a full-width inline SVG line
       chart with a soft area fill underneath, axis ticks at start /
       midpoint / end, and two labelled annotation dots
       ("Newsletter drop +842", "Viral thread +1.2K").
     - Right: **Top Post · This Week** — a card showing the rendered
       post (avatar, handle, post body, optional 16:9 media block), with
       a header tag "click-through rate 5.6%" in the DS accent.
   - **Lower grid (1/2 + 1/2)**:
     - **Trending topics on this platform**: 5–7 chip-style rows with
       topic name + post count + 24h delta sparkline (10 polyline
       points, no labels).
     - **Top comments**: 3 cards, each with avatar, handle (verified
       check if relevant), comment body (2 lines max, ellipsised), and
       a small `❤ 312 · 💬 18` row in muted text.
5. **Write** one self-contained HTML document:
   - `<!doctype html>` through `</html>`, CSS in one inline `<style>` block.
   - CSS Grid for page-level layout; Flexbox inside cards.
   - Semantic HTML: `<header>`, `<main>`, `<section>`, `<article>`.
   - Tag each logical region with `data-od-id="slug"` for comment mode:
     `header`, `hero`, `ask`, `platform-switcher`, `kpis`,
     `follower-growth`, `top-post`, `trending`, `top-comments`.
6. **Charts**: inline SVG only, no JS libraries.
   - Line chart: `<path>` for the curve, a second `<path>` with low-alpha
     fill for the area, two `<circle>` annotation dots with text labels.
   - Sparklines: `<polyline>` with 10 points, no axes, ~16px tall.
   - Use the DS accent for highlights and the DS `on-surface-variant` for
     muted text. Accent appears at most three times on the page.
7. **Self-check**:
   - Every color resolves to a DESIGN.md token (or a documented
     `rgba(token, alpha)` for glass surfaces).
   - Numbers are internally consistent (switcher follower count matches
     the active platform's KPI).
   - Header bar and hero strip are sticky; main content scrolls.
   - Density follows the DS mood: glass / cosmic DSes get more breathing
     room and ambient glow on the active platform; clean / corporate DSes
     tighten gaps and drop the glow.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="social-media-dashboard" type="text/html" title="Social Media Dashboard">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.

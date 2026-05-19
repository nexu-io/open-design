# Mobile app layouts

**6 paste-ready screen archetypes.** Drop into `<main class="content">` of `assets/template.html`. Don't write screens from scratch — pick the closest archetype, paste, swap copy.

## Pre-flight

1. **Read `assets/template.html`** at minimum through the `<style>` block — every class below is defined there. The Dynamic Island, status bar, home indicator, and tab bar are already drawn; do not re-implement them inline.
2. **Pick exactly one archetype.** A mobile screen does one job. Mixing "feed + checkout + profile" into one mock is the #1 reason mobile prototypes feel fake.
3. **If the archetype implies a tab bar, keep it; otherwise delete the entire `<nav class="tabbar">` block.** Onboarding, detail, and checkout screens generally don't show one.

## Class inventory

> `pad` `stack` `row` `row-between` `grid-2` `grid-3` `header` `greeting` `h2` `h3` `meta` `num` `card` `card.accent` `card.flat` `list-row` `avatar` `tag` `pill` `tabbar` `tab` `tab.active` `btn-primary` `btn-secondary` `ph-img` `progress`

If you reach for a class not on this list, define it in the seed's `<style>` first.

---

## Archetype A — Feed (home / for-you / inbox)

Top: greeting + title. Body: 4–6 list rows, hairline-separated. Tab bar: yes.

```html
<div class="header" data-od-id="header">
  <div>
    <p class="greeting">Tuesday · April 22</p>
    <h1>Inbox</h1>
  </div>
  <button class="icon-btn" aria-label="Compose">
    <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
  </button>
</div>

<section class="pad" data-od-id="filters" style="margin-bottom: 8px;">
  <div class="row" style="overflow-x: auto; padding-bottom: 4px;">
    <span class="pill">All · 14</span>
    <span class="tag">Mentions</span>
    <span class="tag">Following</span>
    <span class="tag">Shared</span>
  </div>
</section>

<section class="pad" data-od-id="feed">
  <div class="list-row">
    <div class="avatar"></div>
    <div class="body">
      <div class="title">Mira Hassan · Sync engine v3 review</div>
      <div class="sub">"Merged the chunker — egress is down 38% on Northwind."</div>
    </div>
    <span class="meta">2m</span>
  </div>
  <div class="list-row">
    <div class="avatar"></div>
    <div class="body">
      <div class="title">#engineering · 7 new replies</div>
      <div class="sub">Latency spike between 03:40 and 04:10 — probably the cron.</div>
    </div>
    <span class="meta">14m</span>
  </div>
  <div class="list-row">
    <div class="avatar"></div>
    <div class="body">
      <div class="title">Northwind Studios · Invoice paid</div>
      <div class="sub">$2,184 · April · auto-receipt sent to billing@</div>
    </div>
    <span class="meta">1h</span>
  </div>
  <div class="list-row">
    <div class="avatar"></div>
    <div class="body">
      <div class="title">Daniel Park · Re: Next Tuesday's review</div>
      <div class="sub">"I'll have the Q2 numbers by Monday EOD."</div>
    </div>
    <span class="meta">3h</span>
  </div>
</section>
```

## Archetype B — Detail (single item)

Hero image up top, eyebrow + title + meta, body text, primary action floating at the bottom. Tab bar: no.

```html
<div class="ph-img wide" style="border-radius: 0; aspect-ratio: 4/3;" data-od-id="hero">[ Hero image ]</div>

<section class="pad" style="padding-top: 18px;" data-od-id="meta">
  <span class="pill">Studio session</span>
  <h1 class="h2" style="margin: 10px 0 6px;">Filebase v3 — what we shipped, what we cut.</h1>
  <p class="meta">Mira Hassan · April 22 · 9 min read</p>
</section>

<section class="pad stack" style="margin-top: 18px; gap: 14px;" data-od-id="body">
  <p>The biggest unlock in v3 was the new content-defined chunker. On Final Cut projects, post-edit re-uploads dropped 38× — from full multi-GB pushes to the few hundred KB that actually changed.</p>
  <p>What we cut: per-folder compression. It looked great on benchmarks; on real footage it was slower than no compression at all because the chunker was already doing the dedup work.</p>
  <p>Next quarter: dual-region replication on R2 + S3, rolling out to Enterprise first.</p>
</section>

<section class="pad" style="padding-top: 24px; padding-bottom: 8px;" data-od-id="cta">
  <button class="btn-primary">Save to library</button>
</section>
```

## Archetype C — Onboarding (1 of N)

Illustration block + headline + subhead + paginator + primary CTA. Tab bar: no. Status bar still visible.

```html
<section class="pad stack" style="height: 100%; padding-top: 24px; padding-bottom: 24px; gap: 24px;" data-od-id="onboarding">
  <div class="ph-img square" style="aspect-ratio: 1/1; max-width: 240px; margin: 0 auto;">[ Illustration ]</div>

  <div style="text-align: center;">
    <p class="meta" style="margin: 0 0 6px;">STEP 2 OF 4</p>
    <h1 style="font-family: var(--font-display); font-size: 26px; margin: 0 0 10px; letter-spacing: -0.02em; line-height: 1.15;">Sync only what changed.</h1>
    <p style="margin: 0 auto; max-width: 26ch; color: var(--muted); font-size: 14px; line-height: 1.5;">No more 4 GB re-uploads when you fix one frame. We diff at the byte level so the network stays quiet.</p>
  </div>

  <!-- pagination dots -->
  <div class="row" style="justify-content: center; gap: 6px;">
    <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--border);"></span>
    <span style="width: 18px; height: 6px; border-radius: 999px; background: var(--accent);"></span>
    <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--border);"></span>
    <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--border);"></span>
  </div>

  <div class="stack" style="gap: 10px; margin-top: auto;">
    <button class="btn-primary">Continue</button>
    <button class="btn-secondary" style="border: 0; color: var(--muted);">Skip</button>
  </div>
</section>
```

> Drop the `<nav class="tabbar">` block from the seed for this archetype.

## Archetype D — Profile (someone's page)

Avatar + name + meta row; stat row; tabbed content underneath. Tab bar: yes (often the surrounding app's tabs).

```html
<section class="pad" style="padding-top: 8px;" data-od-id="head">
  <div class="row" style="gap: 16px;">
    <div class="avatar" style="width: 64px; height: 64px;"></div>
    <div>
      <h1 class="h2" style="margin: 0;">Mira Hassan</h1>
      <p class="meta" style="margin: 4px 0 0;">CTO · Northwind Studios · Joined 2024</p>
    </div>
  </div>
  <div class="row" style="margin-top: 16px; gap: 8px;">
    <button class="btn-secondary" style="flex: 1; min-height: 38px; font-size: 13px;">Message</button>
    <button class="btn-secondary" style="flex: 1; min-height: 38px; font-size: 13px;">Follow</button>
  </div>
</section>

<section class="pad" data-od-id="stats" style="margin-top: 18px;">
  <div class="grid-3">
    <div class="card flat" style="text-align: center;">
      <div class="num" style="font-size: 22px; letter-spacing: -0.02em;">218</div>
      <div class="meta">Posts</div>
    </div>
    <div class="card flat" style="text-align: center;">
      <div class="num" style="font-size: 22px; letter-spacing: -0.02em;">3.1k</div>
      <div class="meta">Followers</div>
    </div>
    <div class="card flat" style="text-align: center;">
      <div class="num" style="font-size: 22px; letter-spacing: -0.02em;">142</div>
      <div class="meta">Following</div>
    </div>
  </div>
</section>

<section class="pad" data-od-id="tabs" style="margin-top: 12px;">
  <div class="row" style="border-bottom: 1px solid var(--border); gap: 24px;">
    <span style="padding: 12px 0; border-bottom: 2px solid var(--accent); color: var(--fg); font-weight: 500; font-size: 14px;">Posts</span>
    <span style="padding: 12px 0; color: var(--muted); font-size: 14px;">Replies</span>
    <span style="padding: 12px 0; color: var(--muted); font-size: 14px;">Likes</span>
  </div>
</section>

<section class="pad" data-od-id="post-list" style="margin-top: 4px;">
  <div class="list-row" style="grid-template-columns: 1fr;">
    <div class="body">
      <div class="title">"Bandwidth pricing went up 4× — sync engine choice is no longer cosmetic."</div>
      <div class="sub" style="margin-top: 6px;">2 days ago · 142 likes</div>
    </div>
  </div>
  <div class="list-row" style="grid-template-columns: 1fr;">
    <div class="body">
      <div class="title">"Shipped v3 today. The team carried this one."</div>
      <div class="sub" style="margin-top: 6px;">5 days ago · 88 likes</div>
    </div>
  </div>
</section>
```

## Archetype E — Checkout / form

Stacked card sections (item summary → details → totals), bottom-fixed CTA. Tab bar: no.

```html
<section class="pad" style="padding-top: 12px;" data-od-id="title">
  <h1 class="h2">Confirm order</h1>
</section>

<section class="pad" data-od-id="item">
  <div class="card row" style="gap: 14px; align-items: flex-start;">
    <div class="ph-img square" style="width: 64px; height: 64px; aspect-ratio: 1; border-radius: 10px;"></div>
    <div style="flex: 1;">
      <div class="h3">Filebase Team · annual</div>
      <p class="meta" style="margin: 4px 0 0;">$4 / seat / month, billed yearly</p>
    </div>
    <span class="num">$1,920</span>
  </div>
</section>

<section class="pad stack" data-od-id="details" style="margin-top: 14px; gap: 10px;">
  <div class="card flat row-between">
    <span>Seats</span>
    <span class="num">40</span>
  </div>
  <div class="card flat row-between">
    <span>Billing email</span>
    <span class="meta">billing@northwind.studio</span>
  </div>
  <div class="card flat row-between">
    <span>Payment</span>
    <span class="meta">Visa · 4242</span>
  </div>
</section>

<section class="pad" data-od-id="totals" style="margin-top: 14px;">
  <div class="card row-between" style="border-top: 1px solid var(--fg); border-radius: 0; padding: 16px 0; background: transparent;">
    <span style="font-weight: 600;">Total today</span>
    <span class="num" style="font-size: 22px; letter-spacing: -0.01em;">$1,920</span>
  </div>
</section>

<section class="pad" style="padding-top: 16px; padding-bottom: 12px;" data-od-id="cta">
  <button class="btn-primary">Pay $1,920</button>
  <p class="meta" style="text-align: center; margin: 12px 0 0;">By tapping Pay you agree to the terms.</p>
</section>
```

## Archetype F — Focus / hero card (timer, map, single tool)

A single accent-coloured hero card dominates; small supporting content underneath. Tab bar: yes.

```html
<div class="header" data-od-id="header">
  <div>
    <p class="greeting">Tuesday · April 22</p>
    <h1>Two pomodoros to lunch.</h1>
  </div>
  <button class="icon-btn" aria-label="Settings">
    <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="3" r="0.5"/><circle cx="12" cy="21" r="0.5"/><circle cx="3" cy="12" r="0.5"/><circle cx="21" cy="12" r="0.5"/></svg>
  </button>
</div>

<section class="pad" data-od-id="hero-card" style="margin-top: 4px;">
  <div class="card accent" style="padding: 28px 24px; text-align: center;">
    <p class="meta" style="margin: 0 0 6px; color: rgba(255,255,255,0.72);">FOCUS SESSION</p>
    <div class="num" style="font-size: 64px; line-height: 1; letter-spacing: -0.03em; font-weight: 600; margin: 8px 0 18px;">15:42</div>
    <div class="progress" style="margin-bottom: 18px;"><span style="width: 38%;"></span></div>
    <div class="row" style="justify-content: center; gap: 8px;">
      <button style="padding: 10px 22px; border: 1px solid rgba(255,255,255,0.4); background: rgba(255,255,255,0.12); color: #fff; border-radius: 999px; font: inherit; font-weight: 500;">Skip</button>
      <button style="padding: 10px 22px; border: 0; background: #fff; color: var(--accent); border-radius: 999px; font: inherit; font-weight: 600;">Pause</button>
    </div>
  </div>
</section>

<section class="pad" data-od-id="stats-row" style="margin-top: 18px;">
  <p class="meta" style="margin: 0 0 8px;">TODAY</p>
  <div class="grid-3">
    <div class="card"><div class="num" style="font-size: 22px;">3</div><div class="meta">Sessions</div></div>
    <div class="card"><div class="num" style="font-size: 22px;">75m</div><div class="meta">Focused</div></div>
    <div class="card"><div class="num" style="font-size: 22px;">2</div><div class="meta">Done</div></div>
  </div>
</section>

<section class="pad" data-od-id="up-next" style="margin-top: 18px;">
  <p class="meta" style="margin: 0 0 8px;">UP NEXT</p>
  <div>
    <div class="list-row" style="grid-template-columns: 22px 1fr auto;">
      <span style="width: 18px; height: 18px; border-radius: 50%; background: var(--accent);"></span>
      <div class="body">
        <div class="title" style="text-decoration: line-through; color: var(--muted);">Review Q2 OKRs</div>
        <div class="sub">25m · completed</div>
      </div>
    </div>
    <div class="list-row" style="grid-template-columns: 22px 1fr auto;">
      <span style="width: 18px; height: 18px; border-radius: 50%; border: 1.5px solid var(--border);"></span>
      <div class="body">
        <div class="title">Draft sync-engine post</div>
        <div class="sub">2 sessions estimated</div>
      </div>
    </div>
  </div>
</section>
```

---

## Choosing an archetype from a brief

| If the brief mentions… | Use |
|---|---|
| feed, inbox, timeline, list, messages | A — Feed |
| article, post, item, recipe, song, product | B — Detail |
| sign-up, welcome, intro, walkthrough | C — Onboarding |
| profile, account, user page, bio | D — Profile |
| checkout, payment, order, form, settings step | E — Checkout |
| timer, map, dashboard widget, single big number | F — Focus |

If two fit, pick the one that better matches the *primary* action the user takes on this screen.

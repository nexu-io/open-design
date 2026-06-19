# Optimize Above-the-Fold Content

Description: Audit and rewrite the hero section of a landing page — headline, subheader, hero image, nav, and CTA — then ship the change. Based on the Demand Curve above-the-fold playbook.
Tag: above-the-fold, audit, conversion, copywriting, cro, hero, homepage, landing-page
URL: https://ploy.ai/workspaces/9f4992d3-b3ea-4bad-9520-910846dd91e3/ploybooks/optimize-above-the-fold

A slim, end-to-end workflow for fixing the most expensive section of any site: the part visitors see before scrolling. The goal is a hero that names a specific benefit, hooks the visitor, and points one persona to one next action.

**Scope:** one page, one fold, one ship. Default to the workspace's primary site homepage unless the user names a different page or external URL.

---

## Phase 0: Lock the Target

- [ ]

    Confirm the page being optimized.

    - If the user provided a URL, use it. Treat external URLs as audit-only inputs (you cannot edit them); fall through to recommendations the user can apply manually.
    - If no URL, default to the workspace's primary site homepage. Confirm before proceeding if more than one site exists.
- [ ]

    Confirm the **primary persona** for this fold (1 audience, not "everyone"). If the user has not specified, pick the most likely from workspace brand documents and state your assumption.

- [ ]

    Confirm the **single next action** the fold should drive (sign up, book demo, start trial, etc.). One CTA, not three.


### Output of Phase 0

A target page, a primary persona, and a single conversion goal — written down so the rest of the ploybook has something concrete to optimize against.

---

## Phase 1: Capture the Baseline

- [ ]

    Take a desktop screenshot of the fold at 1440×900: `screenshot({ url, viewport: { width: 1440, height: 900 }, review: true })`. Do not use `fullPage: true` — only the visible fold matters here.

- [ ]

    Take a mobile screenshot at 390×844. Mobile fold real estate is unforgiving; many heroes that look fine on desktop fail here.

- [ ]

    Read the workspace brand document(s) for positioning, ICP, and known objections. If none exist, load the `brand` skill and surface what you can infer.


---

## Phase 2: Audit Against the Framework

Score the current fold against six checks. Be blunt — vague "looks good" notes are useless. Each check is pass/fail with a one-line reason.

| Check | Passes when |
| --- | --- |
| **Specific benefit** | The headline names the actual outcome the user gets, not a category ("Collaboration platform" ❌). |
| **Hook** | The headline either makes a credible bold claim or directly addresses the top buying objection. |
| **Subheader explains how** | Subhead is 1–2 sentences: what the product is + how the headline's claim becomes possible. |
| **Persona-tuned** | A reader in the primary persona sees their own language and situation, not generic SaaS-speak. |
| **One CTA, continuing the narrative** | Primary CTA text reads as the natural next sentence after the headline. Nav has 2–4 links + 1 CTA, not a wall. |
| **Hero image earns its space** | Image shows the product doing the thing, not stock illustration. Negative space, not clutter. |
- [ ]

    For each failed check, write one sentence on why it fails. This becomes the rewrite brief.

- [ ]

    If 5 or 6 checks pass, the fold is already strong. Tell the user, suggest one A/B test idea, and stop. Do not rewrite for the sake of rewriting.


---

## Phase 3: Rewrite the Copy

Load the `copywrite` skill. Produce a single short document: **"Above-the-Fold Rewrite — {page name}"**. Keep it tight — this is a hero, not an article.

```markdown
# Above-the-Fold Rewrite — {page name}

## Persona & Goal

- Primary persona: …
- Primary CTA: …
- Top objection (if any): …

## Headline

**Recommended:** [Final pick — one line, specific benefit, hook present]
**Alt 1:** [Bold-claim variant]
**Alt 2:** [Objection-handling variant]

## Subheader

[1–2 sentences. Sentence 1 = what the product is. Sentence 2 = how the headline's claim is possible.]

## CTA

- Primary button: [3–5 words, continues the headline's promise]
- Secondary (optional): [Lower-commitment action — "See how it works", not "Learn more"]

## Hero Image Direction

[1–2 sentences: what the image should show. Product in action, not abstract. Note any negative-space or composition requirements.]

## Nav

[2–4 links + 1 CTA button. List them.]
```

- [ ]

    Apply the three-step framework to every headline candidate: identify the user value, add a hook (bold claim **or** objection), speak to the persona's language.

- [ ]

    Avoid corporate placeholders ("solutions", "platform", "powerful", "seamless"). If a word would survive being pasted into any other company's site, cut it.

- [ ]

    Save the document and register it as an artifact so the user can review before you ship.


---

## Phase 4: Implement and Verify

Skip this phase if the target was an external URL — hand the rewrite document to the user and stop.

- [ ]

    Locate the hero section in the workspace site code. It is usually `components/sections/hero*.tsx` or the homepage's first section. Use the `build-site-page` skill if the site is componentized.

- [ ]

    Update headline, subheader, CTA text, and nav to match the recommended variants from Phase 3.

- [ ]

    If the hero image direction calls for a new asset, generate one with `assets` (`action: "generate"`) following the Phase 3 image direction. Reuse existing brand assets if they fit — do not regenerate for the sake of it.

- [ ]

    Verify visually:

    - `screenshot({ viewport: { width: 1440, height: 900 }, review: true })` for desktop fold
    - `screenshot({ viewport: { width: 390, height: 844 }, review: true })` for mobile fold
- [ ]

    Verify the build: `bun run build`.

- [ ]

    Compare the new screenshots side-by-side with the Phase 1 baseline. Confirm every failed check from Phase 2 now passes.


---

## Rules

- MUST optimize for one persona and one CTA. A fold that speaks to "everyone" converts no one.
- MUST keep the subheader to 1–2 sentences. If you need three, the headline is doing too little.
- MUST NOT add tints/overlays to make text legible over a busy hero image. Fix it through composition (placement, image choice, typography).
- MUST NOT rewrite a fold that already passes 5+ framework checks. Suggest a test instead.
- MUST verify mobile, not just desktop. Mobile is where most heroes break.

## When to Use

- A landing page or homepage hero is converting poorly or feels generic.
- The user asks for a hero rewrite, headline rewrite, or "above-the-fold" review.
- A brand has new positioning and the existing fold no longer reflects it.

## When NOT to Use

- Building a new homepage from scratch — use **Create a Homepage from Scratch**.
- Optimizing a content page (blog, comparison, listicle) — use **Build a Content Page**.
- Whole-site CRO across multiple pages — this ploybook is one page, one fold.
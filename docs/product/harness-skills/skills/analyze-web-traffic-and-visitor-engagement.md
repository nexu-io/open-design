# Analyze web traffic and visitor engagement

Description: Review site traffic, visitor quality, and engagement over a defined time window. Turn raw analytics into a clear report on what is working, what is weak, and what deserves action next.
Tag: analytics, dashboards, engagement, insights, traffic, visitors, web-analytics
URL: https://ploy.ai/workspaces/9f4992d3-b3ea-4bad-9520-910846dd91e3/ploybooks/web-traffic-analysis

# Analyse Web Traffic

Use this ploybook to answer a simple business question: how is the site performing, and what kind of visitors is it attracting?

The goal is not to dump numbers back at the user. The goal is to turn traffic, audience, and engagement signals into a short report with clear conclusions, visible patterns, and concrete next steps.

**Scope:** One site, one analysis window, one report. Default to the last 30 days unless the user asks for a different time range.

---

## Phase 0: Set the Scope

Before analyzing anything, lock the scope.

- Confirm which site is being analyzed. If the workspace contains more than one site, do not guess.
- Confirm the time window before pulling conclusions. Default to the last 30 days if the user has not specified one.
- Use the same window across the entire analysis. Do not compare traffic from one period against engagement or visitor data from another period unless the report explicitly says so.
- Decide what the report is meant to answer: traffic quality, top-performing pages, audience fit, campaign impact, or general health.

### Output of Phase 0

A clearly defined site, a clearly defined time window, and a clear analytical question.

---

## Phase 1: Understand the Shape of Traffic

Start with the topline pattern before diving into detail.

- Identify the overall traffic trend across the selected window.
- Record the core numbers that anchor the report: total traffic, total visitors, and the day-to-day pattern.
- Note whether traffic is steady, rising, falling, or concentrated into a few spikes.
- If there are unusual spikes or dips, call them out as events to explain later rather than treating them as normal behavior.

### What to look for

- A healthy trend is not just "high traffic." It is traffic that is understandable and not randomly volatile.
- A spike is only useful if it connects to something meaningful: a launch, campaign, mention, or high-performing page.
- A dip matters most when it changes the overall story of the window, not when it is just a single weak day.

---

## Phase 2: Find Where the Traffic Is Going

Once the overall trend is clear, identify which pages are carrying the site.

- Find the pages receiving the most attention.
- Look for concentration risk: one or two pages doing most of the work.
- Identify which entry pages appear to attract visitors first.
- Identify where traffic is coming from at a high level: direct, search, referrals, campaigns, or other obvious channels.

### Rules

- Do not treat page popularity as success by default. A page can attract attention and still fail to engage.
- Do not bury concentration risk. If one page carries most of the traffic, say so plainly.
- If traffic sources are unclear, say they are unclear. Do not invent attribution.

### Questions this phase should answer

- What pages matter most?
- What traffic sources matter most?
- Is the site diversified, or is performance dependent on a small slice of content?

---

## Phase 3: Understand Who the Visitors Are

Traffic volume matters less if the audience is wrong.

- Build a profile of the identifiable audience where possible: companies, industries, job functions, geography, or other meaningful segments.
- Distinguish between total visitors and identified visitors. These are not the same population.
- Treat identified visitors as a signal sample, not a perfect mirror of all traffic.
- Highlight any repeated patterns in the audience mix, especially if they suggest strong fit or obvious mismatch.

### Rules

- Never present identified visitors as if they represent 100% of traffic.
- Avoid false precision. The audience story should be directional unless coverage is unusually strong.
- If the identified pool is small, note that the audience profile is suggestive, not definitive.

### What matters most

- Whether the site is attracting the kinds of organizations or people the business actually wants
- Whether a few audience segments dominate the identified pool
- Whether the observed audience matches the company's positioning

---

## Phase 4: Measure Engagement, Not Just Attention

Traffic tells you who arrived. Engagement tells you whether the visit mattered.

- Look for evidence that visitors moved beyond passive viewing.
- Assess whether visitors are clicking important calls to action, exploring deeper pages, searching the site, starting forms, or completing them.
- Compare high-traffic pages against high-engagement pages. They are often not the same.
- Look for pages that attract interest but fail to move people forward.

### Rules

- Do not confuse pageviews with intent.
- Do not treat every interaction equally. A form submission is a stronger signal than a scroll. A meaningful CTA click is stronger than a casual page visit.
- If engagement data is sparse or incomplete, say so directly rather than overstating the finding.

### Common patterns worth calling out

- High traffic, low engagement: strong visibility, weak conversion
- Low traffic, high engagement: valuable page with limited distribution
- Strong CTA interaction, weak form completion: likely friction in the conversion path
- Repeated site searches: evidence of missing content, weak navigation, or unmet visitor questions

---

## Phase 5: Compare Anonymous Traffic With Known Audience Quality

This is where the report becomes useful for commercial decisions.

- Estimate how much of the site's traffic can be tied to identifiable visitors or companies.
- Compare anonymous volume against known, attributable engagement.
- Highlight whether named companies are merely visiting or actually engaging in meaningful ways.
- Separate broad traffic success from business-relevant traffic success.

### What this phase is for

It answers questions like:

- Are we attracting the right people, or just a lot of people?
- Are known accounts actually engaging?
- Is the site's best-performing content commercially useful, or just popular?

### Rules

- Do not overclaim identity coverage. If only a small share of traffic can be tied to named visitors, treat conclusions carefully.
- Do not frame a company-level signal as proof of an individual person's intent.
- Keep commercial interpretation honest: "known companies engaged" is stronger than "this generated pipeline."

---

## Phase 6: Turn the Analysis Into a Decision-Ready Report

The final output should be short, structured, and useful.

- Summarize the overall traffic pattern in one or two sentences.
- Name the pages and channels that matter most.
- Summarize the audience quality signal: strong fit, mixed fit, or weak fit.
- Summarize the engagement story: what is driving action, what is underperforming, and where friction appears to exist.
- Include a small set of charts or visuals that make the story easier to absorb.
- End with prioritized recommendations, not just observations.

### Recommended report structure

```markdown
# Web Traffic Analysis: {site}

## Executive Summary

- What happened in this window
- Whether traffic quality looks strong, mixed, or weak

## Traffic Overview

- Trend
- Totals
- Notable spikes or dips

## Top Pages and Sources

- Pages carrying traffic
- Main acquisition patterns
- Concentration risks

## Audience Quality

- What kind of visitors appear to be arriving
- Whether they match the business's target audience

## Engagement Findings

- What visitors actually did
- Where attention turns into action
- Where friction is visible

## Recommendations

1. ...
2. ...
3. ...
```

---

## What Good Recommendations Look Like

Recommendations should follow directly from the evidence.

- If one page dominates traffic but engages weakly, improve the page before trying to drive even more visitors to it.
- If a high-intent page converts well but gets little traffic, invest in distribution.
- If identified visitors cluster in a promising segment, adapt messaging and offers toward that segment.
- If visitors repeatedly search for the same topic, create or improve the page they expected to find.
- If forms are started often but submitted rarely, simplify the form or improve the surrounding page context.

---

## Guardrails

- MUST use one consistent analysis window throughout the report unless explicitly comparing periods
- MUST distinguish total traffic from identified visitors
- MUST ground every conclusion in observed evidence
- MUST call out missing or weak data instead of smoothing over it
- MUST end with actions the user can take
- MUST NOT invent attribution, intent, or conversion outcomes
- MUST NOT confuse popularity with business value
- MUST NOT present anonymous traffic growth as proof of commercial success

---

## Re-Run Guidance

This ploybook works well as a recurring health check.

- Monthly runs are useful for trend monitoring
- Weekly runs are useful during active campaigns or launches
- Re-run after major site changes, new traffic campaigns, or conversion funnel updates

Over time, the value comes from comparing reports and seeing whether traffic quality and engagement are improving, not just whether raw volume is increasing.
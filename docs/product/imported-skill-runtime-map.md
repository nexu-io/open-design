# Skill Runtime Map

Builder-specific mapping for the imported Ploybook-style skills.

This file translates each raw `.md` skill into the harness concepts from `.context/plans/harness-skill-library-runtime-prd.md`.

## Runtime Defaults

- `observe`: analysis only.
- `draft`: creates reports, copy, plans, or drafts, but does not apply changes.
- `stage`: applies changes to preview/workspace, but does not publish.
- `publish`: may publish only after explicit approval.
- `autopublish`: not allowed for this initial import.

## Imported Skill Map

| Skill ID | Source File | Category | Primary Agents | Default Triggers | Autonomy | Required Tool Families | Primary Outputs | Approval Gates |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `aeo-comparison-pages` | `skills/aeo-comparison-pages-narrow-concession.md` | SEO & AEO | `growth-agent`, `site-builder-agent` | manual, schedule | draft | `web`, `dataforseo`, `documents`, `build-content-page` | competitor target list, narrow-concession briefs, page templates, FAQ/schema requirements | apply generated pages, publish |
| `analyze-web-traffic` | `skills/analyze-web-traffic-and-visitor-engagement.md` | Analytics | `analytics-agent`, `growth-agent` | manual, schedule, watchdog | observe | `analytics`, `visitors`, `documents` | decision-ready traffic report, insight cards, recommendations | none for report; approval before edits/outreach |
| `build-content-page` | `skills/build-a-content-page.md` | Content | `growth-agent`, `site-builder-agent`, `design-agent` | manual, event | stage | `research`, `web`, `copywrite`, `filesystem`, `siteComponents`, `preview`, `seo` | page content document, Astro page, component/file diff, preview check | apply file changes if high risk, publish |
| `company-swarm` | `skills/company-swarm-account-based-outreach.md` | Visitors & Outreach | `analytics-agent`, `growth-agent` | manual, event, schedule | draft | `visitors`, `integrations`, `fetchContact`, `enrichEntity`, `searchEntity`, `documents`, `site` | account plan, contact roster, persona hooks, Gmail drafts, send plan | contact credit spend, Gmail draft creation when needed, any send |
| `create-homepage` | `skills/create-a-homepage-from-scratch.md` | Website Build | `site-builder-agent`, `design-agent` | manual, project.created | stage | `lookbook`, `search`, `copywrite`, `filesystem`, `siteComponents`, `preview`, `screenshot`, `seo` | homepage, design tokens, reusable sections, preview, QA result | visual direction, large file changes, publish |
| `email-icp-visitors` | `skills/email-icp-website-visitors.md` | Visitors & Outreach | `analytics-agent`, `growth-agent` | manual, schedule | draft | `visitors`, `fetchContact`, `enrichEntity`, `searchEntity`, `integrations`, `documents`, `web` | ranked company list, verified contact rows, Gmail drafts, export queue | contact credit spend, Gmail draft creation when needed, any send |
| `gsc-keyword-optimization` | `skills/gsc-keyword-optimization.md` | SEO & AEO | `growth-agent`, `site-builder-agent` | manual, schedule, watchdog | stage | `gsc`, `filesystem`, `documents`, `preview` | keyword gap report, recommended page edits, content/file diff | GSC connection, apply page edits, publish |
| `optimize-above-the-fold` | `skills/optimize-above-the-fold-content.md` | Conversion | `growth-agent`, `design-agent`, `site-builder-agent` | manual, watchdog | stage | `screenshot`, `brand`, `copywrite`, `filesystem`, `preview` | hero audit, rewritten copy, hero image direction, nav/CTA edits, preview check | apply hero changes, publish |

## Pending Inventory Skills

| Skill ID | Inventory Name | Status | Expected Category | Expected Runtime Role |
| --- | --- | --- | --- | --- |
| `publish-readiness` | `Publish Readiness - Take a Ploy Site Live on a Custom Domain` | CSV only, markdown missing | Publish | technical SEO, custom domain, crawlability, deploy readiness, live-domain debugging |
| `seo-aeo-strategy-system` | `SEO & AEO Strategy System - APTK Framework, Keyword Research, Content Optimization` | CSV only, markdown missing | SEO & AEO | broad SEO/AEO strategy, keyword research, topic clustering, content strategy, measurement |

## Initial Harness Processes To Create

### Manual Playbooks

- `create-homepage`
- `build-content-page`
- `optimize-above-the-fold`
- `aeo-comparison-pages`
- `gsc-keyword-optimization`
- `analyze-web-traffic`
- `email-icp-visitors`
- `company-swarm`

### Scheduled Processes

- Weekly `analyze-web-traffic` with `observe` autonomy.
- Weekly `gsc-keyword-optimization` with `stage` autonomy and publish approval.
- Weekly or monthly `aeo-comparison-pages` target discovery with `draft` autonomy.
- Daily `email-icp-visitors` for active sites with `draft` autonomy and send approval.

### Watchdogs

- `optimize-above-the-fold`: trigger when landing page traffic is high but CTA engagement is weak.
- `gsc-keyword-optimization`: trigger when a page has high impressions and low CTR.
- `analyze-web-traffic`: trigger when traffic drops, spikes, or audience quality changes materially.
- `publish-readiness`: pending markdown; trigger before production deploy or when crawl/indexing anomalies are detected.

## Required Runtime Conversions

Before these can execute in the product, each markdown file should be normalized into frontmatter:

```yaml
id: <skill-id>
name: <display name>
version: 1.0.0
category: <category>
agents: []
triggers:
  manual: true
  schedule: null
  events: []
autonomy: observe | draft | stage | publish
tools: []
outputs: []
approvals: []
```

The body should remain the detailed instruction/training content loaded into the Mastra-backed `BuilderHarness`.

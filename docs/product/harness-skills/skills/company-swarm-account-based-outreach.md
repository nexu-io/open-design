# Company Swarm: Account-Based Outreach from One Visitor

Description: Use when a high-fit visitor or company signal should become a reviewed ABM outreach plan: qualify the account, build a small Contact Tool roster, map personas/content, draft emails, and stagger sends.
URL: https://ploy.ai/workspaces/9f4992d3-b3ea-4bad-9520-910846dd91e3/ploybooks/company-swarm

*Inspired by [Emre Kavaloglu](https://www.linkedin.com/in/kavaloglu/).*

Use this when one promising visitor, company in visitor analytics, or user-named target account should become a coordinated account-based outreach motion.

End state: a reviewed account plan with a lookback-sized roster, persona-specific hooks, relevant content links, Gmail drafts, and a send plan that avoids blasting one company. Default to **draft and review**. Send only after the user approves the exact first batch and guardrails.

## Tool Loading

Load only what the current phase needs:

- `visitors`: only to discover or validate the traffic trigger.
- `integrations`: check Gmail first with `search_connections` before spending contact credits; later use it to create drafts/sends.
- `fetchContact`, `enrichEntity`, `searchEntity`: load together before contact resolution. If unavailable, the workspace lacks Contact Tool.
- `site`, `siteComponents`: only to inspect or build site content.
- `proactivePloys`: only at close if saving follow-up recommendations helps.

Run `integrations(action: "search_connections", query: "gmail")` before Phase 0. This Ploybook relies on Gmail drafts/sends. If Gmail is not enabled or connected, surface the tool's connect/enable button and stop before roster work. Do not spend contact credits until Gmail is ready, unless the user explicitly asks for a strategy-only brief.

If Contact Tool is unavailable, stop before roster work. Tell the user: "This Ploybook needs the Contact Tool enabled on your workspace for contact resolution. A Ploy admin can enable it. I can still outline the account strategy, but I cannot enumerate contacts or resolve emails."

Contact Tool constraints:

- Use Contact Tool for contact enumeration/resolution. Do not scrape, buy lists, or fabricate contacts.
- `searchEntity(action: "prospects")`: use `companyDomains`, `titles`, `titleFilters`, `seniorities`, `departments`, `locations`, `limit`. Do not use `seniorityLevels`.
- `searchEntity(action: "companyTitles")`: needs `domain` or `companyLinkedinUrl`.
- `fetchContact(action: "email")`: request `emailTypes: ["work"]` plus known identifiers: first/last name, domain, full LinkedIn URL when available.
- `fetchContact` includes the in-house email fallback. Do not call `findEmail` as a second pass.
- Verify found emails with `fetchContact(action: "verifyEmail")`. Send only to deliverable addresses; keep risky/unknown/not-found contacts for human review.

## Workflow

### 0. Qualify the Swarm

Before spending contact credits, confirm in one `askUser` checkpoint:

- Trigger account/person, objective, relevant persona universe.
- Schedule lookback window (use the scheduled run's window; default last 24h), sender identity, daily cap, draft-only vs approved first batch.
- Lawful basis to email these contacts.
- Destination for the account plan: Ploy document by default, optionally CRM/Sheet through `integrations`.

Set the contact/email cap from the lookback window, not a fixed number: last 24h = 3-5 selected contacts/emails, 2-3 days = 5-8, 7 days = 8-12. Increase only when the user approves a broader account push.

Output: account objective, lookback window, contact cap, draft/send stance, and roster destination.

### 1. Resolve the Account

- If the user named the account, start there. Otherwise use `visitors(action: "list")` or `visitors(action: "breakdown", field: "companyDomain")`; use `engagement` only when prioritization needs engagement signals.
- If multiple sites exist, use `workspace(action: "get")` before `visitors`; do not guess.
- Capture company/domain plus any trigger person, title, LinkedIn URL/slug, and source signal.
- Use `web` first for public company context. Use `enrichEntity(action: "company")` only when structured firmographics are needed.

Output: target account, domain, company context, trigger signal, and "why this account, why now."

### 2. Build the Roster

- Use `companyTitles` when title discovery is needed; then `prospects` with the approved domain/persona filters.
- Select contacts up to the lookback-derived cap. Include the trigger visitor when relevant; drop weak fits with a short reason.
- Resolve work emails only for selected contacts; verify every found address.
- Write roster rows to `documents`: company, domain, contact, title, persona, email, verification status, source signal, notes.

Output: reviewed roster with no fabricated email addresses.

### 3. Map Personas

- Group contacts into 2-5 persona cohorts.
- Write one concise value proposition per persona, grounded in the company and trigger signal.
- Load `seo-aeo-strategy-system` only if the outreach/content needs a real SEO/AEO argument. Load `website-seo-setup` only if actually fixing/building SEO implementation.
- Store persona rationale in the roster so drafts can reuse it.

Output: persona cohorts, hooks, and value props.

### 4. Match or Build Content

- Inspect existing site/docs before creating anything: `code` search, `documents(action: "ls")`, and `site` if published structure matters.
- Assign one canonical URL/path per persona where possible. Do not build near-duplicate pages for adjacent personas.
- Build only if the content gap materially improves outreach and the user approves. Then load `build-content-page`, `build-site-page`, and `siteComponents` as needed.
- If page building is not approved, record the gap as a recommendation.

Output: each persona has an existing link, approved new page, or documented gap.

### 5. Draft Outreach

- Load `copywrite`.
- Draft one base email per persona, then lightly personalize by recipient.
- Do not reveal visitor-identification mechanics or write surveillance-flavored copy.
- Keep each draft short: opener, persona value, content link, one low-friction CTA.
- Save drafts in the roster document. Use `integrations` to discover Gmail draft actions (`list_actions` or `search_actions` -> `get_action_schemas` -> `execute`) and create one draft per deliverable selected contact, up to the cap. If Gmail writes are blocked, stop and let the user use the tool's enable-writes button.

Output: reviewable drafts plus skips for missing/unverified emails.

### 6. Create the Send Plan

- Respect the approved daily cap and lookback-derived contact cap; default to 1-3 contacts from the company per day.
- Prioritize the trigger visitor and strongest senior buyers, then influencers.
- Use one touch per contact unless the user approves a follow-up sequence.
- Store planned date, status, provider draft ID/link, and next action in the roster.
- If the user approves sending now, send only the approved first batch through `integrations`; do not schedule future sends unless requested and supported.

Output: dated send plan and, only when approved, sent first batch.

### 7. Report and Follow Through

Close with a decision-ready summary:

- Target account, trigger signal, qualification rationale.
- Roster count by persona, verified emails, drafts created, contacts skipped.
- Content linked or built by persona.
- Send plan and any first-batch sends.
- Risks: unverified emails, weak personas, missing content, disconnected integrations.
- Optional: save 1-2 `proactivePloys` recommendations for missing content or the next approved batch.

## Rules

- Keep the roster small and relevant; scale selected contacts from the schedule lookback window.
- Draft first; checkpoint before any send.
- Tailor value propositions by persona. No generic blast.
- Attach or recommend relevant content for each persona.
- Stagger sends by company and respect the daily cap.
- Record decisions, draft status, and send status so reruns do not double-contact people.

## Use / Skip

Use when a high-fit visitor or company signal warrants buying-committee outreach with persona-specific content.

Skip when the user wants one email to one person, a newsletter/nurture campaign, broad opted-in list sending, automated multi-day sending without review, or contact enumeration without Contact Tool.
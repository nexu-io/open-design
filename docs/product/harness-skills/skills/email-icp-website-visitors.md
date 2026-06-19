# Email ICP Website Visitors

Description: Use when the user wants outbound from identified site visitors: rank high-fit visiting companies, resolve one verified work contact per company, create reviewable Gmail drafts, and export the queue.

# Email ICP Website Visitors

> Inspired by and attributed to [Emre Kavaloglu](https://www.linkedin.com/in/kavaloglu/).
>

Turn Ploy's identified visitor data into a small outbound queue: best-fit companies, one sensible contact per company, reviewed Gmail drafts for verified work emails, and a CRM/Sheet/Ploy-document export. Size the queue from the lookback window; scheduled runs often use **last 24h** and should process the new qualified visitors from that window, not an arbitrary top-10 batch.

## Tool Contracts

On-demand: `visitors`, `fetchContact`, `enrichEntity`, `searchEntity`. Load `visitors` separately first. Load `["fetchContact", "enrichEntity", "searchEntity"]` only before contact resolution; if any are missing, Contact Tool (`contact_tool`) is unavailable. In that case, rank/export company-only leads and tell the user a Ploy admin must enable Contact Tool for names/emails.

Default tools: `workspace`, `dateTime`, `documents`, `integrations`, `askUser`, `web`.

High-cost / easy-to-misuse details:

- `visitors` is identified visitors only, not total traffic. Use `analytics` for total traffic.
- Use `web` for public company context. Use `enrichEntity(action: "company")` only when structured firmographics are still needed.
- Call `fetchContact(action: "email")` with `emailTypes: ["work"]` plus all known identifiers: `firstName`, `lastName`, `domain`, full `linkedinUrl`.
- Convert visitor `linkedinSlug` to `https://www.linkedin.com/in/{linkedinSlug}` before passing `linkedinUrl`.
- Do not call separate `findEmail`; `fetchContact` already includes the fallback.
- Only `verifyEmail` status `deliverable` is ready for drafts/sends. `risky`, `unknown`, or empty stays `needs review` / `not found`.
- This Ploybook relies on Gmail drafts. Check Gmail early with `integrations(action: "list_actions", toolkit: "gmail")` or `search_actions` for "create gmail draft". If Gmail is disconnected, unavailable, or no draft/write action is visible, pause for the in-chat Connect/Enable flow or run document-only if the user accepts that degraded path.
- Never expose visitor-identification mechanics or write "we saw you on our site" copy.

## Workflow

1. **Scope:** Confirm site if ambiguous, time window, ICP definition, destination, and draft policy. Default manual runs to last 7 days; default scheduled runs to the last 24h. Check Gmail draft availability here before contact lookup. Ask once with `askUser` only for missing decisions.
2. **Pull visitor signals:** Use `visitors` breakdowns for company/domain, industry, and optionally job titles. Use `list` for person/company rows. Use `engagement` only when events should affect ranking; weight `form.submitted`, `form.started`, `cta.clicked`, repeat visits, and recency above passive views.
3. **Rank before contact lookup:** Score companies by ICP fit + intent. Drop obvious non-fits (own company, competitors, agencies/vendors outside ICP, students, no actionable domain). Size to the window, not a fixed count: last 24h scheduled run = all new qualified companies not already exported, bounded by the user's daily cap; wider lookbacks = rank and trim to the strongest backlog. Save a working document with company, domain, intent signal, fit rationale, and source visitor row.
4. **Resolve one contact per company:** Prefer a named visitor when their role matches the ICP. Otherwise use `searchEntity(action: "companyTitles", domain)` if title discovery helps, then `searchEntity(action: "prospects", companyDomains: [domain], titles/titleFilters/seniorities/departments)`. Do not use `seniorityLevels` for prospects. Pick one primary contact unless the user asks for more. Resolve and verify work email; never fabricate an email.
5. **Draft for review:** Load `copywrite` if writing from scratch. Draft concise role-aware emails using the company rationale and one low-friction CTA. Create Gmail drafts via `integrations` (`search_actions`/`list_actions` -> `get_action_schemas` -> `execute`); otherwise keep drafts in the document and tell the user to use the in-chat Connect/Enable button.
6. **Export:** Persist every shortlisted company, including no-email rows. Include company, domain, industry, fit rationale, intent signal, contact, title, email status, draft status, visit count/last seen, and notes. For CRM/Sheets, discover actions with `integrations`; prefer upsert/search-first to avoid duplicates.
7. **Report:** Summarize window, ICP, identified pool, shortlist count, verified emails, drafts, export destination, and blocked/skipped rows. Suggest weekly reruns only for active sites, skipping companies already exported unless the user asks to refresh.

## Rules

- MUST define ICP before ranking.
- MUST load `visitors` separately from Contact Tool so degraded ranking still works.
- MUST resolve contacts only for shortlisted companies.
- MUST size company/contact count from the time window and schedule cadence, with one contact per company by default.
- MUST check Gmail draft integration early before spending contact credits.
- MUST use `emailTypes: ["work"]` unless the user explicitly asks otherwise.
- MUST verify emails before treating them as draft-ready.
- MUST create drafts, never auto-send.
- MUST persist companies even when no email is found.
- MUST distinguish identified visitors from total traffic.
- MUST NOT reveal visitor-identification mechanics.
- MUST NOT fabricate company facts, personalization, contacts, or email addresses.
- MUST NOT send users to Settings for integrations; use the in-chat Connect/Enable flow.

## Use / Avoid

Use for: "email site visitors", "follow up with companies that visited", "export visitor leads", or "turn identified visitors into outbound."

Avoid for: total traffic/page analytics, broad newsletter/campaign sends, or account-wide multi-person orchestration.
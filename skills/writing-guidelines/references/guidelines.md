---
description: Review docs/prose for Vercel Writing Guidelines compliance
argument-hint: <file-or-pattern>
---
# Writing Guidelines
Review these files for compliance: $ARGUMENTS
Read files, check against rules below. Output concise but comprehensive: sacrifice grammar for brevity. High signal-to-noise.
## Rules
### Planning & content type
- Every page has a plan (overview, goal, audience, content plan, open questions) referenced or linked
- Content type declared in `meta.contentType`: `Tutorial`, `How-to`, `Reference`, `Conceptual`, `Troubleshooting`, or `Landing`
- Title is user-shaped (the user's question), not feature-shaped (the engineer's name)
- Page does one job: tutorial OR how-to OR reference, not three at once
- Goal is verb-driven (Bloom's taxonomy): "configure", "explain", "debug" (testable)
- Multi-audience pages: short shared opener, then technical subsections
### Voice & tone
- Active voice. Mental test: append "by monkeys". If the sentence parses, rewrite
- Direct address: `you`, never `the user` or `one can`
- Imperative for steps: "Click **Add Project**", not "You will need to click **Add Project**"
- Sentences under 20 words target
- Contractions encouraged (`you'll`, `it's`) for warmth
- Present tense unless describing future behavior
- Limit `we`: only for deliberate Vercel actions ("we recommend", "we deprecated"), never as a stand-in for "you"
- No rhetorical questions (sounds like marketing)
- Second-read test: read each sentence once at speech pace; if you re-read to parse it, name the subject, the action, and the consequence (kill metaphor verbs and pronouns reaching back several sentences)
### Banned words
- `easy`, `simple`, `quick`: puts pressure on the reader and reads as marketing; replace with concrete description ("one command", "default settings", "most projects don't need this")
- `very`, `just`, `really`: filler; cut or rewrite
### Concision
- Earn every detail: cut a number, name, or implementation detail if a more general phrasing wouldn't change the reader's understanding or action
- Weasel words: replace vague qualifiers (`significantly`, `many`, `often`, `typically`, `generally`) with a specific number or claim
- Vague quantifiers: no `near-zero`, `sub-second`, `most requests`; give the figure and cite it (`99.37% of requests see zero cold starts`)
- Filler/metaphor verbs: name the action instead of reaching for cadence (`moves through`, `lands`, `carries`, `hits` → the literal step)
### AI-generated tells (flag these)
- Summary-style transitions: never open a paragraph by recapping the last one (`With this setup complete…`, `Now that we've explored…`); pivot straight to the next point (`In practice…`, `The catch is…`)
- Stop-start sentences: don't split one dependent idea into choppy fragments (`Previously this was manual. Now it's automatic. This saves time.` → one sentence); short sentences for emphasis are fine
- Spec-sheet voice: rewrite sentences that read like a system reading a datasheet (`provides`, `is configurable`, `is explicitly labeled`)
- Cold-open paragraphs: a body paragraph whose first sentence works as a standalone heading has no antecedent; carry the prior subject forward (`Because…`, `Once…`)
- Personified artifacts: machines don't perform human-physical actions (`hand the browser a URL` → `the browser fetches the URL`; `the token holds…` → `the token is stored…`)
- Reused framing: the angle must come from this page, not a template (`The question most teams face is whether…`)
### Tone, by content type
- **Tutorial**: warm, encouraging, predictable structure, no traps
- **How-to**: terse, direct (reader is mid-task)
- **Reference**: neutral, exhaustive, quotable
- **Conceptual**: explain like the reader will teach it back; examples and analogies welcome
- **Troubleshooting**: empathetic but not apologetic; acknowledge then fix
### Headings
- Sentence case for page headings (`H1` `H2` `H3`): "Configure environment variables", not "Configure Environment Variables"
- Title case for nav labels: "Configuring Environment Variables"
- `meta.title` becomes the `H1`; `meta.navLabel` becomes the sidebar entry
- Subheadings descriptive, not cute: "Caveats when self-hosting on Cloudflare", not "Caveats"
- Reader should be able to guess section content from the heading alone
### Structure
- Every page opens with a one-paragraph TL;DR of what the page covers
- Every major section opens with a summary sentence
- Acronyms spelled out on first use: "Content Security Policy (CSP) blocks inline scripts"
- Define every term the first time you use it (link to its conceptual page)
- Reference docs organized by surface; education docs organized by reader task
- Keep paragraphs to 2 to 4 sentences; split anything longer or covering two ideas
### Lists
- Three or more list-shaped items in a paragraph: convert to a list
- Bulleted for unordered; numbered for ordered (lifecycles, sequential steps)
- Always introduce a list with a colon
- No periods at the end of list items unless they are full sentences
- Bold/description format: `- **Term**: description here` (colon after bold term)
### Code
- Code blocks need a language tag for syntax highlighting
- TypeScript is the default for new code unless the surface is genuinely language-agnostic
- Multi-step flows wrapped in `<Steps/>` so structure is visible
- Highlight load-bearing lines: `` ```typescript {8-12,23-37} ``
- ≤80 columns per line in snippets
- ≤25 lines per snippet; split longer blocks with prose
- Omit defaults; don't repeat variable definitions, use shared var
- Minimal comments in code blocks; prefer prose explanation
- Explain what every code block does in prose (don't drop and run)
- Don't reference full example files at the end of guides ("See `train.py`"); the guide is the deliverable
### Placeholders
- Text placeholders: `snake_case`, descriptive: `your_access_token_here` (so reader can double-click to select before pasting)
- Number placeholders: count up `1234567890123` (recognizable as fake, predictable)
- Never `<TOKEN>`, `xxx`, `your-token`, or generic ALL_CAPS
### Data sizes & units
- Space + uppercase unit: `64 KB`, `5 KB`, `200 ms`
- Exception: seconds is bare: `30s`
- Consistent across the corpus so readers can develop scanning habits
### Money & pricing pages
- Uncompromising detail: err on "too much"
- Use tables for pricing
- Never assume reader knows the pricing model or whether their workload counts as one invocation or several
- Clarity and transparency above all else
### Emphasis
- **Bold** means UI element or critical fact, never emphasis-for-emphasis-sake
- Reaching for bold for tone: the sentence is weak; rewrite it
- `Inline code` for paths, file extensions, identifiers, short snippets: `/api`, `.tsx`, `body`, `query`, `req`
- Rule: if it would look weird without a monospace font, monospace it
### Punctuation & typography
- Never em dashes (`—`) or dashes (`-`) as punctuation; use colons, commas, periods, or rephrase
- Curly quotes `"` `"` and `'` `'`, not straight `"` or `'`
- Ellipsis `…`, not three dots `...`
- Loading states end with `…`: `Loading…`, `Saving…`
- Non-breaking spaces in `10&nbsp;MB`, `⌘&nbsp;K`, brand names
- `&` over "and" only where space-constrained (nav labels, buttons)
### Source formatting
- Don't hard-wrap paragraphs: each paragraph is one line in source, let the editor wrap
- One blank line before headings; one blank line before and after code blocks
- No `---` horizontal rules between sections
- No extra blank lines between elements that aren't paragraph breaks
### Links
- Define every term the first time it appears, link to its conceptual page
- Anchor text names the destination; never bare URLs or `here`/`link`
- Dashboard deep links use the standard format: `https://vercel.com/d?to=%2F%5Bteam%5D%2F~%2Fai-gateway%2Fapi-keys&title=AI+Gateway+API+Keys`
- Link to canonical product docs where relevant: `https://vercel.com/docs/vercel-sandbox`, `https://vercel.com/docs/ai-gateway`
- AI Gateway model catalog: `https://vercel.com/ai-gateway/models`
### Models in examples
- Always use the latest model strings: `anthropic/claude-opus-4-7`, not `anthropic/claude-sonnet-4` or older
- For image generation default: `google/gemini-3.1-flash-image-preview`
### AI workflow
- You are accountable for the content you produce, however it is created
- You are the final arbiter; the model proposes, you dispose
- Hold technical accuracy to a high standard: docs are also consumed by LLMs, wrong docs train wrong models
- Use only enterprise models that do not train on your data (especially for unreleased products)
- Disclose AI use in the PR (model + prompts if useful)
- Plan first by hand; the plan is the spec the model works against
- Use plan-mode in your editor (Cursor, Claude) before letting the model write
- Tell the model to follow `AGENTS.md` and the linting checklist
- Run a test prompt against the preview: "given this plan's goal, can the model complete the task using only this page?"
- Final human review always
### Quality checklist (required boxes are non-negotiable)
- **Findability**: sidebar bucket set via `meta.category`; UI links to docs from any dashboard surface that exposes the feature
- **Accuracy**: code samples actually run; screenshots map 1:1 to current UI and use the ACME demo account
- **Relevance**: code samples included where applicable (TypeScript first; `<Steps/>` for multi-step flows)
- **Clarity**: overview addresses who/what/where/why; high-level use cases laid out; quickstart for new products; prerequisites listed on tutorials; sample repo in `vercel/examples` for multi-step tutorials; steps detailed not vague; visual aids in confusing sections; simplest path recommended when multiple exist
- **Completeness**: limits documented; all-limits tables updated; content plan followed and goals addressed
- **Readability**: nav names scannable and use action verbs; content types accurately used; subheadings descriptive; topics start with summaries; code blocks formatted correctly; active voice where warranted
### Review
- PR description links to the content plan, lists what to review, and links the preview URL
- Ping the team via the PR link (not the plan or preview directly)
- Author is accountable, not the reviewer; reviewers are liberal with approvals
- Suggestion comments for small text fixes; preview comments for anything bigger
- Disagreement is fine; reject with a one-line reason and move on
### Anti-patterns (flag these)
- Em dashes (`—`) or dashes (`-`) used as punctuation
- `easy`, `simple`, `quick` describing reader actions
- Passive voice (apply "by monkeys" test)
- Title Case in page headings (only sentence case in `H1` through `H6`)
- Generic placeholders: `<TOKEN>`, `xxx`, `your-token`, `ABC123`
- Code blocks without a language tag
- JS examples where TypeScript is the convention
- Code blocks over 25 lines without prose between
- Hard-wrapped prose paragraphs (multiple lines for one paragraph in source)
- `---` horizontal rules between sections
- Subheadings that are single generic words: `Overview`, `Caveats`, `Notes`
- Bold used for emphasis instead of UI element or critical fact
- Page or section without an opening summary
- Straight quotes (`"`, `'`) instead of curly (`"`, `'`)
- Three dots (`...`) instead of ellipsis (`…`)
- Acronyms used before being spelled out
- Bare unit numbers (`64KB`, `5kb`, `200MS`) instead of `64 KB`, `5 KB`, `200 ms`
- "We" standing in for "you"
- Rhetorical questions
- Filler words: `very`, `just`, `really`, `simply`
- References to "the full example file at the end of the guide" rather than inlining the code
- Outdated model strings in examples (`anthropic/claude-sonnet-4`, `gpt-4o`, DALL-E)
- Hardcoded date/number formats instead of `Intl.DateTimeFormat` / `Intl.NumberFormat` in code samples
- "Loading..." instead of "Loading…"
- Summary-style transitions recapping the previous paragraph (`With this setup complete…`)
- Stop-start fragments splitting one dependent idea into choppy sentences
- Spec-sheet voice reading like a datasheet (`provides`, `is configurable`, `is explicitly labeled`)
- Cold-open body paragraphs whose first sentence has no antecedent
- Personified artifacts performing human-physical actions (`hand the browser a URL`)
- Reused/template framing not specific to the page (`The question most teams face is whether…`)
- Weasel words instead of a specific claim (`significantly`, `many`, `often`, `typically`, `generally`)
- Vague quantifiers without a cited figure (`near-zero`, `sub-second`, `most requests`)
- Filler/metaphor verbs instead of the literal step (`moves through`, `lands`, `carries`, `hits`)
- Sentences that need a second read to parse
- Paragraphs over 4 sentences or covering two ideas
- Bare URLs or `here`/`link` as anchor text
## Output Format
Group by file. Use `file:line` format (VS Code clickable). Terse findings.
```text
## content/docs/sandbox.mdx
content/docs/sandbox.mdx:1 - missing meta.contentType
content/docs/sandbox.mdx:12 - title "Vercel Sandbox" is feature-shaped, not user-question
content/docs/sandbox.mdx:24 - passive voice ("the sandbox is created...")
content/docs/sandbox.mdx:31 - banned word "easy"
content/docs/sandbox.mdx:47 - "..." → "…"
content/docs/sandbox.mdx:58 - code block missing language tag
content/docs/sandbox.mdx:71 - placeholder <TOKEN> → your_access_token_here
content/docs/sandbox.mdx:89 - "64KB" → "64 KB"
content/docs/sandbox.mdx:102 - H2 "Caveats" too generic; add specificity
content/docs/sandbox.mdx:118 - em dash in prose, replace with colon/comma
## content/docs/ai-gateway.mdx
content/docs/ai-gateway.mdx:5 - title case in H1; sentence case only
content/docs/ai-gateway.mdx:18 - acronym AI Gateway used before being spelled out
content/docs/ai-gateway.mdx:34 - bold for emphasis, not UI element
content/docs/ai-gateway.mdx:52 - `anthropic/claude-sonnet-4` outdated; use `anthropic/claude-opus-4-7`
content/docs/ai-gateway.mdx:71 - hard-wrapped paragraph (lines 71-74)
## content/docs/cron.mdx
✓ pass
```
State issue + location. Skip explanation unless fix is non-obvious. No preamble.

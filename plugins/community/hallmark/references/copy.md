# Copy

Words are part of the design. A great layout with stock copy looks generic. Tight copy in an average layout reads as considered.

## Principles

- **Specific verbs.** "Save changes" beats "OK" beats "Submit".
- **Labels describe.** "Email address" beats "Email".
- **Link text stands alone.** "View pricing plans" beats "Click here".
- **Errors are instructions.** Describe what broke, why, how to fix — in that order.
- **Active voice.** "We couldn't find your account" beats "Your account could not be found".
- **Consistency.** Pick one of "Delete" or "Remove". Pick one of "Sign in" or "Log in". Use it everywhere.

## Buttons

Use the verb for the action the button performs.

Good: `Save changes`, `Create account`, `Send invitation`, `Copy link`, `Open file`.
Bad: `OK`, `Submit`, `Click here`, `Continue` (only as the secondary button of a multi-step flow).

## Error messages

Three parts:

1. **What happened.** Past tense, factual. "That card was declined."
2. **Why, if known.** "Your bank flagged the charge."
3. **What to do.** Imperative. "Try another card, or contact your bank."

Never apologetic for the *user's* input. Don't say "Oops!" on a validation error. A form that won't accept a value should explain the value, not perform embarrassment.

## Empty states

Three beats:

1. One line naming what's empty. "No projects yet."
2. One line on why this matters / what projects are. "Projects group your tasks and team."
3. One button. The single next action. "Create a project".

## Loading

- Short wait: spinner with no text.
- Medium wait (>2s): spinner + "Loading…".
- Long wait (>10s): spinner + progress indication + an honest label — "Compiling (this can take a minute)."

## Microcopy bans

- "Click here." Link text must stand alone.
- "Oops!", "Uh oh!", "Something went wrong." Name the thing that broke.
- "Enter your email below." If the input is below, you don't need to say so.
- Exclamation marks in error states.
- Humour in frustration paths (forgot-password, payment-failed, account-locked).
- Stock placeholder names: Jane Doe, John Smith, Lorem Ipsum (unless the page is a lorem-ipsum tool).
- Startup clichés in product copy: Acme, Nexus, Unleash, Seamless, Supercharge, Transform, Elevate, Empower, Delight, Magical.
- Marketing copy that promises a feeling without naming a feature. "Experience the power of ___" is empty.

## Proper typography

- Curly quotes: `"Hello"`, `'word'`.
- Em-dash for interruption: `—` (U+2014). En-dash for ranges: `10–20` (U+2013). Never `--`.
- Ellipsis: `…` (U+2026). Never `...`.
- Apostrophe: `’`. Never the prime `'`.
- Non-breaking space before units: `10 kg`, `5 min` (use `&nbsp;` or U+00A0).

If the text is loaded from a CMS, configure Smart Quotes in the CMS. If it's hard-coded, write it correctly.

---

## Voice samples per tone

The skill bends toward distribution-default copy ("Built for the modern team", "Unleash your X", "Where A meets B") unless given non-default voices to imitate. The samples below are *real opening lines* from sites that defy that distribution. **Imitate the kind of specificity** — named places, named dates, named verticals, refusal of metaphor, refusal of the verb — not the wording. The tone column maps to the seven tones the design-context gate (see [`SKILL.md`](../SKILL.md) Step 1) commits the user to.

### Editorial

Three voice patterns: *date-anchored*, *refusal of the verb*, *enumerative*.

- *"Creative direction, design and type for culture since 2003."* — apracticeforeverydaylife.com — date + named verticals
- *"A monthly art publication featuring contributions by some of the most engaged thinkers working today."* — e-flux.com/journal — uses cadence (*monthly*) and a verb (*featuring*) that's specific
- *"A thing well made."* — klim.co.nz — refusal of the verb, treats design as material
- *"Frieze elevates the provocative and brilliant leading voices who shape and challenge today's art world."* — frieze.com — uses *challenge* instead of *empower*
- *"We design everything for everyone."* — pentagram.com — refusal of marketing verbs; democratic claim
- *"Writer + Photographer."* — craigmod.com — three words, two roles, no padding
- *"Type, set with care."* — Hallmark Specimen — three words; the comma is the design
- *"I'm a French design technologist based in London. I make websites and fonts, amongst other physical and digital artefacts."* — mathieutriay.com — named place, named deliverables, "artefacts" signals craft

### Brutalist

Three voice patterns: *flat declarative*, *refusal of metaphor*, *direct address with consequence*.

- *"The product development system for teams and agents."* — linear.app — flat declarative; no flourish, no "powered by AI"
- *"Resend is the email API for developers. Send transactional and marketing emails at scale with a simple, modern API."* — resend.com — names the form factor, the audience, and what it does
- *"Purpose-built for planning and building products. Designed for the AI era."* — linear.app — names the era plainly, no euphemism
- *"WE ARE A STUDIO. WE ARE NOT A PLATFORM."* — Hallmark Meridian (test 04) — defines by refusal, all caps
- *"We design products that last twelve years. We do not design products that need replacing every two."* — concrete number, paired declaration
- *"A toolkit for assembling new worlds from the scraps of the old."* — are.na — second-position copy that breaks template
- *"NO COMPROMISE."* — Hallmark Brutal — two words; the period is the design
- *"We will not put our work behind a chatbot. We will answer the email ourselves."* — declarative refusal, two short sentences

### Soft

Three voice patterns: *poetic restraint*, *passion via enumeration*, *vulnerability with proof*.

- *"It's about time."* — cron.com — pun without winking; restraint
- *"Time is our most precious resource."* — Notion Calendar — opens on the philosophical premise, then gets concrete
- *"Designer for the Web (v. XIX)."* — lynnandtonic.com — version number signals craft-in-progress
- *"Design engineer creating software that makes people feel something."* — rauno.me — emotional outcome over feature list; "feel something" avoids genre cliché
- *"All I want to do is build websites. Typography, motion design, copywriting, performance — the web is an endless medium of opportunity."* — paco.me — passion via enumeration; vulnerability ("scratched the surface")
- *"I craft UI demos that explore the power of the web and help others sharpen their skills."* — jhey.dev — names the verb (*craft*), names the audience (*others*)
- *"Soft, but exact."* — Hallmark Plume — two short adjectives, one comma, full stop
- *"This page is soft because the surface should be soft. The rules underneath are not."* — pairs claim with refusal

### Technical

Three voice patterns: *spec-embedded prose*, *measured language*, *data-first opening*.

- *"The 14-inch MacBook Pro with M5 brings serious speed and advanced on-device AI to the personal, professional, and creative work you do every day."* — apple.com — spec embedded in prose; "serious speed" is measured language
- *"434 total posts. New CSS you feel like you could use today."* — nerdy.dev (Adam Argyle) — data-first; "feel like" suggests genuine utility
- *"$ streampipe parse access.log --filter status=5xx | jq"* — Streampipe (test 02) — open on a real command, not a marketing claim
- *"Open the trace, find the span, fix the regression. No glossary required."* — Tracejam (test 05) — three concrete verbs, then a refusal
- *"From stdin, through the pipe, into your dashboard."* — names the data path; refuses abstraction
- *"23 spans · 4 services · 482 ms."* — Tracejam mockup — data is the headline
- *"Read anything that emits lines. Files, pipes, sockets, kubectl logs."* — names the inputs, refuses generality
- *"Drop-in OTLP. No agent, no sidecar."* — pairs claim with refusal of common alternatives

### Luxury

Three voice patterns: *heritage with specifics*, *refusal as sophistication*, *named scale*.

- *"The world's most acclaimed creative collective, where 23 partners work independently and collaboratively to shape the future of design."* — pentagram.com — heritage (implied longevity), named scale (23 partners)
- *"By appointment."* — atelier-style — refusal as gatekeeping
- *"A salon for the senses."* — Hallmark Salon — single nominal phrase, comma-free
- *"A page should arrive like a person — composed, deliberate, in good clothes."* — Hallmark Salon — analogy treats the page as social
- *"With pleasure, you are most welcome."* — Hallmark Salon salutation — formal address
- *"Restraint, repeated, becomes a signature."* — Hallmark Atelier — three commas, four words, philosophical
- *"A studied hand."* — three words; the determiner does the work
- *"A small, opinionated craftsmanship engine that argues with your AI assistant on your behalf — and wins."* — Hallmark Atelier — names the role precisely, embraces the conflict

### Playful

Three voice patterns: *analogy via pop-culture*, *food/sensory metaphor*, *anticipated reaction*.

- *"Playlists, but for ideas."* — are.na — analogy that's also useful
- *"Internet memory palace."* — are.na — three-word noun phrase, structural metaphor
- *"Devouring details. Nourishing novelty. Deploying excellence."* — rauno.me — alliteration; food + tech metaphor
- *"The kind that make you say, 'Wait, how did you do that?'"* — jhey.dev — direct address, anticipates the reader's reaction
- *"Built to ship."* — Hallmark Sport — three words, declarative, with a verb that's a verb
- *"Ready? You are two minutes from shipping."* — Hallmark Sport — a question, then a number
- *"design like print: warm, off-register, intentional."* — Hallmark Riso — lowercase + colon + three modifiers
- *"this is not a page that pretends to be paper. it is a page that remembers paper."* — Riso — refuses the imitation framing

### Austere

Three voice patterns: *extreme abbreviation*, *principle as opening*, *refusal of marketing language*.

- *"Hello."* — Hallmark Quiet salutation — one word; the period is the design
- *"This is a page that doesn't try."* — Quiet — declares the position openly
- *"Things Become Other Things."* — craigmod.com — three words; treats brand as essay title
- *"Lightness above weightiness, elevate everyone you encounter."* — craigmod.com — principle-first positioning
- *"A quiet skill."* — Hallmark Quiet — three words; the article is doing work
- *"Software can be soft and exact at once. That's the trick."* — Hallmark Plume — names the contradiction, names the resolution
- *"One HTML file."* — Anya (test 06) footer — three words; the count is the boast
- *"This page doesn't move."* — names the design decision openly

---

## Banned opening lines (anti-patterns)

These phrases appear across distribution-default LLM copy and reach for none of the specificity above. **Banned outright** — if you find yourself reaching for one, replace it with one of the patterns from the tone above.

| Phrase | Why it fails |
| --- | --- |
| *"Built for the modern team"* | Vague; assumes no specifics; temporal marketing |
| *"Unleash your [X]"* | Hyperbolic; software can't unleash anything |
| *"Where X meets Y"* | False synthesis; creative laziness |
| *"Empower your..."* | Missionary language; avoids concrete benefit |
| *"Reimagine the way you..."* | Suggests dissatisfaction before explaining need |
| *"Supercharge your workflow"* | Energy metaphor without mechanics |
| *"Innovative solutions"* | Meaningless; every product claims innovation |
| *"Seamless integration"* | "Seamless" has no antonym; signals non-specificity |
| *"In today's digital landscape"* | Temporal hand-wave; assumes the reader needs orientation |
| *"Next-generation"* | Implies predecessor inadequacy; offers no differentiation |

If the brief gives you nothing to work with for an opening line, *say so to the user* and ask one question that elicits a specific noun, verb, or place. The user knows their product; the model is not allowed to invent specificity.

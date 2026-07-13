---
name: clinical-case-report
description: |
  Structured medical case presentation for clinical rounds, conferences,
  and documentation. Generates SOAP-format or narrative case reports
  with physiologically accurate vitals, labs, and evidence-based plans.
  Use when the brief mentions "case report", "case presentation", "SOAP note",
  "clinical case", "ward rounds", "case summary", or "patient presentation".
triggers:
  - "case report"
  - "case presentation"
  - "soap note"
  - "clinical case"
  - "ward rounds"
  - "patient presentation"
  - "case summary"
  - "medical case"
od:
  mode: prototype
  platform: desktop
  scenario: healthcare
  preview:
    type: html
    entry: index.html
  fidelity: high-fidelity
  example_prompt: "58-year-old male with 2 hours of substernal chest pain radiating to the left arm, diaphoresis, and ST elevation in leads II, III, aVF. Generate a full emergency cardiology case presentation."
---

# Clinical Case Report Skill

Generate a structured medical case presentation for clinical rounds,
conferences, or documentation. The output follows standard medical
formatting conventions used in hospital settings worldwide.

## What you will produce

A single-page HTML case report (`index.html`). Content varies by format
(see `references/case-formats.md` — selected in Step 0):

**SOAP / Conference format:**
- **Patient identification** — age, sex, chief complaint
- **History of Present Illness (HPI)** — chronological narrative with
  pertinent positives and negatives
- **Past Medical History, Medications, Allergies**
- **Review of Systems**
- **Physical Examination** — systematic findings by system
- **Vital Signs** — formatted table with reference ranges and flags
- **Investigations** — laboratory results and imaging findings
- **Assessment** — primary diagnosis and differential (3–5 items)
  with clinical reasoning for each
- **Management Plan** — evidence-based, organised by problem

**Brief Rounds format** (daily review, ward round, handover, ICU, post-call):
- **ID line** — age, sex, day of admission, primary problem
- **Interval events / current status** — what has changed since last review
- **Active problems** — numbered list
- **Plan-by-problem** — concise actions for each active problem
- Full HPI and systematic physical examination are **not** included

---

## Step-by-step workflow

### Step 0 — Load reference files

Before starting, read both reference files:

1. `references/case-formats.md` — use this to choose the correct output
   format (SOAP, Conference, or Brief Rounds) based on the user's context
2. `references/checklist.md` — keep P0 gates in mind throughout; you
   must pass all P0 items before emitting the final artifact

### Step 1 — Parse the brief

Read the user's prompt and extract:

- Patient age and sex
- Chief complaint or presenting problem
- Any vitals, labs, or imaging the user has provided
- Clinical context: ED, ward rounds, conference case, outpatient, etc.
- Specialty context: cardiology, emergency, internal medicine, etc.

If the chief complaint or presenting problem is missing:
- **SOAP / Conference**: ask one clarifying question before proceeding. Do not proceed without it.
- **Brief Rounds**: if the admission problem or ID line is already available (e.g. "day-3 ICU review for septic shock"), proceed directly — a separate chief complaint is not required.

### Step 2 — Build the clinical narrative

**For SOAP / Conference outputs:** write the HPI as a continuous prose
narrative in standard clinical style:

> "This is a [age]-year-old [sex] with a history of [relevant PMH] who
> presents with [chief complaint]. Symptoms began [timeline] and are
> characterised by [quality, severity, radiation]. Associated symptoms
> include [list]. Pertinent negatives include [list]."

The HPI must be chronological. Include timeline markers
("2 hours prior to presentation", "onset yesterday morning").

**For Brief Rounds outputs** (daily review, ward round, handover, ICU,
post-call): skip the full HPI and examination. Instead produce:

- **ID line**: "[Age][sex], Day [N] of admission, [primary problem]"
- **Interval events / current status**: what has changed since last review
- **Active problems**: numbered list
- **Plan-by-problem**: concise action for each active problem

### Step 3 — Generate physiologically consistent clinical data

If the user has not provided specific values, generate values that are
internally consistent with the diagnosis:

**Consistency checks (typical patterns):**

- A patient in shock **typically** has: HR >100, SBP <90, raised lactate,
  impaired capillary refill — but medications (beta-blockers), age, or
  shock type (neurogenic, spinal) can alter this pattern
- Pneumonia **typically** presents with raised WBC, raised CRP,
  temperature >38°C — but afebrile pneumonia exists, especially in
  the elderly or immunocompromised
- A STEMI **typically** shows ST elevation in contiguous leads and raised
  high-sensitivity troponin — but early presentations may have initially
  normal troponin; CK-MB is not universally required
- Sepsis **typically** shows raised or low WBC, raised lactate >2,
  temperature abnormality — but compensated early sepsis may present
  with normal vitals
- Lab units must match convention: creatinine in µmol/L or mg/dL
  (state which), glucose in mmol/L, haemoglobin in g/dL

**Critical rule — preserve user-provided data:**
- Never overwrite a value the user has explicitly stated
- If a user-provided value is atypical for the diagnosis, keep it and
  note the atypical presentation in the assessment rather than
  forcing canonical numbers
- Never generate a value that contradicts the stated diagnosis

### Step 4 — Write the assessment

The assessment section must contain:

1. **Primary diagnosis** stated clearly on the first line
2. **Clinical reasoning** — one sentence explaining why this is the
   most likely diagnosis
3. **Differential diagnosis** — exactly 3 to 5 items, each with one
   sentence of supporting or refuting evidence
4. **Risk stratification** — include a validated clinical score where
   applicable (TIMI for ACS, GRACE for ACS, Killip class + Shock Index
   for STEMI/cardiogenic shock, CURB-65 for pneumonia, qSOFA for sepsis,
   Wells for PE, etc.). Killip class and Shock Index together are
   accepted as sufficient risk stratification for STEMI/cardiogenic shock cases.

### Step 5 — Write the management plan

The plan must be:

- **Specific**: write drug names, doses, routes, and frequencies.
  Do not write "start antibiotics" — write
  "Piperacillin-Tazobactam 4.5g IV q8h for 5 days"
- **Organised by problem** using numbered headers
- **Evidence-based**: management must reflect current standard of care
  for the diagnosis
- **Complete**: include investigations to order, monitoring parameters,
  consults to request, and disposition

If you are uncertain about a specific dose, write
"[drug name] — dose per local formulary/protocol" rather than
inventing a dose.

### Important — Prescribing Safety

Generated plans must:
- Be marked as educational/simulated, not a substitute for clinician judgment
- Use "per local formulary/protocol" language when required patient variables
  (weight, renal function, allergies) are missing from the brief
- List key contraindications and unknowns before medication recommendations
  when relevant patient data has not been provided
- Never claim a plan is "definitive" or "standard of care" without full
  patient context (allergy status, renal/hepatic function, pregnancy
  status, weight, anticoagulation/bleeding risk)
- Include a disclaimer footer in the HTML output stating the case is for
  educational and documentation purposes only

### Step 6 — Write `index.html`

Requirements for the HTML output:

- Professional medical document typography
  (Georgia or system serif font preferred)
- White background, dark text — suitable for printing
- Vital signs and lab results in HTML `<table>` elements
- Critical findings (ST elevation, raised troponin, low BP, etc.)
  highlighted in a visually distinct callout box with red left border
- @media print CSS rules so the document prints cleanly on A4/Letter
- Tag every major section with `data-od-id` for comment-mode targeting:

```html
<section data-od-id="hpi">...</section>
<section data-od-id="vitals">...</section>
<section data-od-id="pmh">...</section>
<section data-od-id="examination">...</section>
<section data-od-id="investigations">...</section>
<section data-od-id="assessment">...</section>
<section data-od-id="plan">...</section>
```

### Step 7 — Self-check against `references/checklist.md`

Before emitting `<artifact>`, run every P0 item in `references/checklist.md`.
All P0 items must pass. Fix any failures before emitting.
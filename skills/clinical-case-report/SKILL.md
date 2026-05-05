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

A single-page HTML case report (`index.html`) containing:

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

---

## Step-by-step workflow

### Step 1 — Parse the brief

Read the user's prompt and extract:

- Patient age and sex
- Chief complaint or presenting problem
- Any vitals, labs, or imaging the user has provided
- Clinical context: ED, ward rounds, conference case, outpatient, etc.
- Specialty context: cardiology, emergency, internal medicine, etc.

If the chief complaint is missing, ask one clarifying question before
proceeding. Do not proceed without it.

### Step 2 — Build the clinical narrative

Write the HPI as a continuous prose narrative in standard clinical style:

> "This is a [age]-year-old [sex] with a history of [relevant PMH] who
> presents with [chief complaint]. Symptoms began [timeline] and are
> characterised by [quality, severity, radiation]. Associated symptoms
> include [list]. Pertinent negatives include [list]."

The HPI must be chronological. Include timeline markers
("2 hours prior to presentation", "onset yesterday morning").

### Step 3 — Generate physiologically consistent clinical data

If the user has not provided specific values, generate values that are
internally consistent with the diagnosis:

**Consistency rules (must follow):**

- A patient in shock must have: HR > 100, SBP < 90, raised lactate,
  impaired capillary refill
- A patient with pneumonia must have: raised WBC, raised CRP,
  temperature > 38°C, and appropriate CXR findings
- A STEMI must have: ST elevation in contiguous leads, raised troponin,
  raised CK-MB
- A septic patient must have: raised WBC or low WBC, raised lactate > 2,
  raised CRP, temperature abnormality
- Lab units must match convention: creatinine in µmol/L or mg/dL
  (state which), glucose in mmol/L, haemoglobin in g/dL

Never generate a value that contradicts the stated diagnosis.
Never contradict values the user has provided.

### Step 4 — Write the assessment

The assessment section must contain:

1. **Primary diagnosis** stated clearly on the first line
2. **Clinical reasoning** — one sentence explaining why this is the
   most likely diagnosis
3. **Differential diagnosis** — exactly 3 to 5 items, each with one
   sentence of supporting or refuting evidence
4. **Risk stratification** — include a validated clinical score where
   applicable (TIMI for ACS, CURB-65 for pneumonia, qSOFA for sepsis,
   Wells for PE, etc.)

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
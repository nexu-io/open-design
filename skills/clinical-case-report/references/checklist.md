# Clinical Case Report — Quality Checklist

## P0 — Must Pass Before Emitting Artifact

- [ ] Chief complaint or ID line is clearly stated in the opening line
- [ ] **SOAP / Conference format only:** HPI is written as a chronological prose narrative with at least one timeline marker (e.g. "2 hours prior to presentation"); skip for Brief Rounds
- [ ] **Brief Rounds format only:** ID line present; interval events / current status documented; active problems listed; plan-by-problem present; full HPI and examination sections are not required
- [ ] Vital signs are present and physiologically plausible
- [ ] Vital signs are internally consistent with the diagnosis (allowing for clinical variability — bradycardic shock, medication-blunted tachycardia, afebrile pneumonia, early STEMI with normal troponin, etc.)
- [ ] Assessment contains a clearly stated primary diagnosis
- [ ] Plan is present and directly addresses the primary diagnosis
- [ ] If the plan includes medications: a prescribing-safety block is present before drug recommendations, confirming known inputs (allergies, renal/hepatic function, anticoagulants) and calling out unknowns (weight, bleeding risk, pregnancy); doses defer to "per local formulary/protocol" when key variables are missing
- [ ] Medication plan is labelled as educational/simulated — not a substitute for clinician judgment
- [ ] No real patient identifiers (direct or indirect): no names, MRNs, exact dates, locations, images, rare condition combos, occupation details, or verbatim stories from real cases
- [ ] All data is synthetic, de-identified, or clearly fictional
- [ ] If based on a real case, apply formal de-identification before use
- [ ] HTML renders without errors in a browser
- [ ] All major sections tagged with `data-od-id`

## P1 — Should Pass

- [ ] Past medical history includes conditions relevant to the presentation
- [ ] Medications list is present
- [ ] Physical examination findings are organised by system
- [ ] Differential diagnosis contains 3 to 5 items
- [ ] Each differential item includes one sentence of supporting or refuting evidence
- [ ] Lab values use correct units and are within realistic ranges for the diagnosis
- [ ] Plan is specific — drug names, doses, routes, and frequencies are written out where safety inputs are known; unknown variables defer to "per local formulary/protocol"
- [ ] Plan is organised by problem using numbered headers
- [ ] Critical findings are visually highlighted (red callout box)
- [ ] Document is print-friendly (white background, `@media print` rules present)
- [ ] A validated risk score is included where applicable (TIMI, GRACE, Killip class + Shock Index for STEMI/cardiogenic shock, CURB-65, qSOFA, Wells)

## P2 — Nice to Have

- [ ] Pertinent negatives documented in HPI and Review of Systems
- [ ] Imaging findings described in investigations section
- [ ] Specialist consult noted where clinically indicated
- [ ] Disposition or follow-up plan included
- [ ] Monitoring parameters specified (e.g. repeat troponin at 3h and 6h)
- [ ] Secondary prevention addressed for chronic disease presentations
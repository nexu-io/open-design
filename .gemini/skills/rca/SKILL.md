---
name: rca
description: Root Cause Analysis — invoke with /RCA or "RCA:" for a fast triage diagnosis before committing to investigation depth. Classifies evidence confidence (CONFIRMED/SUSPECTED/PROBABILISTIC) and either resolves directly or hands off to systematic debugging with a ranked hypothesis set.
---

# Root Cause Analysis (RCA)

RCA is the **triage pass** — classify confidence before committing to investigation depth. Run it first, then let the output determine what happens next.

```
/RCA → diagnosis
         CONFIRMED     → fix → verify fix
         SUSPECTED     → fast validate:
                           confirmed → fix → verify fix
                           denied   → systematic debugging Phase 3
         PROBABILISTIC → systematic debugging Phase 3 (with ranked H-set)
                           exhausted → systematic debugging Phase 1
```

---

## Step 1: Evidence Inventory

| Type | Quality | Example |
|------|---------|---------|
| Stack trace + line | High | `TypeError at auth.ts:142` |
| Reproducible steps | High | Same input → same failure every run |
| Data flow trace | High | Bad value traceable to origin |
| A/B delta | High | Works in X, fails in Y, diff is known |
| Error log + timestamp | Medium | Shows what, not why |
| Failure frequency | Medium | Rate constrains mechanism — see table |
| Symptom pattern | Low | "Fails under load" |
| Timing correlation | Low | "Started after Tuesday's deploy" |

**Failure frequency → mechanism:**

| Rate | Likely mechanism |
|------|-----------------|
| 100% | Deterministic — config, logic, or environment error |
| 85–99% | Near-deterministic; rare pass may be timing luck or retry masking |
| 50–84% | Race condition, biased non-determinism, or flaky external dependency |
| 20–49% | Cache hit rate, conditional execution path, threshold contention |
| 5–19% | Timing-sensitive window or low-probability branch |
| <5% | Heisenbug — add persistent logging before investigating |

Rate **constrains** the hypothesis set. It doesn't confirm a cause.

---

## Step 2: Classification Gate

> Can you complete *"X failed because Y did Z at [location/condition]"* with concrete evidence?
> - **Yes, with proof** → CONFIRMED
> - **Probably, missing one link** → SUSPECTED
> - **No** → PROBABILISTIC

---

## Step 3: Output

### CONFIRMED
```
[RCA: CONFIRMED]
CAUSE:      <root cause — one line>
LOCATION:   <file:line or component layer>
EVIDENCE:   <specific proof — stack trace, log line, trace>
RESOLUTION: <targeted fix — what and where>
VERIFY:     <command> → verify the fix resolves the issue
```
If EVIDENCE can't be filled with specifics, reclassify as SUSPECTED.

---

### SUSPECTED
```
[RCA: SUSPECTED]
LIKELY CAUSE:  <statement> — <high|medium> confidence
SUPPORTS:      <evidence pointing here>
MISSING LINK:  <what would confirm it>
FAST VALIDATE: <one command or check>
  → Confirmed: <resolution> → verify fix
  → Denied:    <next hypothesis> → systematic debugging Phase 3
```

---

### PROBABILISTIC
```
[RCA: PROBABILISTIC — <N> hypotheses]
EVIDENCE GAP: <what's missing that would allow confirmation>

H1 [HIGH|MED|LOW] <hypothesis>
   Supports:  <evidence for>
   Conflicts: <evidence against>
   Test:      <minimal command — one check, not a full investigation>
   If true →  <resolution path>

H2 [HIGH|MED|LOW] <hypothesis>
   ...

NEXT: Run H1 test → confirmed: fix; denied: H2
→ systematic debugging Phase 3 for full hypothesis validation
```

Ranking order: recency → proximity → symptom fit → pattern match.
Max 4 hypotheses. Testable only — no untestable speculation.

---

## Handoff Map

| RCA output | Next |
|------------|------|
| CONFIRMED | Fix → verify fix |
| SUSPECTED → validated | Fix → verify fix |
| SUSPECTED → denied | Systematic debugging Phase 3 |
| PROBABILISTIC | Systematic debugging Phase 3 with H-set |
| All hypotheses exhausted | Systematic debugging Phase 1 |

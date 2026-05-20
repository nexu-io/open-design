# Studio365 Local Bootstrap

This is the local-first Studio365 bootstrap guide for the current machine.
It starts with SPEC_AUDIT and maintains CSV task/run tracking.

## 1) Current SPEC_AUDIT

- OS: Windows-10-10.0.22621-SP0
- CPU count: 6
- CPU info:
  - Name=Intel(R) Core(TM) i5-9400 CPU @ 2.90GHz
  - NumberOfCores=6
  - NumberOfLogicalProcessors=6
- Memory total: 15.88 GB
- Memory free: 3.56 GB
- Disk total (C:): 183.43 GB
- Disk free (C:): 71.91 GB
- GPU: Intel(R) UHD Graphics 630, 1 GB
- Python: Python 3.11.9
- Node: v24.15.0
- Docker: missing
- Git: git version 2.54.0.windows.1

## 2) Risk classification

- Local AI workload risk: medium-high
- RAM headroom is limited: only ~3.6 GB free
- Disk is fine, CPU is modest, GPU is integrated
- Docker is not currently available, so do not rely on containerized runtimes yet

## 3) Recommended local model profile

- Recommended starting profile: Light mode only
- Suitable local model size: 3B or smaller, ideally 1B–3B
- Do not start heavyweight local models until RAM usage is much lower and Docker availability is resolved
- If necessary, allow only 1 concurrent AI job and enforce the RAM guard below

## 4) Machine protection policy

- If free RAM falls below 25% of total, stop any large model task
- Concurrent AI jobs: 1 only
- LLM timeout: 60–120 seconds maximum
- If a task fails 3 times in a row, escalate to review instead of retrying indefinitely

## 5) Bootstrap phase flow

1. SPEC_AUDIT
2. ENV_AUDIT
3. INSTALL_PLAN
4. SAFE_INSTALL
5. VALIDATE
6. FIX_RETRY
7. REPORT
8. UPDATE_QUEUE

## 6) Required CSV tracking files

The current bootstrap folder maintains these files:
- `infra/bootstrap/task_queue.csv`
- `infra/bootstrap/run_log.csv`
- `infra/bootstrap/install_status.csv`
- `infra/bootstrap/incident_log.csv`

## 7) Prompt Pack for Antigravity

Use these prompts in order.
The full Thai prompt pack is available at `docs/studio365-local-bootstrap-prompt-pack-th.md`.

### Prompt 1 — SPEC_AUDIT
This is the first and most important prompt.

> You are my Local Operations Controller for Studio365.
>
> MISSION:
> Create a safe, no-cost, local-first setup workflow on this machine using ticket phases and CSV queue tracking.
>
> CONSTRAINTS:
> - No paid tools, no credit card, free/OSS only
> - Safety first: inspect-first, classify-first, approval-before-destructive-change
> - Do not install heavy components before machine capacity check
> - Keep system responsive; avoid overloading CPU/RAM
> - Single writer per task scope
> - Every task must have run_id and lock_key
> - All progress must be logged into CSV files
>
> PHASE FLOW:
> 1) SPEC_AUDIT
> 2) ENV_AUDIT
> 3) INSTALL_PLAN
> 4) SAFE_INSTALL
> 5) VALIDATE
> 6) FIX_RETRY
> 7) REPORT
> 8) UPDATE_QUEUE
>
> REQUIRED OUTPUTS:
> A) Machine spec report (CPU, RAM, disk free, GPU, OS, Python, Node, Docker availability)
> B) Risk classification (low/medium/high) for local AI workload
> C) Recommended local model profile (light/medium) to avoid freezing
> D) Installation plan in steps with checkpoints
> E) CSV queue files and task tickets with statuses
> F) Retry/fix log for failed steps
> G) Final summary and next actions
>
> BEGIN NOW with PHASE 1: SPEC_AUDIT.
> Do not install anything yet.

### Prompt 2 — ENV_AUDIT
> Audit Python, Node, Git, Docker, WSL, PATH, available disk, and local runtime dependencies.
> Report actual command output and note missing tools.

### Prompt 3 — INSTALL_PLAN
> Create a light-to-medium installation plan and include stop conditions when risk is too high.

### Prompt 4 — SAFE_INSTALL
> Install one component at a time and verify system health after each step.

### Prompt 5 — VALIDATE
> Test each installed tool and report pass/fail.

### Prompt 6 — FIX_RETRY
> If a step fails, fix the smallest issue possible and retry with a limit.

### Prompt 7 — REPORT_AND_QUEUE
> Summarize results, update CSV queue status, and create the next ticket.

## 8) Immediate command for Antigravity

> Run Studio365 Local Bootstrap using SPEC_AUDIT -> ENV_AUDIT -> INSTALL_PLAN only.
> Create and maintain CSV queue files.
> No installation until audit is approved.

## 9) Immediate next step

- Keep the current plan strictly local-first and lightweight.
- Start with SPEC_AUDIT results and ENV_AUDIT only.
- Do not install Docker-based or large model runtimes until the machine is checked again.

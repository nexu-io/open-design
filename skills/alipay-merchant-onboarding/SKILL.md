---
name: alipay-merchant-onboarding
description: |
  Alipay merchant onboarding and launch-readiness workflow for developers who need
  to become a merchant, choose the right product, prepare materials, and understand
  the signing and application-publish sequence before going live.
  Use when the brief mentions "merchant onboarding", "商家入驻", "签约", "创建应用",
  "应用发布", "支付宝商户开通", or production merchant setup.
triggers:
  - "merchant onboarding"
  - "商家入驻"
  - "签约"
  - "创建应用"
  - "应用发布"
  - "支付宝商户开通"
od:
  mode: prototype
  platform: desktop
  scenario: engineering
  preview:
    type: markdown
  design_system:
    requires: false
  example_prompt: "梳理支付宝商家入驻流程，帮我判断该选电脑网站支付还是智能收，需要准备哪些资料，应用创建和上线前还有哪些检查项。"
---

# Alipay Merchant Onboarding Skill

Use this skill to guide a developer through Alipay merchant onboarding, product selection, materials preparation, signing flow, and application launch readiness.

This skill is intentionally guidance-first inside open-design. It does **not** assume the current environment can execute every external CLI, MCP call, or POSIX-only helper from the original workflow.

## Scope

Supported outcomes:
- determine whether the user should pursue 电脑网站支付 or 智能收
- explain the onboarding sequence and checkpoints
- prepare the materials the user needs before signing or app creation
- map the user to the right next step for application creation / key setup / launch readiness
- explain common failure points and what information is missing

Out of scope for this open-design version:
- running POSIX-only shared-memory scripts
- assuming `/tmp`, `fcntl`, `/workspace/projects/...`, or bash-only entrypoints exist
- promising that external `alipay-cli` / MCP operations are available in the current runtime
- exposing or generating private keys

## Before doing anything

1. Start with TodoWrite.
2. Read these references before suggesting a path:
   - `references/products.md`
   - `references/flow.md`
   - `references/authorization.md`
   - `references/faq.md`
3. If the user is blocked by a specific failure, also read:
   - `references/error-handling.md`
   - `references/cli-commands.md`
   - `references/mcp-methods.md`
4. Treat `references/subskills.md` as background documentation only. In this open-design version, nested subskills are not discoverable catalog entries and should not be presented as separately selectable skills.

## Core rules

- Never generate or request a private key from the user.
- If public-key setup is discussed, direct the user to the official Alipay key-generation guidance and make clear that the user generates and retains the private key.
- Do not invent merchant credentials, application IDs, service IDs, or signing state.
- Do not claim that a signing step, app-publish step, or service-market step has succeeded unless the user has provided concrete evidence.
- If the workflow depends on external tools not available in the environment, switch to a checklist / handoff mode instead of pretending to execute it.

## Workflow

### 1. Identify the product track

Use `references/products.md`.

There are two main tracks documented here:
- 电脑网站支付: for desktop web checkout
- 智能收: for AI-agent / API / machine-payment scenarios

Choose the track from the user's business model, product surface, and payment behavior. If the brief is ambiguous, ask one short clarifying question.

### 2. Explain the onboarding sequence

Use `references/flow.md` to describe the high-level path:
- planning and product selection
- authorization / account readiness
- signing state check
- materials collection
- application creation / publish
- post-signing or post-app handoff into payment integration

In open-design, present this as a human-readable sequence with decision points, not as a promise that every step will be automated locally.

### 3. Gather readiness inputs

Before telling the user to proceed, confirm what is already available:
- chosen product track
- developer / merchant identity status
- whether they already have an Alipay account suitable for onboarding
- whether they need app creation or already have an app ID
- whether they are preparing for sandbox-only work or production launch
- whether they have the screenshots / service metadata / business description required by their product track

### 4. Materials preparation

Guide the user to prepare only the materials relevant to the selected track.

For 电脑网站支付, focus on:
- website context
- required screenshots or site materials
- app / website identity consistency

For 智能收, focus on:
- service description
- resource URL
- pricing model
- request / interface example
- service-market style metadata

If something is missing, output a concrete checklist instead of continuing with imaginary values.

### 5. Signing and application guidance

Use `references/mcp-methods.md`, `references/authorization.md`, and `references/cli-commands.md` as reference material.

Inside open-design, describe:
- what the signing phase is trying to achieve
- what information will be needed for application creation and public-key confirmation
- what the user must do manually if the external toolchain is unavailable

Do not expose internal facade naming or imply that nested automation is a first-class catalog capability here.

### 6. Launch-readiness handoff

Once the user has a clear onboarding path, summarize:
- selected product track
- missing prerequisites
- next merchant-side action
- next engineering-side action

If the user already completed merchant onboarding and now needs code integration, explicitly hand off to the `alipay-payment-integration` skill workflow.

## Troubleshooting mode

When the user is stuck mid-onboarding:

1. Identify the phase:
   - authorization
   - signing
   - app creation
   - key confirmation
   - audit / publish
   - service registration
2. Read the matching references.
3. Ask for the missing factual input: exact step, exact error, exact command, or exact status.
4. Explain the likely cause and the minimum next action.

Prefer concrete checkpoints over generic reassurance.

## Response style for this skill

- Be explicit about what is guidance vs what has actually been executed.
- Keep user-facing steps concrete and sequential.
- Reuse the terminology from the references, but translate internal orchestration into a simple checklist the user can act on.
- When external tooling is unavailable, output a clean manual handoff instead of simulating success.

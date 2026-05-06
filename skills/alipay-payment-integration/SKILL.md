---
name: alipay-payment-integration
description: |
  Alipay payment integration workflow for H5/WAP and PC website checkout.
  Use when the brief mentions "Alipay", "支付宝", "H5 payment", "WAP payment",
  "page pay", "网页支付", "PC 支付", refunds, async notify verification,
  or payment integration troubleshooting.
triggers:
  - "alipay"
  - "支付宝"
  - "h5 payment"
  - "wap payment"
  - "page pay"
  - "网页支付"
  - "pc 支付"
  - "退款"
  - "异步通知"
od:
  mode: prototype
  platform: desktop
  scenario: engineering
  preview:
    type: markdown
  design_system:
    requires: false
  example_prompt: "在现有 Node.js 服务端项目里接入支付宝手机网站支付，补齐沙箱配置、下单接口、异步通知验签和交易查询兜底。"
---

# Alipay Payment Integration Skill

Use this skill to integrate or troubleshoot Alipay website payments inside an existing codebase.

## Scope

Supported products:
- 手机网站支付 / WAP payment (`alipay.trade.wap.pay`)
- 电脑网站支付 / PC page payment (`alipay.trade.page.pay`)

Not covered by this skill:
- App pay
- JSAPI / mini-program pay
- face-to-face pay
- QR order-code flows
- pre-authorization
- recurring / merchant-initiated deduction

When the user's request falls outside the supported set, say so plainly and point them to the official open platform docs instead of inventing an unsupported flow.

## Before editing code

1. Start with a TodoWrite plan.
2. Determine which product is needed by reading `references/product-decision.md`.
3. Inspect the user's codebase to find the server-side payment boundary, callback routing, and config conventions.
4. Read these references before proposing implementation details:
   - `references/alipay-sdk-reminder.md`
   - `references/sandbox-setup-guide.md`
   - `references/sdk-config-examples.md`
5. Read `references/general-interface-guide.md` when refunds, trade query, revoke, bill download, or async notifications are in scope.
6. If the user is debugging an existing integration, confirm the product first and then identify the failing API or error code before suggesting changes.

## Non-negotiable rules

- Keep private keys on the server only. Never place them in client code, browser bundles, logs, screenshots, or public repos.
- For Node.js and Python sandbox integrations, use the returned `appPrivatePkcsKey` and RSA2.
- Centralize Alipay SDK initialization in one dedicated server-side config module. Prefer `alipay-sdk-config.ts` for Node.js or `alipay_sdk_config.py` for Python, unless the project already has an equivalent server-only config pattern.
- Use the sandbox gateway only for development. Add a build or deploy guard based on `references/scripts/sandbox-check.sh` so sandbox config cannot ship to production by accident.
- Treat the front-channel return page as non-authoritative. Final payment success must come from verified async notify handling or a trade query fallback.
- Async notifications must be verified, business fields must be checked, and the handler must be idempotent.
- Do not invent sandbox credentials, merchant IDs, keys, or API responses. If required values are missing, stop and tell the user exactly what must be provided.

## Integration workflow

### 1. Product decision

Use `references/product-decision.md` to map the request to one supported product.

- Choose WAP payment for mobile-browser H5 checkout.
- Choose PC page payment for desktop-browser checkout.
- If the brief is ambiguous, ask one short clarifying question before editing.

### 2. Sandbox and credential setup

Use `references/sandbox-setup-guide.md`.

- Prefer sandbox setup first unless the user explicitly says they already have production merchant credentials.
- Confirm the integration will use:
  - `appId`
  - `appPrivatePkcsKey`
  - `alipayPublicKey`
  - the correct gateway URL
- Do not continue with placeholder secrets hidden inside "working" code.

### 3. SDK configuration

Use `references/alipay-sdk-reminder.md` and `references/sdk-config-examples.md`.

For Node.js:
- Prefer `import AlipaySdk from 'alipay-sdk/alipay'`
- Use `pageExecute()` for page-redirect payment APIs

For Python:
- Use the official `AliPay` client setup shown in the reference

The config module should own:
- app ID
- private key
- Alipay public key
- gateway
- sign type
- notify / return URL plumbing where appropriate
- a reusable SDK client instance

### 4. Payment entrypoint implementation

Implement the smallest correct server-side flow for the chosen product:

- Create or update the order creation endpoint
- Build the request with stable order identifiers and validated amount / subject fields
- Generate the redirect/form response through the SDK
- Keep signing and payment request generation on the server

When touching the frontend, it should only initiate the checkout flow and consume the server response. It must not own private-key material or fabricate authoritative payment state.

### 5. Notify, query, and state confirmation

Use `references/general-interface-guide.md` and `references/checklist.md`.

Always cover:
- async notify verification
- validation of `out_trade_no`, `total_amount`, `app_id`, and other critical business fields
- success handling only for the expected trade-success states
- idempotent updates
- trade query fallback for uncertain states or missing notifications

### 6. Optional operational APIs

When the user asks for post-payment operations, use the reference index to add only what is needed:
- trade query
- refund
- refund query
- revoke
- bill download URL query

Use the language-matching examples under `references/code-examples/` and do not mix Node.js and Python snippets in the same implementation.

### 7. Production readiness

Before calling the work done, explicitly review:
- sandbox gateway removed from production paths
- production keys stored securely
- notify URL externally reachable and non-redirecting
- no sensitive values in logs
- refund and retry behavior is idempotent
- the verification checklist in `references/checklist.md`

## Troubleshooting workflow

When the user reports a broken integration:

1. Confirm which supported product is being used.
2. Confirm the failing API or the exact error code.
3. Read the relevant official Alipay docs and the matching reference files.
4. Check first for:
   - wrong SDK import path
   - wrong private-key format
   - sandbox vs production gateway mismatch
   - bad timestamp formatting
   - notify verification mistakes
   - relying on return-page success instead of notify or query
5. Suggest the minimum code or config change needed to fix the verified cause.

## Response style for this skill

- Be concrete about files, routes, config modules, and server boundaries.
- Reuse the project's existing framework and naming patterns where possible.
- Keep payment changes narrow; do not refactor unrelated parts of the app.
- Mention security constraints directly when they affect the implementation.
- When uncertain, prefer the official Alipay reference behavior over guesswork.

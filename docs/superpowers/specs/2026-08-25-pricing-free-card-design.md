# Pricing Free Card Design

## Goal

Replace the discontinued Go offer at the far left of the public Personal Pricing grid with the permanent Free plan shown in the approved reference image.

## Scope

- Keep the four-column order `Free / Plus / Pro / Max` and preserve every Plus, Pro, Max, Team, billing, and campaign value.
- Render the Free card at `$0 / month` with the localized permanent-free subline.
- Use the supplied `Group 2147224558.svg` artwork as the Free wordmark, copied into `apps/landing-page/public/pricing/plan-free.svg`.
- Use existing localized Free copy. For Chinese this is: `配置自己的 Agent 或 BYOK，免费使用`, `1 个任务并发`, `BYOK 自带密钥，支持本地 Coding Agent`, and `社区支持`.
- The Free card is content-only: it has no billing discount badge, no paid checkout target, and no paid hosted-model modules.
- An authenticated Free user sees the localized `当前套餐` disabled state. An authenticated paid user cannot buy or schedule a downgrade to Free. A signed-out visitor may use the existing Free CTA to open the Cloud dashboard.
- Remove Go from public Pricing structured data and checkout CTAs while retaining support for existing Go subscribers in account-state resolution.
- Preserve Pricing analytics, identifying the first card as `free` rather than `go`.

## Validation

- A focused contract test fails before implementation because the first card is Go and passes after it is Free.
- Current-plan tests cover the authenticated Free CTA state.
- Landing-page tests, typecheck, and static build pass.
- Browser verification confirms the first card uses the supplied wordmark, displays `$0`, and does not change the other three cards.

## Baseline Constraint

GitHub authentication is unavailable in the current terminal. The isolated branch is based on the newest locally available `origin/main`, commit `57de7436076ea348611fb083a8bacaa6f0ef8b2f` from 2026-08-21. Rebase against remote `main` is required once authentication is restored.

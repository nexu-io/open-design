---
name: "qiaomu-settings"
en_name: "Settings Center"
zh_name: "设置中心"
description: "Dark app settings center with sidebar sections, forms, tabs, and a type-to-confirm danger zone."
zh_description: "深色应用设置中心：侧栏分区、表单、标签页、输入确认的危险操作区。"
triggers:
  - "settings page"
  - "account settings"
  - "preferences"
  - "danger zone"
  - "profile form"
  - "设置页"
  - "账号设置"
  - "偏好设置"
  - "危险操作"
  - "个人资料表单"
od:
  mode: "prototype"
  task_type: "prototype"
  surface: "web"
  platform: "desktop"
  scenario: "product"
  category: "settings"
  preview:
    type: "html"
    entry: "example.html"
  design_system:
    requires: false
  example_prompt: "Create a settings center for a SaaS app: sidebar sections, profile form, and a danger zone where deleting the workspace requires typing its name."
---
# Settings Center

A dark, workmanlike app settings surface: top bar, section sidebar, profile forms, tabs, toggles, and a danger zone where destructive actions are gated behind a type-the-name confirmation modal, with toast feedback. This is a functional page — discipline over flair (low visual variance, complete states).

## When to use

- App/account/workspace settings and preferences pages
- Admin consoles that need a destructive-action pattern done right
- Component-heavy app UI: forms, tabs, toggles, modals, toasts in one coherent system

## Style rules

- Palette: blue-tinted dark surfaces stacked by elevation `#0F1117` → `#161B25` → `#1E2434` → `#252B3B`; borders `rgba(255,255,255,.08)` (active `.18`). One accent `#4A9EFF` with 10%-alpha tint background. Functional set: success `#34C472`, error `#FF5A5A`, warning `#F5A623`, danger buttons `#E53E3E`; each pairs with a `rgba(color,.1)` tint.
- Text: `rgba(255,255,255,.92)` / `.55` / `.25` disabled. UI sans (IBM Plex Sans) + mono (IBM Plex Mono) for IDs, keys, and the confirm phrase; Chinese on the system stack.
- Sidebar: 220px, grouped sections, active item = accent tint + accent text; current location always visible.
- Forms: label above field, 13-14px inputs on surface-2 with border focus ring in accent; helper text in text-secondary; every field has hover/focus/disabled/error states.
- Danger zone is physically separated: own card at page bottom, red-tinted border/heading, each destructive row = plain description + outlined red button. Destructive actions NEVER execute immediately — modal requires typing the exact resource name (shown in mono) to enable the red confirm button.
- Modal: overlay `rgba(0,0,0,.6)`, panel on surface-2, enter at `scale(0.95) + opacity 0` → 1, 200ms `cubic-bezier(0.23, 1, 0.32, 1)`; Esc and outside-click close it.
- Toasts: bottom corner, auto-dismiss, colored left edge by semantics; confirm success AND report failure with the next step.
- Toggles/tabs animate ≤ 200ms, `transform`/`opacity` only; keyboard-triggered high-frequency actions get no animation; respect `prefers-reduced-motion`.

## Anti-patterns

- One-click irreversible deletes, or a confirm button that's enabled before the typed name matches
- Marketing gradients, glass cards, or hero typography inside a settings page
- Mixing radii or border alphas between panels; inventing a second accent
- Save buttons with no loading/success feedback; silent failures
- Hiding the danger zone inside a tab where users can't find (or can accidentally hit) it

## Template fidelity (hard constraint)

The bundled `example.html` in this folder is the ground truth for this
template, not loose inspiration. Before generating, read `example.html`
and reproduce its visual system:

1. Reuse its layout skeleton, section order, spacing rhythm, typography
   stack, color tokens, and signature components as-is.
2. Swap only CONTENT for the user's brief: copy, data, imagery subjects,
   brand name. Structure, hierarchy, and visual language stay.
3. Keep the same fonts (or the closest available), the same accent-color
   discipline, and the same interaction details (hover states, motion).
4. Output copy follows the language of the user's brief, but the result
   must remain recognizably this template when placed side-by-side with
   `example.html`.
5. If the brief conflicts with the template, make the smallest deviation
   that satisfies the brief. Never redesign from scratch.

Adapted from https://github.com/joeseesun/qiaomu-design (MIT)

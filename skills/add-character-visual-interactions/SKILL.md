---
name: add-character-visual-interactions
en_name: "Character Visual Interactions"
zh_name: "角色视觉交互"
description: |
  Add isolated mouse-responsive, gaze-following, blinking, hovering, and localized
  2D/3D character motion to an existing web page without changing APIs, routing,
  authentication, forms, analytics, or other business behavior. Use when a supplied
  character asset should react to a pointer or another page-local target.
en_description: "Add safe, page-local 2D or 3D character interactions to an existing web page without changing business behavior."
zh_description: "在不改变业务行为的前提下，为现有网页添加页面内隔离的 2D 或 3D 角色交互。"
triggers:
  - "add character interaction"
  - "character visual interaction"
  - "mouse-following character"
  - "gaze-following eyes"
  - "2d character animation"
  - "3d character interaction"
  - "角色跟随鼠标"
  - "角色视线跟随"
  - "角色交互动效"
license: Apache-2.0
od:
  mode: prototype
  surface: web
  scenario: design
  category: animation-motion
  preview:
    type: markdown
  design_system:
    requires: false
  craft:
    requires:
      - animation-discipline
      - accessibility-baseline
  example_prompt: |
    Add gaze-following eyes, randomized blinking, and subtle head tracking to the
    supplied character on the existing login page. Preserve authentication,
    validation, routing, keyboard behavior, and form submission exactly as they are.
  example_prompt_i18n:
    zh-CN: |
      为现有登录页中的角色添加视线跟随、随机眨眼和轻微头部转动，保持认证、
      校验、路由、键盘操作和表单提交行为完全不变。
  capabilities_required:
    - file_write
---

# Add Character Visual Interactions

## Purpose

Add character-driven visual motion to an existing page without changing what the page does. Adapt to the detected frontend stack and choose layered 2D or GLB/GLTF/FBX 3D from project-owned or user-supplied assets. Treat framework entries as lifecycle guidance, not blanket compatibility guarantees; verify the actual target project before claiming support.

## Non-Negotiable Boundaries

- Work only on an existing page named by the user, such as a home or login page.
- Do not create a new page from scratch.
- Do not change APIs, authentication, routing, stores, permissions, validation, submissions, analytics, or other business behavior.
- Preserve existing functional elements and event bindings. Visual layout changes are allowed only when behavior remains intact.
- Mount the interaction only on the requested page and clean it up when that page unmounts.
- Use only assets already in the project or supplied by the user. Do not download or redistribute character models, images, fonts, or textures without confirmed licensing.
- If the requested effect cannot be isolated from business logic, stop and explain the conflict before editing.

## Workflow

1. Inspect the target page, package manifest, framework conventions, assets, dependencies, tests, and uncommitted changes.
2. Record the functional surface that must remain unchanged and define desktop and mobile visual acceptance criteria.
3. Choose the smallest viable route:
   - Use layered 2D for images, transparent parts, or an image that can be safely cropped into independent visual regions.
   - Use 3D only when GLB/GLTF/FBX assets are supplied or explicitly requested.
4. Isolate target tracking, motion math, and rendering. Keep motion calculations pure and testable.
5. Implement with existing component, styling, test, and lifecycle patterns. Reuse installed dependencies; add no animation library when CSS and platform APIs are enough.
6. Read the validation checklist, then verify original page behavior, focused motion tests, production build, live browser layout, cleanup, and console output.

## Route References

- Read references/motion-core.md for shared tracking and motion rules.
- Read references/2d-layered.md when using layered raster or vector artwork.
- Read references/3d-models.md when using GLB/GLTF/FBX models.
- Read references/framework-adapters.md for framework lifecycle patterns and compatibility reporting.
- Always read references/checklist.md before claiming completion.

## Implementation Rules

- Keep the system pointer visible unless the user explicitly asks to replace it.
- Normalize target coordinates, clamp rotation, damp movement, and avoid cumulative rotation.
- Drive local parts independently. Do not shake an entire image or model to imitate eye, head, or wing movement.
- Respect prefers-reduced-motion and provide a responsive fallback where the effect would obstruct the page.
- Keep decorative surfaces out of the interaction path with pointer-events and stacking rules unless direct character interaction was explicitly requested.
- Prefer deletion and reuse over new abstractions. A page-local component plus pure motion functions is usually enough.

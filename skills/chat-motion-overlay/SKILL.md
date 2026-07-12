---
name: chat-motion-overlay
description: Generate configurable chat motion overlays from a transcript or screenshot, including plain bubble scenes, app-style chat containers, optional device frames, preset or uploaded avatars, nickname display rules, and transparent-video-ready Remotion bundles. Use when Codex needs to create reusable short-form chat clips for Douyin, demo videos, story reenactments, social-message proof scenes, or embeddable alpha overlays for Hyperframe and Remotion workflows.
triggers:
  - "chat motion overlay"
  - "animated chat"
  - "chat bubbles"
  - "message overlay"
  - "transparent chat video"
  - "微信聊天动效"
  - "聊天气泡动效"
  - "透明聊天视频"
od:
  mode: utility
  category: animation-motion
  design_system:
    requires: false
---

# Chat Motion Overlay

Turn chat content into a configurable motion overlay clip instead of a single hard-coded WeChat mock.

## Workflow

1. Normalize the chat input.
   - If the user gives a screenshot, extract the visible messages into the transcript format in `references/input-format.md`.
   - If the user gives plain text, keep one message per beat and preserve exact wording when authenticity matters.
   - For screenshots, use visible avatars as clues for participant count and message grouping, but do not crop or recreate avatar images by default. Infer participants and sides, then render with preset avatars unless the user provides avatar files or explicitly requests screenshot-derived avatars.

2. Choose a scene config.
   - Read `references/config-schema.md`.
   - Decide container style, avatar mode, device frame, nickname mode, and delivery format before generating the bundle.
   - When the user has not provided enough information, follow the question policy in `references/question-strategy.md`.

3. Build the scene spec.
   - Run `scripts/build_chat_overlay_spec.py` with a transcript and optional config JSON.
   - The script outputs a single JSON spec that Remotion can render directly.

4. Prepare a renderable bundle.
   - Run `scripts/prepare_chat_overlay_bundle.py`.
   - It copies the Remotion template, injects `src/chatSpec.ts`, and copies any uploaded avatar files into `public/`.

5. Render the target output.
   - Use the exact export commands in `references/output-modes.md`.
   - Prefer `MOV（透明背景，可直接导入剪映 / PR / FCP 叠加）` for editing, `WebM（透明背景，适合网页 / 浏览器播放）` for browsers, and editable engineering outputs when the user wants to keep composing downstream.

## Supported Dimensions

- `container`: `none`, `wechat`, `telegram`, `messenger`
- `avatarMode`: `preset`, `upload`, `mixed`
- `deviceFrame`: `none`, `iphone-dynamic-island`
- `nicknameMode`: `hidden`, `first-message-only`, `always`
- `deliveryFormat`:
  - `mov`: `MOV（透明背景，可直接导入剪映 / PR / FCP 叠加）`
  - `webm`: `WebM（透明背景，适合网页 / 浏览器播放）`
  - `remotion`: `Remotion 工程（适合继续编辑和拼装）`
  - `hyperframe`: `Hyperframe 工程（适合作为模块继续复用）`
  - `json`: `JSON 数据（适合程序处理 / 自定义渲染）`
  - `preview`: `预览图 / 预览工程（适合先确认效果）`

## Output Rules

- Keep the composition root transparent for overlay outputs.
- Use `container: none` for standalone bubble motion without an app shell.
- Use `container: wechat|telegram|messenger` when the platform chrome is part of the story.
- Treat uploaded avatars as content assets and copy them into `public/` for the render bundle.
- Prefer preset avatars when the user does not specify avatar files. Screenshot avatars may help identify participants, but recommend user-provided avatar files before attempting to crop or recreate avatars from screenshots.
- Keep config-driven behavior explicit; do not silently switch style families.

## Question Policy

- Prefer inference first, questions second.
- If the user gives enough information for a sensible default, continue and clearly state the assumptions.
- Ask only for missing high-impact choices.
- Keep the question set to 1-3 items.
- Prefer user-facing wording over technical wording.
- Ask about `deliveryFormat` using `格式（场景描述）` labels, not internal render terms.
- If the user says they do not care, continue with defaults and note them in the result.

## Resources

- Transcript format: `references/input-format.md`
- Config fields and examples: `references/config-schema.md`
- Question strategy: `references/question-strategy.md`
- Output commands and targets: `references/output-modes.md`
- Transcript/config to spec: `scripts/build_chat_overlay_spec.py`
- Remotion bundle preparation: `scripts/prepare_chat_overlay_bundle.py`
- Remotion render template: `assets/remotion-template/`

# Input Format

Use this transcript format before generating the scene spec.

## Minimal Form

```text
title: 闺蜜群（6）
time: 星期二 22:19

闺蜜|今天没运动
闺蜜|能不能让你老公在那个链接里
闺蜜|加一个拉粑粑记录|highlight
老婆|好
老婆|他说怎么会有这么奇怪的需求
老婆|我说他们这种不便秘的人不了解我们
```

## Full Form

```text
title: 飞书项目群
time: 今天 14:32
start: 18
gap: 20
hold: 36

我|right|male-bear-mint|帮我做一个胰岛素抵抗管理工具
Hermes|left|male-penguin-blue|收到，我先生成首页结构
Hermes|left|male-penguin-blue|再补食物、运动和体重趋势
我|right|male-bear-mint|行，先给我能看的版本
```

## Message Rules

- Metadata lines support `title`, `time`, `start`, `gap`, `hold`.
- Message lines support:
  - `name|text`
  - `name|text|highlight`
  - `name|side|text`
  - `name|side|avatar|text`
  - `name|side|avatar|text|highlight`
- Valid sides: `left`, `right`, `左`, `右`.
- Valid flag: `highlight`.
- If side is missing, the first speaker defaults to left and the second to right.
- If avatar is missing, the spec builder auto-assigns one per participant.
- The same speaker must stay on the same side throughout the transcript. If a transcript or screenshot implies conflicting sides for one speaker, stop and ask the user to confirm.
- Avatar selection is participant-first: use the participant config when provided, otherwise use the transcript avatar hint, otherwise auto-assign a preset.
- For screenshots, use visible avatars as clues for participant count and message grouping, but default to preset render avatars. Do not crop or recreate screenshot avatar images unless the user explicitly asks for screenshot-derived avatars.

## Screenshot Workflow

When the user gives a screenshot:

1. Read the messages in display order.
2. Infer side from bubble placement.
3. Infer participants from repeated nicknames, repeated avatar visuals, bubble grouping, and side placement.
4. Keep the same participant on the same side; ask for confirmation if the screenshot suggests otherwise.
5. Record title and timestamp if visible.
6. Keep uncertain OCR fragments explicit instead of inventing cleaner text.
7. Convert the result into the transcript format above before running the script.

## Screenshot Avatar Policy

- Default: use preset avatars for all inferred participants.
- Use screenshot avatars as visual evidence for participant count and message grouping, especially in group chats.
- If the user wants exact rendered avatars, first ask them to provide avatar image files or cropped avatar assets.
- Only attempt to crop or recreate avatars from the screenshot when the user explicitly requests it and accepts that recognition may be imperfect.
- Participant identity should come from nickname, repeated avatar visuals, message grouping, and side consistency together; do not rely on avatar visuals alone when ambiguous.

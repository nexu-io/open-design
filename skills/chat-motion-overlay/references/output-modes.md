# Output Modes

Use user-facing delivery choices and let the skill map them to concrete artifacts.

## MOV（透明背景，可直接导入剪映 / PR / FCP 叠加）

Use this when the clip should be layered in editors such as Premiere, Final Cut, Jianying, or CapCut.

```bash
npx remotion render src/index.ts ChatMotionOverlay out/chat-motion-overlay.mov --image-format=png --pixel-format=yuva444p10le --codec=prores --prores-profile=4444
```

## WebM（透明背景，适合网页 / 浏览器播放）

Use this when the clip should play in browser or web composition contexts.

```bash
npx remotion render src/index.ts ChatMotionOverlay out/chat-motion-overlay.webm --image-format=png --pixel-format=yuva420p --codec=vp9
```

## JSON 数据（适合程序处理 / 自定义渲染）

Use this when another system should consume the scene structure directly.

- Run `scripts/build_chat_overlay_spec.py`
- Keep the resulting JSON as the transport artifact

## Remotion 工程 / Hyperframe 工程（适合继续编辑和拼装）

Use this when the user wants to keep composing downstream rather than receiving a final video.

- Run `scripts/prepare_chat_overlay_bundle.py`
- Deliver the generated bundle directory

## Visual Rules

- `container: none` should keep only bubbles and avatars on a transparent root.
- `container: none` only supports `deviceFrame: none`; do not pair bubble-only overlays with `iphone-dynamic-island`.
- App containers should keep their own screen background but never add a global background outside the content region.
- `deviceFrame: iphone-dynamic-island` adds phone hardware while preserving transparent outer space.

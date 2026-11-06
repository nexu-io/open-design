# Question Strategy

Use this policy when the user triggers `$chat-motion-overlay` without enough detail.

## Principle

Ask only for decisions that materially change the result. Infer the rest.

## Default Behavior

- Infer `container=wechat` when the user says "微信聊天" or gives a WeChat-like screenshot.
- Infer `avatarMode=preset` when no avatar preference is given.
- For screenshot inputs, use visible avatars to help count and group participants, but use preset render avatars unless the user asks for custom or screenshot-derived avatars.
- Infer `deviceFrame=iphone-dynamic-island` only when the user explicitly asks for a phone frame or the prior context strongly implies phone mockup output.
- Infer `nicknameMode=hidden` for one-to-one chat clips unless the user asks to preserve identity or the content is clearly a group chat proof scene.
- Infer `deliveryFormat=mov` when the user says they want to use the result in editing software or says "透明视频片段".

## When To Ask

Ask when any of these are missing and would significantly change the output:

1. Container style
2. Avatar source
3. Device frame presence
4. Delivery format
5. Nickname display mode

## Preferred User-Facing Questions

### Delivery format

Ask:

- `MOV（透明背景，可直接导入剪映 / PR / FCP 叠加）`
- `WebM（透明背景，适合网页 / 浏览器播放）`
- `Remotion 工程（适合继续编辑和拼装）`
- `Hyperframe 工程（适合作为模块继续复用）`
- `JSON 数据（适合程序处理 / 自定义渲染）`
- `预览图 / 预览工程（适合先确认效果）`

Do not ask with internal terms such as `mov-alpha`, `json-spec`, or `hyperframe-ready`.

### Container style

Ask:

- `纯对话气泡`
- `微信`
- `Telegram`
- `Messenger`

### Avatar source

Ask:

- `预设头像`
- `上传头像`
- `部分角色上传头像`

For screenshot inputs, phrase the default clearly:

- `默认用预设头像（更稳定）`
- `我提供头像图片`
- `尝试从截图裁头像（可能不准）`

### Device frame

Ask:

- `不加手机边框`
- `iPhone 灵动岛边框`

### Nickname mode

Ask:

- `不显示昵称`
- `首次出现时显示昵称`
- `每条消息都显示昵称`

## Question Limits

- Ask at most 3 items in one turn.
- If more than 3 items are missing, ask for the highest-impact ones first:
  1. delivery format
  2. container style
  3. avatar source

## If The User Does Not Care

If the user responds with "随便", "默认就行", or equivalent:

- continue with defaults
- list the chosen defaults briefly in the result

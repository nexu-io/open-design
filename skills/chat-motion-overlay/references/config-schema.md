# Config Schema

Provide a JSON file when the user wants anything beyond the defaults.

## Example

```json
{
  "container": "wechat",
  "avatarMode": "mixed",
  "deviceFrame": "iphone-dynamic-island",
  "nicknameMode": "first-message-only",
  "deliveryFormat": "mov",
  "showTimestamp": true,
  "participants": {
    "Alice": {
      "side": "left",
      "preset": "female-fox-yellow"
    },
    "Bob": {
      "side": "right",
      "preset": "male-penguin-blue",
      "uploadPath": "/path/to/bob-avatar.png"
    }
  }
}
```

## Fields

- `container`
  - `none`: standalone bubbles only
  - `wechat`: WeChat-style UI shell
  - `telegram`: Telegram-like UI shell
  - `messenger`: Facebook Messenger-like UI shell

- `avatarMode`
  - `preset`: use only bundled preset avatars
  - `upload`: require uploaded avatar files for all participants
  - `mixed`: combine preset and uploaded avatars across participants

- `deviceFrame`
  - `none`
  - `iphone-dynamic-island`
  - `container: none` only supports `deviceFrame: none`; phone framing is available for app containers

- `nicknameMode`
  - `hidden`
  - `first-message-only`
  - `always`

- `deliveryFormat`
  - `mov`: `MOV（透明背景，可直接导入剪映 / PR / FCP 叠加）`
  - `webm`: `WebM（透明背景，适合网页 / 浏览器播放）`
  - `remotion`: `Remotion 工程（适合继续编辑和拼装）`
  - `hyperframe`: `Hyperframe 工程（适合作为模块继续复用）`
  - `json`: `JSON 数据（适合程序处理 / 自定义渲染）`
  - `preview`: `预览图 / 预览工程（适合先确认效果）`

- `showTimestamp`
  - boolean

- `participants`
  - Keys are speaker names from the transcript or screenshot.
  - `side`: `left` or `right`; the same participant must stay on the same side.
  - `preset`: optional bundled preset avatar key.
  - `uploadPath`: optional local avatar file path used during bundle preparation.
  - If omitted, participants are inferred from the transcript and assigned stable preset avatars.
  - In generated bundles, local `uploadPath` values are removed and only copied `uploadAsset` names are retained.

## Preset Avatar Keys

- `female-bunny-pink`
- `female-cat-orange`
- `female-fox-yellow`
- `male-bear-mint`
- `male-penguin-blue`
- `male-koala-lilac`

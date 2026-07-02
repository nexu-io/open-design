# Release "what's new" highlights

Optional per-release highlights for the post-update card the app shows on the
home surface after updating. `publish-metadata` looks for
`tools/release/whats-new/<baseVersion>.json` (e.g. `0.13.0.json`) and, when
present, forwards it verbatim as the `whatsNew` field of the published
`metadata.json`. No file means no highlights: the app falls back to generic
"Open Design has been updated" copy that links to the release notes.

Shape (`title` and `body` required, everything else optional):

```json
{
  "title": "Design system import, editor and Claude Code sync",
  "body": "New design system import, higher shared limits, more connected apps.",
  "imageUrl": "https://releases.open-design.ai/assets/whats-new/0.13.0.png",
  "linkUrl": "https://github.com/nexu-io/open-design/releases/tag/open-design-v0.13.0",
  "locales": {
    "zh-CN": {
      "title": "设计系统导入、编辑器与 Claude Code 同步",
      "body": "新增设计系统导入、更高的共享额度、更多互联应用。"
    }
  }
}
```

- `imageUrl` / `linkUrl` must be HTTPS; malformed files fail the publish.
- `locales` keys match the web app locale ids (`apps/web/src/i18n/locales/`);
  missing locales fall back to the top-level copy.
- Without `linkUrl` the card links to the GitHub release (stable) or the
  releases index (other channels).
- The card only shows when the published feed version matches the running app
  version, so highlights written for `0.13.0` never appear on `0.13.1`.
- `RELEASE_WHATS_NEW_PATH` overrides the lookup path for tests and fixtures.

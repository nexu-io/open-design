---
name: guizang-social-card
description: Guizang-style social card template for Rednote/Xiaohongshu carousels, WeChat cover pairs, quote posters, platform cards, and thumbnail-ready social visuals with bundled image backgrounds.
triggers:
  - social card
  - 小红书图文
  - Rednote card
  - WeChat cover
  - 公众号封面
  - quote poster
od:
  mode: image
  scenario: marketing
  upstream: "https://github.com/op7418/guizang-social-card-skill"
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
  example_prompt: "Use the guizang-social-card template to turn my article, launch note, screenshot, or quote into polished platform-ready social cards. Prefer Editorial Magazine x E-ink or Swiss International, use concrete images/screenshots or bundled backgrounds, and avoid abstract placeholder posters."
  example_prompt_i18n:
    zh-CN: "使用 guizang-social-card 模板，把我的文章、发布笔记、截图或金句做成高质量社媒卡片。优先使用电子杂志风或瑞士国际主义，使用真实图片/截图或内置背景资源，避免纯抽象占位海报。"
    zh-TW: "使用 guizang-social-card 範本，把我的文章、發布筆記、截圖或金句做成高品質社群卡片。優先使用電子雜誌風或瑞士國際主義，使用真實圖片/截圖或內建背景資源，避免純抽象佔位海報。"
---

# Guizang Social Card Template

Use this template for polished static social visuals:

- Rednote/Xiaohongshu 1080 x 1440 carousels.
- WeChat 21:9 + 1:1 cover pairs.
- X/Threads/LinkedIn post cards and quote posters.
- YouTube/social thumbnails that need real visual grounding.

The runnable scenario plugin is `od-social-card`; this template is the
gallery-facing visual entry and ships local background assets under
`assets/screenshot-backgrounds/`.

## Authoring Rules

1. Choose one visual system for the whole package: Editorial Magazine x E-ink
   or Swiss International.
2. Use a concrete image layer whenever the content benefits from visual
   evidence: user images, screenshots, sourced images, generated bitmaps, or
   the bundled WebP backgrounds.
3. Keep one dominant idea per frame and verify crop safety at thumbnail size.
4. For WeChat, always design the 21:9 main cover and 1:1 share card together.

## Attribution

Visual system and assets are derived from the AGPL-3.0
[`op7418/guizang-social-card-skill`](https://github.com/op7418/guizang-social-card-skill).
The upstream license is included in `LICENSE`.

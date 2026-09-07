---
name: "image-instagram-carousel-cover"
en_name: "Instagram Carousel Cover"
zh_name: "社交轮播封面"
description: "Create an Instagram or Xiaohongshu carousel cover that stops the scroll with one photographic or graphic hook, a short exact headline, and a visible series index. Use for editorial social covers, campaign first slides, and content-series openers."
zh_description: "生成 Instagram 或小红书轮播封面，一个视觉钩子加短标题加系列序号，用于社交内容系列的首图。"
triggers:
  - "instagram cover"
  - "carousel cover"
  - "xiaohongshu cover"
  - "social cover"
  - "first slide"
  - "小红书封面"
  - "轮播封面"
  - "ins 封面"
  - "社媒封面"
  - "首图"
od:
  mode: "image"
  task_type: "image"
  surface: "image"
  scenario: "marketing"
  category: "social-cover"
  preview:
    type: "image"
    poster: "example.webp"
  design_system:
    requires: false
  example_prompt: "Create a 4:5 Instagram carousel cover with one photographic hook, a short exact headline, and a visible 01 / 06 series index."
---
# Instagram Carousel Cover

Design only the first slide of a social carousel. It must earn the swipe before it explains the story.

## Inputs

- exact headline, optional subtitle, and slide index
- subject or location and the visual tension to emphasize
- platform crop, safe area, and any brand invariants
- photographic, illustrated, or type-led direction

Keep the headline short—normally three to eight words. Do not invent hashtags, engagement bait, claims, or account names.

## Art direction

1. Turn the topic into one immediately readable tension: sun/shadow, near/far, soft/hard, before/after, or order/chaos.
2. Give the image one unmistakable silhouette or diagonal that still reads at feed size.
3. Place the exact headline as a designed object integrated with the scene.
4. Keep the index visible but subordinate; use the subtitle only when it adds meaning.
5. Default to bright daylight or a high-key graphic field with saturated color blocks and hard separation.
6. Preserve believable camera, material, skin, architecture, and environmental imperfections.

Use the host image-generation capability and save one finished cover image.

## Reject generic AI styling

No motivational filler, floating glass cards, random stickers, beige lifestyle wash, generic purple-blue gradient, glossy 3D objects, excessive glow, fake app UI, unreadable decorative text, or impossible architecture.

## Quality gate

- The visual hook is understood before the subtitle is read.
- Headline, subtitle, and index are exact and correctly prioritized.
- The key subject remains inside the platform-safe crop.
- Color feels luminous and contemporary, not dim or washed out.
- The image looks like an art-directed social editorial, not a generic AI moodboard.

## Demo brief

Create a 4:5 cover using only **SUN / SHADOW**, **A COLOR STUDY**, and **01 / 06**. Photograph a cobalt wall, tangerine stairs, butter-yellow circular opening, cyan sky, and one person crossing a hard midday shadow.

# Open Design Web Clipper — Store Listing & ASO Pack

Single source of truth for the extension's store submissions. Copy fields
verbatim into the Chrome Web Store / Edge Partner Center / Firefox AMO dashboards.
All copy is keyword-tuned for discoverability (ASO) without keyword stuffing.

- **Public name:** Open Design Web Clipper
- **Version:** 0.2.0 (MV3)
- **Package:** the `clipper/` directory (no build step — zip it as-is)
- **Homepage:** https://open-design.ai
- **Source:** https://github.com/nexu-io/open-design (folder `clipper/`)
- **Support / issues:** https://github.com/nexu-io/open-design/issues
- **Assets:** see `assets/` in this folder and the "Asset manifest" section below

---

## 1. Naming & identity

| Field | Value |
| --- | --- |
| Store title | `Open Design Web Clipper` |
| Toolbar / action title | `Open Design Web Clipper` |
| Short brand | Open Design |
| Tagline | Clip the web into your design Library. |
| Accent color | Ember `#c96442` |
| Brand ink | `#202020` |

Why this name: leads with the **Open Design** brand and pairs it with the exact
category phrase users search — **"web clipper"** — so the listing ranks for both
brand and category queries without truncating in narrow store rows.

---

## 2. Chrome Web Store

### Title (max 75)
```
Open Design Web Clipper
```

### Summary / short description (max 132)
```
Clip pages, design systems, screenshots, images, and Figma import JSON into your Open Design Library — local-first, one click, no login.
```

### Detailed description (max 16,000)
```
Open Design Web Clipper saves anything you find on the web straight into your Open Design Library — the local asset registry of the open-source Open Design app. One click, no account, no pairing, no tokens.

Built for designers, researchers, and builders who collect references all day: drop a full page, a design-system capture, a screenshot, a set of images, or an editable Figma import JSON into your Library and keep working.

━━ WHAT YOU CAN CLIP ━━

• Capture page → Library
  A self-contained, high-fidelity HTML snapshot. Stylesheets are inlined, images are embedded as data URIs, and scripts are stripped — so the page stays exactly as you saw it, forever, even if the original changes or goes offline.

• Extract design system
  Programmatically extracts logo candidates, images, typography, fonts, palette, product description, headings, and a reusable component kit into a templated HTML design-system asset with light/dark modes.

• Screenshot
  Save the visible tab as an image in one click.

• Pick images
  An on-page grid of every image on the page with checkboxes — Select all / Clear, then save exactly the ones you want.

• Pick element
  A DevTools-style picker: hover to highlight any element, click to save it as a screenshot cropped to that element plus its outerHTML and metadata.

• Page → Figma JSON
  Every page capture also computes an importable Figma node-tree (frames, text, images, fills, strokes, corner radii, shadows) you can rebuild as editable layers with the companion Open Design Figma plugin. This JSON is imported from inside the plugin, not by dragging it into Figma Drafts.

• Right-click any image → "Save image to Open Design Library".

• Optional on-page toolbar
  A floating launcher at the bottom-right of any page. Hidden by default; turn it on when you want it. It's automatically pulled out of frame during a capture, so it never ends up in your snapshot.

━━ WHY IT'S DIFFERENT ━━

• Local-first & private. Everything you clip goes only to the Open Design app running on your own machine (loopback 127.0.0.1). Nothing is sent to us. No analytics, no tracking, no ads.

• Zero setup. No sign-in, no API keys, no pairing codes. The popup shows "● Connected" the moment it detects Open Design running, and you can clip right away.

• High fidelity by default. Captures embed their assets so they're complete and portable. Prefer smaller, faster clips? Turn off "Inline images" under Advanced.

• Live Library. Everything you capture appears in the Library tab instantly (via SSE) with a "Clipper" source badge and a back-link to the original page.

━━ HOW TO USE ━━

1. Install the open-source Open Design app — https://open-design.ai
2. Start it so the local daemon is running.
3. Click the Open Design Web Clipper toolbar icon and capture. That's it.

Open Design is the local-first, open-source alternative to Claude Design and a Figma alternative for the agent era. The Web Clipper is how the web gets into it.

Open source: https://github.com/nexu-io/open-design
```

### Category
- Primary: **Workflow & Planning** (closest fit for a research/collection tool)
- Alternate if rejected: **Developer Tools**

### Language
- Primary: **English (United States)**
- Add localized listing: **简体中文 (Chinese, Simplified)** — see §6

### Single purpose (required field)
```
Capture web content — full pages, design systems, screenshots, images, page elements, and Figma import JSON — and save it into the user's locally running Open Design app Library.
```

### Permission justifications (one per requested permission)
| Permission | Justification to paste |
| --- | --- |
| `host_permissions: <all_urls>` | The user can clip from any website they choose. We need to read and screenshot the active page, and fetch + inline its cross-origin resources (CSS, images) to produce a complete, self-contained snapshot. The same host access reaches the user's local Open Design daemon at 127.0.0.1. Standard for web clippers. |
| `scripting` | Inject the capture runtime and the on-page picker/toolbar into the active tab on demand, only when the user triggers a capture. |
| `tabs` | Identify and capture the active tab the user is clipping (URL + tab id for the screenshot/capture). |
| `contextMenus` | Provide the right-click "Save image to Open Design Library" menu entry. |
| `downloads` | Save the "Download Figma (.json)" import file to the user's disk when requested. |
| `storage` | Remember local preferences only: the daemon URL (if changed from the default) and the on-page bar on/off toggle. |
| Remote code | **None.** All scripts are bundled in the package; no remote/eval code is executed. |

### Data usage disclosures (Privacy practices tab)
- **Does this item collect or use user data?** It transmits captured page content **only to the user's own local Open Design app** (loopback) on explicit user action. It does **not** send any data to the developer or any third party.
- Personally identifiable information: **No**
- Health / financial / authentication / personal communications / location / web history: **No**
- User activity / website content: handled **locally only**, never transmitted off-device to us.
- **Not sold to third parties. Not used for ads. Not used for creditworthiness/lending.** Used only for the item's single purpose.
- Privacy policy URL: `https://open-design.ai/clipper/privacy` (publish `PRIVACY.md` from this folder there; or link the raw GitHub file).

### Screenshots (1280×800 PNG/JPEG, up to 5) — order + captions
1. **Popup over a real page** — `Clip the whole page into your Library — one click.`
2. **The Open Design Library filling up** — `Everything lands in your Library, live, with a Clipper badge.`
3. **Pick images / Pick element overlay** — `Pick exactly what you want — images or any element.`
4. **Page → Figma import** — `Turn any web page into an editable Figma capture.`
5. **Connected / Advanced panel** — `Local-first. No account, no pairing, no tokens.`

> Capture these from the running app at 1280×800. Two production captures already
> exist (popup over paulgraham.com; the extensions page) and can seed shots 1 & 5.
> Use the framed-screenshot template in §7 to drop raw captures onto the brand
> background.

### Promotional images
- **Small promo tile:** 440×280 — `assets/promo-small.png`
- **Marquee promo tile:** 1400×560 — `assets/promo-marquee.png`
- Store icon: 128×128 — `../icons/icon-128.png`

### Chrome ASO notes
Chrome derives search relevance from the **title + description** (no separate
keyword field). The title carries "web clipper"; the description front-loads the
high-value phrases below in natural sentences. Do not stuff.

Target phrases: `web clipper`, `save to library`, `full page capture`,
`screenshot`, `save images`, `page to figma`, `html snapshot`, `web page saver`,
`design reference`, `open design`.

---

## 3. Edge Add-ons (Microsoft Partner Center)

The **same MV3 package** publishes to Edge unchanged.

- **Name:** `Open Design Web Clipper`
- **Short description / Summary:** same as Chrome summary (≤132 recommended)
- **Description:** reuse the Chrome detailed description verbatim
- **Category:** `Productivity`
- **Store logo:** 300×300 — `assets/store-logo-300.png`
- **Screenshots:** 1280×800 (same set as Chrome)
- **Search terms (up to 7):** `web clipper`, `screenshot`, `save page`, `figma`, `save images`, `design`, `open design`
- **Privacy policy URL:** same as Chrome
- **Notes:** Edge runs the Chromium MV3 service worker; no manifest changes needed. The `browser_specific_settings.gecko` block is ignored by Edge.

---

## 4. Firefox Add-ons (AMO)

Firefox needs the gecko settings already added to `manifest.json`:
```json
"browser_specific_settings": { "gecko": { "id": "web-clipper@open-design.ai", "strict_min_version": "121.0" } }
```
And the dual background key (already in `manifest.json`) — Firefox uses
`background.scripts`, Chrome/Edge use `background.service_worker`:
```json
"background": { "service_worker": "background.js", "scripts": ["background.js"] }
```

- **Name:** `Open Design Web Clipper`
- **Summary (≤250):** `Clip web pages, design systems, screenshots, images, and Figma import JSON straight into your Open Design Library. Local-first, one click — no account, no pairing, no tokens.`
- **Description:** reuse the Chrome detailed description
- **Categories:** `Other` + `Web Development` (or `Photos, Music & Videos`)
- **Tags (up to 5):** `web-clipper`, `screenshot`, `figma`, `capture`, `design`
- **Screenshots:** any size (reuse the 1280×800 set)
- **Privacy policy:** same URL
- **Source code:** code is unminified plain JS — submit the `clipper/` folder as source if AMO asks.
- **Pre-flight:**
  ```bash
  npx web-ext lint --source-dir clipper
  npx web-ext run  --source-dir clipper -t firefox-desktop
  ```
  Expect a benign warning about the `service_worker` background key — Firefox falls back to `scripts`.

---

## 5. Privacy policy

Publish `PRIVACY.md` (in this folder) at the privacy policy URL. It states the
core promise: captured content goes only to the user's local Open Design app;
nothing is collected by, or transmitted to, the developer.

---

## 6. 简体中文 listing (zh-CN)

- **名称:** `Open Design Web Clipper`（品牌名保持英文；本地化副标题：网页剪藏）
- **简短描述 (≤132):**
```
一键将任意网页、设计系统、截图、图片或 Figma 导入 JSON 剪藏到本地的 Open Design 素材库 —— 本地优先，无需登录。
```
- **详细描述:**
```
Open Design Web Clipper 把你在网上看到的任何内容一键剪藏进 Open Design 素材库（开源 Open Design 应用的本地资源库）。无需账号、无需配对、无需令牌。

为整天收集素材的设计师、研究者和创作者而生：整页快照、设计系统、截图、批量图片，或可编辑的 Figma 导入 JSON，统统进入素材库，工作不中断。

【你能剪藏什么】
• 整页 → 素材库：高保真、自包含的 HTML 快照（内联样式与图片、剥离脚本），页面永久保真。
• 提取设计系统：程序化提取 logo、图片、字体、色板、产品描述、标题和组件套件，并生成支持明暗模式的 HTML 设计系统。
• 截图：一键保存可见区域。
• 选择图片：页面所有图片网格 + 复选框，精确保存你要的那几张。
• 选择元素：DevTools 式拾取器，悬停高亮、点击保存为裁剪截图 + outerHTML + 元数据。
• 页面 → Figma：每次整页捕获都会生成可导入的 Figma 节点树，用 Open Design Figma 插件还原为可编辑图层。
• 右键图片 →「保存到 Open Design 素材库」。
• 可选页面工具条：默认隐藏，截图时自动移出画面。

【为何不同】
• 本地优先、隐私安全：所有内容只发送到你本机运行的 Open Design 应用（127.0.0.1），我们不收集任何数据，无统计、无追踪、无广告。
• 零配置：无登录、无密钥、无配对码。检测到 Open Design 运行即显示「● 已连接」。
• 默认高保真，可在「高级」中关闭内联图片以加快速度、减小体积。
• 实时素材库：剪藏即刻出现，带「Clipper」来源标记与原页面回链。

开源：https://github.com/nexu-io/open-design
```
- **搜索词:** `网页剪藏`, `剪藏`, `截图`, `保存网页`, `figma`, `素材库`, `open design`

---

## 7. Asset manifest

| File | Size | Use |
| --- | --- | --- |
| `../icons/icon-{16,32,48,128}.png` | 16/32/48/128 | Extension + store icon |
| `assets/icon.svg` | vector | Icon source (brand mark + ember capture badge) |
| `assets/icon-512.png` | 512×512 | High-res icon master |
| `assets/store-logo-300.png` | 300×300 | Edge store logo |
| `assets/hero-bg.jpg` | 1536×1024 | AI background art (fal · gpt-image-2) for banners (JPEG to stay under the repo blob-size guard) |
| `assets/promo-marquee.png` | 1400×560 | Chrome marquee promo tile |
| `assets/promo-small.png` | 440×280 | Chrome small promo tile |
| `assets/screenshot-frame.html` | — | Template to frame raw 1280×800 captures on-brand |

---

## 8. Pre-submission checklist

- [ ] Bump `version` in `manifest.json` if re-submitting over 0.1.0.
- [ ] `manifest.json` validates as JSON; loads unpacked in Chrome with no errors.
- [ ] Icons render crisply at 16/32/48/128 (badge visible at 48+).
- [ ] 5 screenshots captured at 1280×800 from the running app.
- [ ] `promo-marquee.png` (1400×560) and `promo-small.png` (440×280) exported.
- [ ] Privacy policy published at the URL referenced above.
- [ ] Permission justifications pasted for every permission + host access.
- [ ] Data-usage form completed (no data collected by developer).
- [ ] Chrome: zip `clipper/` and upload.
- [ ] Edge: upload same zip; fill search terms.
- [ ] Firefox: `web-ext lint` clean; submit; attach source if asked.

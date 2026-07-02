# 静态构建站的 1:1 忠实复刻：全量资产镜像

> 适用：**Astro / Vite SSG / Hugo / Eleventy / 任何把客户端运行时输出成可下载静态资产的站**——哪怕它是 WebGL/Canvas/高斯泼溅重前端。
> 不适用：真·服务端渲染 / 数据驱动 SPA（业务数据在 API 后面）→ 走 `network-capture.mjs` 做 API 替身，不是这条。

## 核心认知（为什么这能做到 1:1）
这类站的"**真源码不在 GitHub**"，但**部署出来的静态资产就是真相**：HTML + 打包 bundle + CSS + 运行时 fetch 的二进制（`.sog`/`.buf`/`.wasm`/`.riv`/字体/图/视频）。把这些**原样**镜像下来、从 web 根目录服务，跑的就是**真代码 + 真资产**，不是重建——所以能逐字节 1:1，连原站的 bug/怪癖都一并还原。

这是"真源码至上"铁律在静态站上的延伸：**对静态站，"拿到真源码" = "镜像部署资产整套"**。

> ⚠️ 决策树坑：别看到 `astro:true` 就甩去"主题市场找源主题"——那只对**用现成开源主题**的站成立。**定制 Astro 站（如 Lusion oryzo.ai）没有可买的主题**，正解是本条的全量镜像。

## 为什么必须"真浏览器全程滚动捕获"，不能只 grep / wget
- `.buf`/`.sog`/`.riv` 等二进制是 **JS 运行时按滚动进度 fetch** 的，URL 常是代码里**动态拼接**的 → grep bundle 抓不全，`wget --mirror` 也发现不了（它只跟 HTML 静态链接）。
- 唯一可靠：**真浏览器加载 + 从头滚到尾**，把每一个**真实发生的网络请求**记下来，再按这份"实际请求清单"镜像。

## 一键脚本
```bash
node "$WEB_CLONE_SKILL_DIR/scripts/mirror-site.mjs" \
  --url https://<站>/ \
  --out "$WEB_CLONE_PROJECT"
```
产物：
- `<out>/site/…`：镜像的**同源**资产（保留路径；目录 URL 存 `index.html`）
- `<out>/own-asset-urls.txt`：同源资产清单
- `<out>/third-party.json`：第三方 host + **需自托管的 webfont CSS**（Typekit/Google）提示
- `<out>/mirror-manifest.json`：全部请求 + 状态

脚本用真浏览器全程滚动捕获 + 走浏览器网络栈下载（cookie/TUN/代理与页面一致）。

## 镜像后的手工收尾（让它离线 1:1 跑）
脚本只搬同源资产、不自动改写——**第三方按 `third-party.json` 人工处理**：

1. **自托管锁域名字体（最常见=Adobe Typekit）**
   Typekit kit 锁授权域名，远程 `@import` 换域名后可能不渲染 → 自托管：
   ```bash
   # ① 下 kit CSS（直连，typekit 常被代理挡 → 不要走 proxy）
   curl -sL -A "Mozilla/5.0 …Chrome…" -e "https://<站>/" "https://use.typekit.net/<kit>.css" -o site/typekit/kit.css
   # ② 从 kit.css 的 @font-face src 抠出 use.typekit.net/af/... 字体 URL，逐个下到 site/typekit/fonts/
   #    同一字体 3 个后缀: /l=woff2  /d=woff  /a=otf（以文件魔数 wOF2/wOFF/0x00010000 为准，别信文件名）
   # ③ 写本地 @font-face（相对 url + 保留 format 提示），见下
   ```
   本地 `@font-face`：
   ```css
   @font-face{ font-family:"<同名>"; src:url("./fonts/x.woff2") format("woff2"),
     url("./fonts/x.woff") format("woff"), url("./fonts/x.otf") format("opentype");
     font-display:swap; font-weight:<原范围>; }
   ```
   然后把引用处改成本地——**注意 Typekit 常是主 CSS 第一行 `@import"https://use.typekit.net/<kit>.css"`，不是 HTML `<link>`**：
   ```bash
   perl -0pi -e 's{\@import"https://use\.typekit\.net/<kit>\.css"}{\@import"/typekit/kit-local.css"}g' site/_astro/<主>.css
   ```

2. **删追踪**：cloudflare beacon / GA / 像素——精确切 `<script>`。

3. **公共 CDN（Rive wasm@unpkg / 第三方 player）**：公共 CDN 跨域可在线加载，本地服务+联网时正常 → 可留在线（离线则失效，NOTES 标注）。要彻底离线再镜像它们并改写注入点。

4. **Vimeo/YouTube 嵌入**：iframe 在线播，离线不可用 → 一般非核心首屏，NOTES 标注即可。

## 服务 + 验证
```bash
cd "$WEB_CLONE_PROJECT/site"
python3 -m http.server 8124      # 必须从 site/ 作 web 根，根相对路径(/_astro /models …)才解析
```
然后按 SKILL.md Step 5：浏览器 0 console error + `visual-diff.mjs` 像素对照原站。重 WebGL 站记得**滚动到各段截图**对照（静态全页截图抓不到滚动触发的 GL 帧）。

## worked example：oryzo.ai（Lusion，L6）
- 135 个同源资产（HTML+bundle+CSS + 25×`.buf` 几何/相机动画 + 2×`.sog` 高斯泼溅 + 排序 wasm + `.riv` + MSDF + 字体 + 80+ 图）
- 唯一改写：Typekit `@import`→本地自托管 halyard + 删 cloudflare beacon
- 结果：`scrollHeight` 精确一致、**0 console error**、hero 像素 diff **36/1.3M（5/5）**
- 留在线：Vimeo 画廊视频 + unpkg Rive wasm（非核心）
- 完整记录：`./website-clones/oryzo-clone/`（NOTES.md + TEARDOWN.md）

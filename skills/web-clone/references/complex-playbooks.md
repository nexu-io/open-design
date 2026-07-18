# 复杂站复刻 Playbooks

用于 L4-L6 站点，目标是把"看起来复杂"拆成可执行路径。

## L4 动画品牌站

1. `recon-site.mjs` 抓三档截图、sections、视频/canvas 数量。
2. 记录滚动库信号：GSAP / Lenis / ScrollTrigger / Locomotive。
3. 把页面拆成首屏、滚动叙事、视频蒙版、hover、过渡五类。
4. 优先复刻节奏和视觉语法；微交互可近似，但必须在 `CLONE_REPORT.md` 标差异。
5. 用 `visual-diff.mjs` 对首屏和关键滚动位置截图评分。

## L5 WebGL / Canvas / Three.js

1. 先找真源码、source map、公开 repo；找不到再逆向 bundle。
2. `recon-site.mjs` 记录 canvas 尺寸、数量、框架信号。
3. `sourcemap-hunt.mjs` 尝试下载 source map。
4. 拆技术支柱：渲染、shader、后期、物理、交互、音频、资源加载。
5. 复杂 shader 不盲写；先做最小可运行场景，再逐项补材质、光照、后期。
6. 交互验证必须用浏览器实际操作或截图/视频证据，不能只看代码。

## L6 SaaS / 电商 / 登录业务系统

默认只克隆展示层和可演示流程，不承诺真实账号、支付、订单、权限。

1. 登录态公开页面先确认授权和隐私边界。
2. `network-capture.mjs` 保存 XHR/fetch 响应作为 fixtures。
3. 把接口分成：内容接口、搜索筛选、用户态、交易/写入。
4. 内容接口可用本地 JSON 替身；交易/写入接口只做 mock 成功/失败状态。
5. 保留空态、加载态、错误态、权限不足态，别只做 happy path。
6. `audit-clone.mjs` 扫外链、原品牌残留和追踪脚本。

## 多页面 / CMS / 企业站

1. 先抓 sitemap、导航、页脚、主要模板。
2. 只复刻代表性模板：主页、列表页、详情页、搜索/筛选页、联系页。
3. 重复内容用数据文件生成，不逐页手写。
4. CMS 后台不克隆；如需要编辑能力，用本地 JSON/Markdown 替代。

## 成功标准

- 原站证据完整：截图、recon JSON、网络清单、素材清单。
- 克隆站可本地运行，console/page error 清零或解释清楚。
- `CLONE_REPORT.md` 有结构、视觉、交互、响应式、功能边界评分。
- `CLONE_AUDIT.md` 没有追踪脚本、原品牌残留、未解释的日文/外链风险。
- 对做不到的真实后端、专有 API、版权素材明确写边界。

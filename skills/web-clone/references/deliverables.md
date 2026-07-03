# 产物规范与模板

每个复刻子项目（`$WEB_CLONE_PROJECT/`）的标准产物。

## NOTES.md（必须）

```markdown
# <站名> · 克隆笔记

## 源信息
- 原站 URL:
- 源码仓库:（如有）
- 原作者:
- 许可证: MIT / Apache / NONE / 专有  ← 必须核实，见 SKILL.md 许可表
- 致谢要求:

## 技术栈
- 框架 / 关键库 / Node 版本:

## 复刻前预判
- 复杂度等级: L1 / L2 / L3 / L4 / L5 / L6（见 web-clone skill 的 references/assessment.md）
- 推荐模式: 忠实复刻 / 视觉复刻 / 内容爆改 / 技术拆解
- 可高保真的部分:
- 需要近似或替代的部分:
- 不克隆的部分:
- 主要风险:

## 跑起来
\`\`\`bash
cd "$WEB_CLONE_PROJECT"
# 单文件静态站: python3 -m http.server 8123
# 框架站: nvm use <ver> && npm install && npm run dev
\`\`\`

## 改了什么（对照原版）
- 删了追踪脚本: ...（GA/gtag 行号）
- ...

## 原站 vs 克隆站
| 模块 | 原站表现 | 克隆实现 | 差异 / 取舍 | 证据 |
|---|---|---|---|---|
| 首屏 |  |  |  | screenshot / file:line |
| 导航 |  |  |  |  |
| 核心动效 |  |  |  |  |
| 内容区块 |  |  |  |  |
| 移动端 |  |  |  |  |

## 复刻评分
- 源证据: /5
- 结构保真: /5
- 视觉保真: /5
- 动效/交互: /5
- 响应式: /5
- 功能完整: /5
- 内容替换: /5
- 法务/部署风险: /5
- 总评:

## 替换地图（要换什么改哪）
- 文字 → 文件 行
- 图片/媒体 → 目录
- 配色 → CSS 变量 / theme
- 3D 模型 / 字体 → ...

## 验证
- [ ] 本地跑通、console 0 error
- [ ] 截图对照原站（RECON/screenshots/）
- [ ] `route-crawl.mjs` 输出原站/克隆站路由地图（多页面站必做）
- [ ] `interaction-probe.mjs` 输出 hover/click/scroll/canvas 状态证据（交互站必做）
- [ ] `visual-diff.mjs` 输出截图差异报告（能做时）
- [ ] `audit-clone.mjs` 输出残留审计报告
- 验证不了的点（如实记，别伪造）: ...
```

## TEARDOWN.md（复杂交互站追加）

技术拆解文档，**所有结论标真源码行号**。结构：
- **0. 一句话本质**
- **A. 真实技术拆解**（按支柱：渲染/合成/物理/交互/音频，每条标行号 **+ 证据级别 `SOURCE`/`PARTIAL`/`GUESS`**，见 `effect-extraction.md`）
- **B. 二手分析校验表**（若有 AI 分析文档：`声称 | 真源码 | 准确度✅/⚠️/❌ | 说明`，重点揪实质性错误）
- **C. 可迁移方法论**（通用套路 / 本站特有 / 复刻路径）

范例：`./website-clones/marbles-clone/TEARDOWN.md`。

## RECON/（侦察产物）
- `screenshots/original-{1440,768,390}.png` 原站三档
- `screenshots/clone-1440.png` 克隆图（对照）
- `screenshots/visual-diff-1440.png` 截图差异图（能做时）
- `global-recon.json` 侦察探针输出（框架/canvas/滚动库/字体等）
- `routes/original-route-map.json` / `.md` 原站内部路由地图和逐路由截图
- `routes-clone/clone-route-map.json` / `.md` 克隆站内部路由地图和逐路由截图
- `interactions/original-interactions.json` / `.md` 原站交互状态、网络、console、截图证据
- `interactions-clone/clone-interactions.json` / `.md` 克隆站交互状态、网络、console、截图证据
- `asset-manifest.json` 原站素材清单和下载状态（能做时）
- `network/original-network.json` API/XHR 捕获清单（SPA/SaaS 必做）
- `network/fixtures/` 保存下来的 JSON/text 响应
- `sourcemaps/sourcemap-manifest.json` source map 搜索结果（复杂前端优先做）
- `visual-diff-1440.json` 像素差异指标
- `design-dna.json` 结构化设计身份（视觉复刻/内容爆改模式产出，由 `dna-scaffold.mjs` 起手，人工补全；schema 见 `design-dna.md`）
- `baseline/` WebGL/特效逆向时"最小原样可复现"产物 + 证据包（见 `effect-extraction.md` 的 baseline-first 闸门）

## CLONE_REPORT.md（需要对外汇报或评估 skill 效果时追加）

```markdown
# <站名> · 原站 vs 克隆站评估报告

## 结论
- 复杂度等级:
- 复刻模式:
- 总体还原度:
- 最适合怎么用: 本地学习 / 继续爆改 / 可部署展示 / 仅技术拆解

## 对比
| 维度 | 原站 | 克隆站 | 结论 |
|---|---|---|---|
| 信息架构 |  |  |  |
| 视觉语言 |  |  |  |
| 动效交互 |  |  |  |
| 响应式 |  |  |  |
| 内容替换 |  |  |  |
| 功能边界 |  |  |  |

## 评分
按 web-clone skill 的 `references/assessment.md` 8 项维度打分。

## 已知缺口
-

## 下一步升级建议
-
```

## CLONE_AUDIT.md（上线前追加）

由 `scripts/audit-clone.mjs` 生成。重点看：
- 追踪脚本 / 统计像素是否已删
- 原站品牌名、日文、TODO 是否残留
- 外部 URL 是否仍指向原站或第三方不可控资源
- 素材和 license 风险是否已记录

## 收尾
- 更新中枢 `./website-clones/README.md` 索引行（状态 emoji：🟡侦察/🟢跑通/🔵改造/✅上线/🔴卡住/🗂️归档）
- 原始源码留只读基准 `index-original.html`，不要在它上面改
- 跑完关掉本地服务器进程

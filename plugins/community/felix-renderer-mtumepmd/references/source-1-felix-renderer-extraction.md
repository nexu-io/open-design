# Felix renderer 模板提炼结果

本轮读取四个项目的入口、布局及渲染代码；保留源项目，未重渲旧视频。第一份可运行种子来自 `world-births-circle`，不是从空画布猜测布局。

## 已交付

- `felix-births-renderer-seed.html`：自包含圆形分区种子，内嵌原出生人口数据、国旗与现有 Zeno 图标。年份拖动、播放、点击分区、完整表格及 PNG 下载可用。
- `felix-design-system.md`：新增成品布局变体，并修正原规范把页眉统一上移的坐标。`felix-design-system-v2.md` 为修改前备份。
- `scripts/verify-felix-seed.cjs`：使用模拟 Canvas 验证状态接口、回退、署名次数与下载动作。
- `provenance/`：源代码与数据哈希、原数据来源合同、国旗 MIT 许可及原项目的地域缺口审计。

## 已确认架构

正式采用 **一套 Felix Design System＋多个 renderer 模板**。`felix-design-system.md` 是唯一视觉契约；每个 renderer 模板只覆盖一种经过成品验证的图形语法。新项目先选 renderer family，再绑定对应 layout profile，最后接入项目数据与领域规则。

## 三层结构

1. **共用视觉契约**：核心 tokens、字体、作者标识规则、画布尺寸。由 Design System 维护。
2. **图形布局 profile**：圆图、时间线、分布图、信息图序列各自保留稳定坐标。由模板引用，不能互换算法。
3. **数据与 renderer**：几何、数据语义和帧时间映射属于具体模板；接口可以统一，后端不必统一。

## 四个来源的处理

| 项目 | 读到的实际实现 | 提炼判断 |
|---|---|---|
| world-births-circle | Canvas、冻结拓扑递归面积切分、2023 首次几何校准、整数年国旗排名、40秒帧映射 | 本轮种子；保留全部几何与数据，补 readiness 与严格状态接口 |
| ai-model-release-layouts | `motion.js` 已有 `felix.ready/describe/render`、分段日历、公司轮换，`full.html` 组合完整数据与 overview | 接口模式可复用；作为下一份时间线模板，不把公司的排期逻辑塞进通用骨架 |
| china-life-expectancy-animation | SVG 标注 + Canvas 粒子、seeded random、`__renderChinaLifeFrame`、ready/config 标志 | 保留既有绘制，之后加 timeMs → frame 的薄适配；保留9:16与3:4区分 |
| english-information-access | Python 生成静帧布局；已有10页手绘融合版本，与旧视频不是同一版本 | 保留 Python 渲染路线及定量几何；未来 HTML 只负责预览，不重写图表 |

## 本轮圆图改动

- 保留标题、圆心、半径、年份、数据表与来源位置；不重算数据。
- 绑定已选冷调炭黑和字体栈，原洲别色只转换到等价 OKLch，不更换分类映射。
- 删除右上英文署名，放入主体图形右下附近留白，配真实 Zeno SVG；中文仍在原右上基线。
- 去掉依赖原 `server.py` 的写盘与1200帧上传按钮。PNG 走浏览器下载；视频导出通过确定性接口接入，未承诺已接通 OpenDesign 视频导出。
- 内嵌数据及 SVG，打开 HTML 不需要原项目服务。图标原始 viewBox 为100×100，保持正方形；国旗沿用原4:3文件与几何。
- 固定先按2023校准树，再接受任意状态，避免第一张导出的年份影响后续布局。

## 使用接口

```js
await window.captureReady;
await window.felix.render({snapshotId: "2012"});
await window.felix.render({timeMs: 12500});
const metadata = window.felix.describe();
```

`ready` 只等待资源和校准；`captureReady` 等待查询参数所选首帧。支持 `?snapshot=1950`、`?timeMs=12500`；`&export=1` 隐藏外围交互并使用1080×1920画布。状态同时含两种选择、时间非法或快照不存在会拒绝。

时间映射保留原作品：40秒、30fps；开头1.5秒停留，年份每秒推进2年，末尾2秒停留。整数年快照与相应时间调用共用绘制函数。当前种子是“出生人口圆图模板”，更换成其他指标需要替换数据合同及领域代码；不能仅替换标题。

## 原数据限制

本轮核验的是模板结构与适配，不是四个项目事实复审。原出生人口数据的藏南同口径分项缺口保持不变，未声称解决。AI 项目文档含未来事件的编辑假设，不应把该事件库直接用作事实模板。信息图中的既有生成插画也不自动成为未来真实人物、机构或产品的替代资产。

## 接入 OpenDesign

在 Integration 的 Skills 标签更新 `dataviz-felix` 时，将本文件的模板选择规则加入适配说明；将圆图 HTML 作为配套模板资源管理。核心视觉规范继续使用 `felix-design-system.md`，不要把数据、完整渲染代码或历史项目路径塞进 Design System。本轮未修改已安装 skill。

## 建议与未完成范围

架构决策已确认，当前无需再决定颜色或字体。圆图已落地；时间线、粒子分布和 Python 信息图只是完成来源判断，尚未提炼成可运行独立模板。下一步优先提炼 AI 时间线，因为它已有最完整的确定性接口。

验证记录：JS 语法通过；模拟 Canvas 下，首帧初始化、同状态不同前序调用、首尾时间映射、非法状态拒绝、署名各一次、表格填充与下载动作通过。模拟字体测量不等于浏览器字形或逐帧视觉验收；未生成新MP4。

预览检查发现初版样式提取误读了模板注释中的标签，已移除多余头部并重新核对唯一 head/style、CSS括号与核心 token。修正后未重复截图；最终视觉仍需在项目预览中复核。

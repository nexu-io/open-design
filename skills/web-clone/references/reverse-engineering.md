# 逆向拆解 WebGL/Canvas 重前端站

当侦察判定一个站是 WebGL/Canvas/Three.js 重前端（`window.THREE` 存在、或有多个 `<canvas>`、或有 `<script type="x-shader/*">`），走这套。

> 本篇讲**怎么读懂渲染架构**；逆向时的**证据纪律**（SOURCE/PARTIAL/GUESS 分级、no-compensation、baseline-first 闸门）和**找不到源码时的运行时捕获兜底** → `effect-extraction.md`。两篇配合用。

## 通用拆解步骤

1. **先拿单文件源码**。很多 demo 站全自包含在一个 HTML 里（GitHub raw / 浏览器查看源代码），别急着上 Playwright 抓站。
2. **数 canvas、读 SVG defs、grep shader**：几个 `<canvas>`？有没有 `<filter>`？着色器脚本在哪？——这三样决定渲染架构。
3. **判断"WebGL 在算什么"**（关键，决定要不要相信二手分析）：
   - grep `texture2D` / `sampler2D` → 在采样纹理 / 帧缓冲
   - grep `for` 循环里 `+= dS` / `map(` / `MAX_STEPS` → ray-marching（步进式）
   - grep `b*b` / 判别式 / `sqrt(` + 二次方程 → **解析求交**（闭式解，球/平面常用）
   - ⚠️ 别凭直觉假设 ray-marching——折射玻璃 demo 经常是解析球求交。
4. **找 GPU↔DOM 的桥**：若 WebGL canvas 不直接显示，而是 `toDataURL` / 喂 `<feImage>` / `feDisplacementMap`，说明它在生成**数据图**（位移/法线/深度）给别的层用。这是高级前端的标志手法，也是最容易被二手分析搞反的层级。
5. **物理/音频单独读**：通常是与渲染解耦的纯 JS 模块，可单独验证。

## 值得攒着的可迁移高级范式

- **位移图折射 DOM**：离屏 WebGL 算出 RG=位移、B=辅助量的 PNG，SVG `<feDisplacementMap scale=N>` 拿它扭曲真实 HTML。GPU 端与 SVG 端的 `scale` 必须对齐。能做液态玻璃、放大镜、水波等任意"透镜罩在网页上"的效果，且**被折射的是活的可交互 DOM**——这是 Three.js `MeshPhysicalMaterial(transmission)` 做不到的（它只能做"玻璃球外观"，做不出"折射整个网页"）。
- **一套 shader + mode uniform 多用途**：折射/反射/阴影/前景共用同一份 fragment shader，靠 `u_mode` 分支。省代码省编译。
- **辅助数据降分辨率 + 静止跳帧**：位移/反射/阴影图肉眼对分辨率不敏感 → 降到 1/2、1/4。物体静止 → 完全停渲染（settleFrames）。重前端站标配性能套路。
- **全屏大三角替代 quad**：3 顶点 `[-1,-1, 3,-1, -1,3]` 覆盖全屏，省一条对角线。

## 复刻路径决策

- **能 1:1 还原 + 许可允许** → 直接拿真源码改文案/配色/参数（单文件原生站逐字节保留 = 最忠实）。
- **想要近似效果、不在意一致** → 找同类开源模板换内容（如 awesome-threejs）。但注意：**换实现路线常常丢掉原站的灵魂机制**（如本案的"折射真实 DOM"），先确认那个机制是不是用户要的卖点。
- **本站特有的数学（求交公式/魔数）迁移时要重写**：解析"圆球"求交换成别的形状就得换公式（或才真需要 SDF/ray-marching）；折射率、菲涅尔系数、吸收等手调魔数换材质要重调。

## 验证（硬要求）
起本地服务器 → 浏览器打开 → 抓 console（不能有 JS/WebGL 编译错误）→ 截图对照原站。
诚实记录验证不了的部分：例如 Playwright 合成 PointerEvent `isTrusted=false` 触发不了拖拽命中逻辑——**如实写进 NOTES，别伪造"拖动成功"**。物理类站可用"两次加载初始状态不同"间接证明引擎在跑。

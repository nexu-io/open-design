# 旗舰案例 · Glass Marbles（真架构 vs AI 臆造）

源站 https://chiuhans111.github.io/marbles/ ·作者 Hans Chiu ·单文件 1067 行 ·许可证 **NONE**。
完整逐行拆解见 `当前项目目录/marbles-clone/TEARDOWN.md`，这里是给 skill 用的精华版。

## 一句话真架构

一个全屏 WebGL 片段着色器，用**解析法（二次方程 `b*b-c`）**求光线与球的交点、做最多 4 次折射/反射迭代，把光学结果编码成一张**位移图 PNG**（RG=像素位移、B=菲涅尔值）；再用一个 SVG `<filter>` 的 `feDisplacementMap(scale=200)` 拿这张图去扭曲**真实的、活的、可交互的网页 DOM**（背景色块 + 标题文字）。

> 你拖动的玻璃球本质是个透镜，透镜后面就是这页 HTML。WebGL 全程不碰 DOM 像素——折射这件事是 SVG filter 干的。物理、音频均为纯手写、零库。

## 三大支柱（真实实现要点）

1. **WebGL 光学**：解析球求交（非 ray-marching）；折射率 N=1.3、迭代 4 次；菲涅尔 `0.05+0.95*pow(1-cosθ,2.0)`（指数 2，非 Schlick 的 5）；内部 2 气泡 + 抛物面彩色核 + Beer-Lambert 体积吸收；**一套 shader 靠 `u_mode`(0折射/1反射/2前景高光/3阴影) 复用**；位移编码 `DISPLACEMENT_SCALE=200` 与 SVG 端严格对齐。
2. **SVG Filter 合成**：4 个 canvas（1 主 + 3 离屏），离屏图每帧 `toDataURL` 喂给 `<feImage>`。真实链：阴影 `feGaussianBlur(8)` → `feBlend multiply` 乘到 DOM → 折射 `feDisplacementMap` → 反射 `feDisplacementMap` → `feGaussianBlur(2)` → 用反射图 B 通道(菲涅尔)经 `feColorMatrix` 做 alpha mask → `feComposite` 两步合成。被折射的 `SourceGraphic` 就是挂了 `filter:url(#marble-filter)` 的 `#container`。
3. **物理**：纯手写，`mass=r³`、重力 0.8、3D 弹性碰撞(恢复 0.8、只在靠近时解算)、地面恢复 0.55 + 微弹跳归零、四元数滚动、拖拽抬升 targetZ=200；`settleFrames` 静止时完全停渲染。
4. **音频**：Web Audio 程序化合成(零文件)，基频 `800+(60-r)*20` + 5 泛音，音量随碰撞速度。

## ⚠️ AI 分析文档错在哪（反面教材，记住这些坑型）

那份 `弹珠网站复刻分析.md` 正文的**概念骨架基本对**（8 步、三支柱方向都对），但**附带的"复刻代码块"几乎全是臆造**：

| 臆造 | 真相 | 坑型（通用警示） |
|---|---|---|
| ray-marching + SDF + `MAX_STEPS=100` + 6 次差分求法线 | 解析求交，法线 `normalize(rp-center)` | **别凭直觉假设折射 demo 用 ray-marching**——球有闭式解，很多 demo 用解析法，又快又准 |
| `sampler2D uBackground` 把 DOM 当纹理采样 | 着色器不读背景；折射靠位移图交给 SVG | **搞反了 GPU↔DOM 的层级**——最核心的架构创意被丢 |
| `feBlend screen` + 单个 displacement + `feComposite over` 合阴影 | 双 displacement + 菲涅尔 mask + multiply 阴影 | **二手分析的 filter 链不可信，以真源码逐节点核对** |
| `MARBLE_COUNT=5`、数组开 10 | 硬编码 2 | 连常量都靠猜 |
| 屏幕中心 NDC 坐标 | 左上角像素 + Y 翻转 | 坐标系约定全凭臆测 |

**教训**：AI 写的"复刻施工图"= 参考其思路骨架，**代码块一行都别直接抄**，必须拿真源码核对。这就是本 skill 头号铁律的来源。

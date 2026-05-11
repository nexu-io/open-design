# 杂志风方向（Magazine Directions）

5 个**预设方向**，每个方向都把"用哪套主题色 / 哪些 layout / 多少 slide / 怎么写 chrome 文案"打包好，避免你在 6 问澄清里给出 5 个不相关的选项。

> 灵感来源：[alchaincyf/huashu-design](https://github.com/alchaincyf/huashu-design) 的 "20 design philosophies × 5 streams" — 我们把它压缩到 5 个 magazine-flavored 的方向，每个都对应到 `themes.md` 的某一套 + `layouts.md` 的某些组合。

---

## 何时用这份文档

在 SKILL.md `Step 1 · 需求澄清` 的开头：**先让用户在这 5 个方向里挑一个**，再去问主题色 / 时长 / 受众 / 大纲。流程是：

```
1. 用户讲一句"想做个分享 PPT"
2. 你（agent）介绍 5 个方向（拷贝下面的 1-line summary）
3. 用户挑一个方向（或说"不知道, 你推荐"）
4. 你按所选方向回答了"主题色"和"slide 数量"两个问题, 再问剩下的 4 个
```

**硬规则**：方向只能从下面 5 个里选,不能混搭。混搭 = 走 huashu-design 验证过的失败路径(品牌资产协议 v1)。如果用户对 5 个都不满意,委婉劝他选最接近的,然后允许在 `chrome` / `kicker` 里轻微定制语气,**绝不调色**。

---

## 1. Monocle Editorial · 国际杂志风 ✦ 默认推荐

**关键词**：克制、知识感、跨国、有 *taste*

| 配方 | 选择 |
|---|---|
| 主题色 | 🖋 墨水经典 |
| 推荐 slide 数 | 18–24 页(60% non-hero / 40% hero) |
| 主力 layouts | **1 封面 / 2 章节幕 / 4 左文右图 / 8 大引用 / 10 图文混排** |
| Chrome 文案 | `Vol.04 · Spring 2026` / `Act II · 12 / 24` / `lukew.com · 2026.04` |
| Kicker 风格 | 短英文 + 中点：`THE TWIST` / `BUT` / `DEC.` |
| Foot 文案 | `Page 12 · 一种新的工作方式` |

**适合**：商业发布、行业内部讲话、产品宣发、个人品牌沉淀分享。**默认就选这个**，跑不出大错。

**反例**：技术深度报告（密度太低），表格数据很多的 ops 复盘（没有合适的 layout）。

**视觉锚点**：*Monocle* / *Apricot Magazine* / *A Book Apart* / *Apartamento*。

---

## 2. WIRED Tech · 数据 + 工程

**关键词**：硬数据、流水线、对比、未来感

| 配方 | 选择 |
|---|---|
| 主题色 | 🌊 靛蓝瓷 |
| 推荐 slide 数 | 14–18 页(轻巧、数据密) |
| 主力 layouts | **1 封面 / 3 数据大字报 / 6 Pipeline / 7 问题页 / 9 Before/After** |
| Chrome 文案 | `Q2 / 2026 · Field Report` / `Data · 03` / `Eng Notes` |
| Kicker 风格 | 全大写 + 数字：`38× FASTER` / `RUNTIME 04` / `CASE 02` |
| Foot 文案 | `Page 03 · benchmark` / `methodology footnote` |

**适合**：技术发布会、研究分享、benchmark 报告、工程团队对内沟通、AI 产品 demo day。

**反例**：人文类金句分享（太冷）、艺术品牌（不够温度）。

**视觉锚点**：*WIRED* 长文版 / *MIT Technology Review* / *The Pudding* / *Stripe Press*。

**特殊建议**：每个 stat-card 的 `stat-label` 用英文等宽（这是 WIRED 风的核心），数字别加千分位逗号（不够工程），用 `K` / `M` / `×` 简写。

---

## 3. Kinfolk Slow · 慢生活 / 人文

**关键词**：留白、衬线、温度、私享会

| 配方 | 选择 |
|---|---|
| 主题色 | 🍂 牛皮纸 |
| 推荐 slide 数 | 9–12 页(慢、放空、低密度) |
| 主力 layouts | **1 封面 / 4 左文右图 / 8 大引用 / 10 图文混排 / 2 章节幕** |
| Chrome 文案 | `Vol.07 · Autumn` / `一封信 · 03` / `Notes from Kyoto` |
| Kicker 风格 | 中文短语 + 标点："给一个朋友。" / "晚秋。" / "Letter Three" |
| Foot 文案 | `Page 03 · Letter Three` / `2026 · Spring Issue` |

**适合**：私享会、读书分享、人物访谈复盘、生活方式品牌、个人随笔。

**反例**：产品发布（太慢）、技术分享（太软）、严肃数据（信息密度不够）。

**视觉锚点**：*Kinfolk* / *The Gentlewoman* / *Cereal* / *Drift Magazine*。

**特殊建议**：
- **故意把 slide 数压到 10 页以下**——Kinfolk 的核心是"少即是多"，不要塞满
- 大量使用 Layout 8（大引用）和 Layout 10（图文混排）
- 不要用 Layout 3（数据大字报）——和气质冲突
- `<title>` 文字、章节名、kicker 全部用衬线 + 中文短句

---

## 4. Domus Architectural · 建筑 / 空间感

**关键词**：尺度、几何、不对称、克制的炫耀

| 配方 | 选择 |
|---|---|
| 主题色 | 🌙 沙丘 |
| 推荐 slide 数 | 12–18 页(中密度，强视觉) |
| 主力 layouts | **1 封面 / 2 章节幕 / 5 图片网格 / 9 Before/After / 10 图文混排** |
| Chrome 文案 | `Spazio 09 · Project File` / `Plan · 03` / `Fig.4` |
| Kicker 风格 | 数字 + 类别：`PROJECT 04` / `SECTION B` / `FIGURE 12` |
| Foot 文案 | `Page 09 · West Wing` / `1:200 scale` |

**适合**：设计 / 建筑案例分享、产品设计 review、品牌视觉发布、画廊式 portfolio 展示。

**反例**：金句分享（太硬）、技术 deep dive（不擅长流水线）。

**视觉锚点**：*Domus* / *Apartamento* / *Mark Magazine* / *Pin-Up*。

**特殊建议**：
- **每个 hero 页都要"留 60% 空"** — 不要塞满，建筑感来自呼吸
- 大量使用 Layout 5（图片网格）但**只放 4 张大图**，不要放 6 张小图
- `chrome` 文案保持冷峻，全用英文 + 数字

---

## 5. Lab / Reference · 学术 + 工艺手册

**关键词**：克制、有图有表、可复现、工程师爱看

| 配方 | 选择 |
|---|---|
| 主题色 | 🌿 森林墨 |
| 推荐 slide 数 | 16–24 页(密度高、有图表) |
| 主力 layouts | **1 封面 / 2 章节幕 / 3 数据大字报 / 6 Pipeline / 9 Before/After** |
| Chrome 文案 | `Field Notes · Vol.II` / `Section 3.2 · Method` / `Reference 04` |
| Kicker 风格 | 编号：`§ 3.2` / `Ref. 04` / `Method 01` |
| Foot 文案 | `Page 12 · 3.2 Calibration` / `appendix A` |

**适合**：学术分享、内部研究复盘、可持续 / 自然主题、长期产品复盘、有方法论的工艺型分享（咖啡 / 香水 / 茶）。

**反例**：商业发布（太冷静）、营销活动（不够 catchy）。

**视觉锚点**：*National Geographic*（旧版）/ *Hand-Eye Magazine* / *Nautilus* / *MIT Press* book layouts。

**特殊建议**：
- 大量 `meta-row` 标注来源、方法、引用
- 比其他方向**更频繁地用 `<figcaption class="img-cap">`** 给每张图标编号
- `kicker` 用 § 章节编号，不用感叹句

---

## 推荐速查（如果用户描述了一个意图，你应该选哪个）

| 用户说的话 | 推荐方向 |
|---|---|
| "通用分享" / "不知道选啥" | **1. Monocle** |
| "一人公司 / AI 折叠 / 创业 demo day" | **1. Monocle**（默认）或 **2. WIRED**（如果偏技术） |
| "AI / benchmark / 模型评测" | **2. WIRED** |
| "产品发布会 / 工程团队分享" | **2. WIRED** |
| "读书分享 / 人物访谈 / 一个人的故事" | **3. Kinfolk** |
| "私享会 / 朋友间分享 / 周末闲聊式" | **3. Kinfolk** |
| "设计案例 / 品牌发布 / portfolio 展示" | **4. Domus** |
| "建筑 / 空间 / 装置" | **4. Domus** |
| "学术 / 研究 / 方法论 / 教程" | **5. Lab** |
| "可持续 / 环保 / 自然主题" | **5. Lab** |

---

## 决策记录（生成前必做）

挑完方向后，**在项目目录下生成或更新 `项目记录.md`**（或 `大纲-v1.md`），第一行写清：

```markdown
# [演讲标题] · 项目记录

- 方向（Direction）：**Monocle Editorial** （from `references/styles.md`）
- 主题色（Theme）：🖋 墨水经典
- 受众：内部团队（产品 + 设计）
- 时长：25 min · 约 18 slides
- Chrome 风格：Vol.04 / Act II / 12 of 18
- Kicker 风格：短英文 + 中点
```

后续迭代每次调整方向都更新这一节。**不要中途换方向**——5 个方向之间的"语气"差异比想象的大，混着写就会撕裂。

---

## ❌ 不要做的事

- ❌ 把 5 个方向的 layout 选择混着用（例如 Monocle 配 Layout 6 Pipeline 多页 + Kinfolk 风的 chrome）—— 杂乱
- ❌ 自己造第 6 个方向（"我想做'科技 + 文艺'风"）—— 委婉劝他选最近的，告诉他混搭历史失败率超高
- ❌ 中途换方向，例如做到第 8 页突然觉得"换 Kinfolk 更好"——前 7 页就废了，要么全推倒重来，要么坚持原方向到底
- ❌ 在不属于该方向的 layout 上花时间（例如 Kinfolk 写 4 页 Layout 6 Pipeline）—— 信号是用错方向了

## ✅ 应当做的事

- ✅ 只在 5 个方向里挑，挑完用方向去回答其他 5 个澄清问题
- ✅ 在 `项目记录.md` 第一行明确方向，全程不变
- ✅ 让 chrome / kicker / foot 三个文字位为方向"代言"——它们承担了一半的方向辨识度
- ✅ 如果不确定，**默认选 Monocle Editorial**——它是 5 个方向里失败概率最低的兜底

<div align="center">
  <img src="./logo.svg" width="100%" alt="Phantom Motion Logo">
  
  <h3>驭无形之码，导有形之境 (Code-Defined Media Engine)</h3>

  <p>
    <b>Phantom Motion</b> 是一个极其硬核的交互式动态视觉叙事生成器。<br>
    它不仅仅是生成代码，而是融合了<b>好莱坞电影级 GSAP 运镜</b>、<b>GPGPU 百万物理粒子</b>、<b>KaTeX 顶级数学渲染</b>以及<b>东方水墨与八卦哲学演算</b>的次世代 HTML5/WebGL 动画引擎。配合 Hyperframes 与无头浏览器，它可以将 AI 生成的纯文本剧本，毫无卡顿地压制为 <b>60FPS、4K 画质、音画微秒级同步的商业级 MP4 大片</b>。
  </p>

  <p>
    <a href="./README.md">🇨🇳 简体中文</a> | <a href="./README_EN.md">🇺🇸 English Version</a>
  </p>

  <p>
    <img src="https://img.shields.io/badge/Version-8.0.0-8A64B7.svg?style=for-the-badge" alt="Version">
    <img src="https://img.shields.io/badge/License-Apache_2.0-success.svg?style=for-the-badge" alt="License">
    <img src="https://img.shields.io/badge/AI_Agent-Claude_Code_/_Gemini-blue.svg?style=for-the-badge" alt="AI Agent">
    <img src="https://img.shields.io/badge/Stack-Three.js_|_GSAP-black.svg?style=for-the-badge" alt="Stack">
    <img src="https://img.shields.io/badge/Stack-D3.js_|_SVG-orange.svg?style=for-the-badge" alt="Stack">
  </p>
</div>

<div align="center">
  <img src="./assets/phantom-motion-poster.jpg" width="100%" alt="Phantom Motion Poster">
</div>

---

## 🌟 为什么它能降维打击传统影视工业？

市面上的代码动画往往是“生硬的元素平移”和“机器感极强的旁白”。**Phantom Motion** 的诞生是为了终结这一切，我们将导演的克制与图形学的极致结合到了 AI 智能体中：

- **🎙️ Audio-First (音频优先) 引擎**：先生成声音，再画画面。利用 TTS 获取绝对时间轴，实现 GSAP `Duck & Swell`（BGM 随人声自动避让烘托），做到微秒级的音画同步。
- **🎥 剧本驱动的电影级 Camera Rig**：严禁摄像机乱飞！内置四大经典运镜（静态悬浮、深渊拉近、史诗环绕、焦点拉扯）。大模型根据剧本情感，通过 GSAP 轨道车替身技术，精确调度 3D 机位。
- **🏛️ 3D 非遗与全息引擎**：直接支持 GLTF/GLB 外部高精 PBR 模型加载，并能一键切换至 `Hologram Mode`（紫苏色发光网格透视），完美演绎非遗与现代科技的碰撞。
- **📊 高级数据可视化引擎**：摒弃掉帧的传统图表库，采用 `D3.js + GSAP`，将真实数据映射为极具东方美学的高级平滑曲线（Spline），伴随旁白做动态生长动画。
- **🚫 0 版权法务风险**：所有核心特效全部由原生 WebGL、Three.js Shader 和 开源协议库构成，拒绝任何闭源付费插件，生成的 MP4 视频 100% 归创作者所有。

---

## 📂 仓库结构

```text
phantom-motion/
├── assets/                 # 存放公共媒体资源（如打赏二维码、logo）
├── references/             # 核心组件库（Three.js片段、GSAP运镜、东方美学代码等）
├── scripts/                # 核心引擎脚本（TTS生成、BGM生成、HTML拼装等）
├── tests/                  
│   └── xingji/             # 《苍穹之轨：钱学森弹道》 完整动画示例与静态资源
├── SKILL.md                # 核心智能体底层逻辑系统指令库 (System Prompt V6.0)
├── logo.svg                # 动态 SVG 徽标
├── README.md               # 中文文档
└── README_EN.md            # 英文文档
```

---

## 🚀 快速开始 (Quickstart)

Phantom Motion 被设计为一个极其优雅的 CLI 智能体 Skill。它可以被挂载到目前主流的端侧或云端代码智能体中：

1. **环境准备**
   确保你安装了 Node.js 与 Python3，并在本项目下执行：
   ```bash
   npm install
   pip install requests  # 或使用环境所需的其他基础包
   ```

2. **安装到智能体**
   你可以将本仓库配置为以下 AI IDE 的核心 Skill 或 Workspace：
   - **Claude Code**：直接将本目录作为一个独立的 Workspace 载入，或通过自定义 Skill 指令映射 `SKILL.md`。
   - **Codex / Openclaw / Hermes / Antigravity**：将 `SKILL.md` 的内容注册到你的自定义 Agent Prompt 库中，并允许智能体读取 `scripts/` 与 `references/` 目录。

3. **唤醒智能体**
   在你的终端或对话框中输入触发词：
   > *"帮我生成一个关于量子力学的代码动画"*

4. **全自动挂机生成**
   AI 会自动拆分剧本 -> 查阅资料 -> 生成 TTS 与 BGM -> 组装 HTML 骨架 -> 挂载特效代码 -> 最终合成。

---

## ⚠️ 顶级大模型与 API Key 脱敏警告

> **【模型推荐】** 
> 好的代码动画，是需要反复打磨才能出精品效果的！别妄想一句话就能拿到精品动画，简单一句话得到的大多是普通粗稿级动画作品。精品级作品需要你与 AI 进行反复的分镜推敲和代码迭代。
> 因此，**强烈推荐使用顶级“御三家”模型**：`Claude Opus 4.7+`、`Gemini 3.1+ Pro`、`ChatGPT 5.5+`，只有它们的超大上下文和代码逻辑，才能驾驭这种级别的视觉叙事。

> **【API Key 声明】**
> 本项目依赖的音频管线（Gemini 3.1 Flash TTS、MiniMax Music API）需要用户配置自己的 API Key 和 Group ID 环境变量。
> **请绝对不要将包含你个人 API Key 的代码同步到 GitHub 等公开仓库中！** 生成演示文件后，请务必进行脱敏处理！

---

## 🎬 Showcase: 终极性能阅兵剧本库 (Masterpiece Prompts)

如果你想体验 V6.0 引擎的极限威力，请直接复制以下 5 个**「神级导演提示词」**喂给你的智能体：

<details>
<summary><b>♟️ 剧本 01：《神之一手》（30秒 · 极速高燃）</b></summary>

> "制作一段 30 秒的高燃短片，还原 2016 年 AlphaGo 对战李世石的第四局‘神之一手（第78手）’。
> **[0-3秒] 巨幕片头**：纯黑背景，极具压迫感的白色巨幕大字「 神 之一 手 」伴随重低音砸下，背景有微弱的代码乱码闪烁。
> **[3-27秒] 阵法与落子**：联网检索该局真实的棋盘坐标数据。调用【SVG 东方棋局引擎】，在极简的木纹紫苏色网格上，复现第 78 手‘白棋挖’的绝对震撼瞬间。不要多余的 3D 旋转，镜头保持【上帝视角绝对俯视 (Static)】。黑白棋子随着旁白节奏，带有极强回弹阻尼感（back.out）砸向棋盘。
> **旁白要求**：调用 Gemini Charon (低沉男声)。每行字幕不超过 15 字。'人类智慧的孤城... 在硅基算力前摇摇欲坠... 直到那不可思议的第七十八手。' 伴随落子，BGM 瞬间爆发。
> **[最后 3 秒] 极简片尾**：棋盘极度线性淡出至黑幕，中心浮现 Phantom Motion LOGO。"
</details>

<details>
<summary><b>🏛️ 剧本 02：《榫卯：木的灵魂》（45秒 · 内部透视重构）</b></summary>

> "制作 45 秒关于中国古建筑非遗技艺‘斗拱榫卯’的 3D 解构动画。
> **[0-3秒] 巨幕片头**：紫苏灰背景，大字「 榫 卯 」配合木材撞击的清脆音效浮现。
> **[3-25秒] 质感与智慧**：联网考证‘燕尾榫’的真实力学互锁原理。调用【3D 器物引擎 (GLTFLoader)】，导入极具真实 PBR 木纹质感的榫卯结构。镜头执行【史诗环绕 (Orbit)】，展示严丝合缝的外观。
> **[25-42秒] 降维透视**：旁白说到'不见一钉一铆，却能抗住千年风云'时，木头 PBR 材质瞬间被剥离，切换为【Hologram Mode (全息发光紫苏网格)】。镜头执行【焦点拉近 (Push-in)】，透视内部极其精妙的受力结构，两个木块在空中拆解又严丝合缝地拼装。
> **旁白要求**：调用 Gemini Erinome (知性女声)。每行字幕严格限 15 字内。
> **[最后 3 秒] 极简片尾**：全息网格在空中消散为黑幕。"
</details>

<details>
<summary><b>📈 剧本 03：《茶叶与帝国》（60秒 · 宏大数据叙事）</b></summary>

> "制作 60 秒的丝绸之路茶叶贸易史数据动画大片。
> **[0-3秒] 巨幕片头**：巨幕大字「 丝 茶 之 路 」，水墨粒子从字体边缘散开。
> **[3-20秒] 历史画卷**：调用【3D 卷轴顶点着色器】，在屏幕中央极其平滑地展开一幅长卷。画卷上使用【飞白水墨 Shader】缓慢渗透出唐宋时代的商贸地图。
> **[20-57秒] 数据洪流**：联网检索 17-19 世纪中国茶叶出口欧洲的真实飙升数据。绝对禁止使用 ECharts！必须调用【D3.js + GSAP 图表引擎】，在 3D 卷轴的上方，画出一条极具东方美学的紫苏色平滑折线（Spline）。折线伴随激昂的交响乐不断攀升，下方带有半透明的发光面积阴影。
> **旁白要求**：男声。'一片树叶... 跨越了重洋万里... 左右了帝国的兴衰。' 字幕排版保持极简。
> **[最后 3 秒] 极简片尾**：折线攀升至顶点化作高光，随后一切线性淡出至黑幕。"
</details>

<details>
<summary><b>🪐 剧本 04：《苍穹之轨：钱学森弹道》（90秒 · 极致硬核科幻）</b></summary>

<div align="center">
  <a href="https://github.com/Pixelxzen/phantom-motion/blob/main/tests/xingji/output_1080p_16_9_SD.mp4">
    <img src="./tests/xingji/xingji-cover.png" alt="苍穹之轨：钱学森弹道 1080P 演示" width="100%">
  </a>
  <br>
  <p><i>（官方 1080P 横屏渲染实测，点击上方封面图前往播放页面，感受 GPGPU 粒子与 Charon 音色的史诗质感）</i></p>
</div>

> "调用最大科学算力，制作 90 秒的钱学森弹道（Boost-glide）硬核科普。
> **[0-3秒] 巨幕片头**：纯黑背景，大字「 苍 穹 之 轨 」。
> **[3-30秒] 历史档案**：调用【档案抓取 Skill】，从维基百科精准下载钱学森先生的真实无版权高清照片。照片以 3D 玻璃全息卡片悬浮在宇宙中。旁白介绍其在大气层边缘滑翔突防的绝顶构想。
> **[30-87秒] 弹道演算**：触发【GSAP Flip】，全息照片丝滑缩小退至左下角。画面中央浮现高精度的 PBR 全息网格地球。**强制要求**：依据物理学真实原理，利用样条曲线（CatmullRom Curve）绘制一条在地球大气层边缘如'打水漂'般起伏波动的红色发光轨迹，绝不能用普通的抛物线敷衍！镜头紧紧跟随轨迹飞行（Flyby）。
> **旁白要求**：女声。'在大气层边缘... 像打水漂一样滑翔... 让一切防御系统形同虚设。' 音频必须做低频增强。
> **[最后 3 秒] 极简片尾**：导弹命中光芒闪烁后，黑幕淡出。"
</details>

<details>
<summary><b>☯️ 剧本 05：《大统一：量子与道》（120秒 · 终极视觉圣杯）</b></summary>

> "制作 120 秒的顶级哲学与物理大片，探讨量子力学与东方《易经》的终极共鸣。
> **[0-3秒] 巨幕片头**：大字「 万 物 一 理 」，伴随一声深沉的古琴。
> **[3-40秒] 粒子的狂舞**：触发【100万 GPGPU 粒子引擎】，满屏的微观发光粒子在卷曲噪声（Curl Noise）中疯狂涌动，展现量子世界的混沌与测不准原理。中心利用【KaTeX 公式引擎】浮现薛定谔波动方程。
> **[40-80秒] 阵法显现**：旁白：'西方物理的尽头... 东方哲学早已在那里等候。' 触发物理场形变，一百万颗粒子瞬间收束，在中心聚集成一个完美的 3D 太极图。
> **[80-117秒] 易经推演**：太极图中，调用【易经 SVG 阵列生成器】，先天八卦的阴阳爻随着重低音，带有极强阻尼感一层层分裂、弹出。整个八卦阵与背后的星系粒子共同开启恢弘的自转。
> **旁白要求**：男低音（Gravelly），字数极简，带有史诗般的呼吸停顿。'从量子纠缠的混沌... 到阴阳两仪的秩序... 宇宙，本是同源。'
> **[最后 3 秒] 极简片尾**：所有粒子如星辰般寂灭，归于黑幕。触发双态隔离代码：渲染成 MP4 停止，网页预览则无限循环。"
</details>

---

## 📈 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Pixelxzen/phantom-motion&type=Date)](https://star-history.com/#Pixelxzen/phantom-motion&Date)

---

## 🤝 鸣谢与版权声明

本项目由 **紫苏子ACG** 原创开发。
- **Phantom Motion 核心代码**：采用 [Apache-2.0 License](./LICENSE) 开源协议。
- **字体与数学引擎**：基于 MIT 协议的 [KaTeX](https://github.com/KaTeX/KaTeX) 与 [SplitType](https://github.com/lukePeeters/SplitType)。
- **图形与动画**：基于 [Three.js](https://threejs.org/) 与 [GSAP](https://greensock.com/)，部分数据图表渲染由 [D3.js](https://d3js.org/) 提供支持。
- **无头压制渲染引擎**：致谢 [Hyperframes](https://github.com/hyperframes/hyperframes)（其技术栈版权归原作者所有）。

工具生成的最终 MP4 视频产物版权归使用者所有。

---

## ☕ 支持与交流

如果你喜欢这个项目，欢迎关注我的社媒，或者请我喝杯咖啡！

<div align="center">
  <p>
    <a href="https://www.xiaohongshu.com/user/profile/5b80023bd72b6300011273e6"><img src="https://img.shields.io/badge/Xiaohongshu-小红书-E1306C?style=flat-square&logo=xiaohongshu&logoColor=white" alt="Xiaohongshu"></a>
    <img src="https://img.shields.io/badge/WeChat_Official-紫苏子ACG-07C160?style=flat-square&logo=wechat&logoColor=white" alt="WeChat Official">
    <img src="https://img.shields.io/badge/WeChat_Video-紫苏子ACG-07C160?style=flat-square&logo=wechat&logoColor=white" alt="WeChat Video">
    <a href="https://x.com/Pixelxzen"><img src="https://img.shields.io/badge/X-(Twitter)-000000?style=flat-square&logo=x&logoColor=white" alt="X (Twitter)"></a>
  </p>
  
  <p><b>扫码赞赏，支持开源创作：</b></p>
  <img src="./assets/sponsor-qrcode.png" width="300" alt="赞赏码">
</div>

# 🔥 Open Design 0.8.0-preview —— 设计的旧世界，到此为止。新世界，和我们一起造。

> **状态：** 实验性预览版 · 0.8.0 正式版发布前，我们想听到你的声音
> **分支：** [`preview/v0.8.0`](https://github.com/nexu-io/open-design/tree/preview/v0.8.0)
> **与 0.7 并存：** 预览版可与你现有的 0.7 并行安装——零成本试用，不必割舍任何东西。

---

## ✊ 这不是一次发布。这是发令枪。

过去十年，设计师每天清晨做的是同一件事：打开 Figma，推像素、拖矩形、命名图层、同步 token、交付一份 spec、看着工程师把一半重新解读、再返工 spec。五年这么过来。有人十年这么过来。**整个职业，被一款工具变成了一座点击工厂。**

我们相信那个时代该结束了。要真正结束，需要两件事同时成立——而 0.8.0 是第一个把这两件事装进同一个引擎的版本：

### 🥊 运动一 —— **#去 Figma**：拆掉画布，留下手艺。

Figma 没有问题。它只是在 agent-native 的时代里，*成了错误的工作单元*。设计系统不该是一份你天天维护的文件。原型不该是 200 个你一帧一帧推的画板。切图导出不该是一种人类仪式。**画布，曾经只是"没有真正引擎"时的临时方案。** 现在，我们有引擎了。

### 🤖 运动二 —— **Agent-Native Design**：让设计师成为导演。

Claude Design、Open Design —— agent 驱动的设计已经不是 demo。它正在产出**生产级**的设计系统、世界级的界面、PPT、原型——服务于那些*连一个矩形都画不出来*的人。不是五年后。**就是今天，就在这个预览版里。** 大家盼了很久的 10×–100× 生产力跃迁？它来了，而且它不是来自某个粘贴在 Figma 上的对话框。它来自一台把 agent 当作一等公民、让人类只输出"意图"而不再输出"坐标"的引擎。

> 让每一位设计师、每一支团队、每一家公司，都能产出世界级水准的设计系统、界面、PPT 和原型。这是我们押下的赌注。这就是 0.8.0 存在的意义。

我们还年轻。我们还粗糙。我们 40k stars 在身，且仍在加速。**剩下的路，需要你和我们一起推完。** 🚀

---

## 🧱 我们为什么重写了内核（以及它为什么是这场运动的关键）

0.7 的最后两周让一件事彻底清晰：当初那套 research-preview 架构，已经撑不起社区想把它推到的地方。所以我们没有继续打补丁，而是**重铸地基**——一场运动，需要的不是一份"只有作者能扩展的 demo"，而是一颗**别人可以在上面盖楼的内核**。

0.8.0-preview，就是这次重铸。底层有三件事彻底变了：

- **🧩 万物皆插件。** 引擎被刻意保持"小而无聊"。设计系统、切图、原型、导出，*以及所有遗产工作流，包括 Figma 自己*——全部以插件存在。**旧世界往新世界迁移的方式，就是这样：一个插件一个插件地迁，由我们所有人一起迁。** 你写一个插件，你就把行业的一块版图搬了过来。
- **🌐 默认 headless。** 桌面 App 只是 CLI 的一层薄壳。同一台引擎可以跑在 Claude Code、OpenClaw、Hermes Agent 里，也可以直接被一个飞书 / Discord / Slack 群里的 agent 调用。**你可以用 Claude Code 驱动它。Claude Code 也可以被它驱动。** 设计，不再是"你打开的某个地方"，而是"你的 agent 拥有的某种能力"。
- **♻️ 插件创造插件。** OD CLI 包了 GitHub CLI，所以一个 agent 可以自己 clone 仓库、脚手架出一个插件、开一个 PR——为你，*或者为它自己*。闭环成立：引擎在公开场合自己生长，而你在循环里。

底层赌注是：**一台 agent 驱动的设计引擎，让整个行业都能站上去——开源、厂商中立、agent runtime 中立。** 不是"又一个 AI 设计工具"。是**未来十年设计行业所依赖的那块基石**。

---

## 🛠️ 怎么试（5 分钟，和你的 0.7 并存）

### 方式 A —— 预编译安装包（推荐）

最新预览版本：**`0.8.0-preview.2`**

- 🍎 macOS (Apple Silicon)：[open-design-0.8.0-preview.2-mac-arm64.dmg](https://releases.open-design.ai/preview/versions/0.8.0-preview.2/open-design-0.8.0-preview.2-mac-arm64.dmg)
- 🍎 macOS (Intel)：[open-design-0.8.0-preview.2-mac-x64.dmg](https://releases.open-design.ai/preview/versions/0.8.0-preview.2/open-design-0.8.0-preview.2-mac-x64.dmg)
- 🪟 Windows：[open-design-0.8.0-preview.2-win-x64-setup.exe](https://releases.open-design.ai/preview/versions/0.8.0-preview.2/open-design-0.8.0-preview.2-win-x64-setup.exe)
- 🐧 Linux：*即将到来*

### 方式 B —— 从源码构建

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
git checkout preview/v0.8.0
pnpm install
pnpm tools-dev
```

0.7 稳定版和 0.8 预览版不共享运行时数据——两个都留着，随时切换。

---

## 🙏 我们需要你。具体到"你"。三种参战方式。

这一段，才是真正重要的。一场运动不可能只从一个团队的笔记本里发出去；它从那些早早出现、补上缺失拼图的人手里发出去。

### 1. 🐛 把它弄坏。大声地。

什么都算——crash、"感觉怪怪的"、"我希望它能……"、文案令人困惑、加载慢。**小报告反而最值钱。** 别按住一个半成形的想法不发，我们想要它。

→ [**提交一个 Preview v0.8.0 反馈 issue**](https://github.com/nexu-io/open-design/issues/new?template=preview-v0.8.0-feedback.yml)（自动打上 `preview/v0.8.0` 标签，团队盯着[完整列表](https://github.com/nexu-io/open-design/issues?q=is%3Aopen+label%3A%22preview%2Fv0.8.0%22)）

如果不算 bug、只是开放式的想法——**直接回复这个 thread。** 每一条回复都会被读到。

### 2. 🧩 写一个插件。把旧世界的一块拼图搬过来。

这是你能为这场运动做的**最高杠杆**的事。引擎刻意保持小——*因为插件层才是行业迁移进来的入口。* 如果你的团队有一套 Figma 工作流、一套 token 同步、一条导出流水线、一份品牌包、一套 PPT 模板、一种原型套路——**把它包成 OD 插件，那个工作流就一夜之间变成 agent-native 的。** 为你的团队，也为所有人。

我们会**亲手帮你**把第一个插件发出来。开一个标题为 `Plugin idea: <thing>` 的 issue，或者在 Discord 找我们。

如果你想直接发修复，请把 PR 提到 `preview/v0.8.0`（GitHub 的下拉默认是 `main`——手动切换一下）。[看看正在飞行中的 PR。](https://github.com/nexu-io/open-design/pulls?q=is%3Apr+base%3Apreview%2Fv0.8.0)

### 3. 📣 告诉一个人。

一个被推像素推到厌烦的设计师。一个被 spec 拖到崩溃的 PM。一个把同一个组件重写了第五遍的工程师。把这个 thread 发给他。**运动的传播速度，等于口耳相传的速度。**

---

## 📦 0.8.0 里有什么，没什么

**✅ 这次预览已经在的：** 插件引擎、官方原子插件（Todo、direction-pick、question、Figma 导出……）、内置场景插件（设计系统模板、切图、原型）、官方 Plugin Registry source。

**🚧 0.8.0 还没进来的：** 仍在敲定边界——完整清单会作为 thread 更新尽快补上。

---

## 🎯 几件我们真的想听你怎么看的事

哪里稳，我们自己能猜。这几个地方，我们猜不了：

1. **"插件化"这个 framing。** 当你真的上手用——"万物皆插件"*感觉*对吗？哪里你想扩展，但那道缝感觉不对？
2. **Headless。** 如果你通过 CLI、Claude Code、OpenClaw、Hermes Agent、或者飞书 / Discord agent 玩过——什么感觉？魔法在哪一步断了？
3. **0.7 → 0.8 这一跳。** 0.7 里你依赖的某个东西，到 0.8 不见了 / 搬家了 / 行为变了？
4. **写插件。** "agent 引导你建插件"那个流程，端到端跑通了吗？还是在哪儿翻车了？

---

## 💬 Discord —— 作战室

想和团队实时来回、第一时间收到每个新构建的提醒？

→ [**加入 Open Design preview Discord**](https://discord.gg/RchHB7DQS)

主战线还在这个 thread。Discord 是实时活儿发生的地方。

---

*旧世界的设计不会自己迁过来。我们在写引擎；你在写插件；我们一起把一整个行业搬到 agent-native 的土地上。点 Subscribe——下一次更新很快。* 🌅

**PR 里见。** 🫡

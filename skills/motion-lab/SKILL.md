---
name: motion-lab
description: "为当前网页或组件查找、选型和改造动效。包含 160 个案例的 HTML/CSS/JS、参数与中英文索引，覆盖基础、文字、交互和高级动效。"
en_name: motion-lab
zh_name: "Motion.Lab · 160 个动效案例"
zh_description: "为当前网页或组件查找、选型和改造动效。包含 160 个案例的 HTML/CSS/JS、参数与中英文索引，覆盖基础、文字、交互和高级动效。"
triggers:
  - "motion-lab"
  - "动效"
  - "动画"
  - "motion"
  - "Motion.Lab"
  - "动效案例"
  - "案例库"
  - "特效"
  - "文字动画"
  - "hover"
  - "scroll"
license: MIT
od:
  mode: utility
  category: animation-motion
  upstream: https://github.com/yangxu128/Motion.Lab
  source-commit: fbfda036aadbc1b46547bce8a7a57ec12bf73485
---
## Open Design 宿主约定

这是当前任务中的功能技能。保留用户选定的任务类型、品牌、技术栈、当前阶段和交付格式；不要因为 @ 选择而改成视频项目。规划阶段只规划，实现阶段才写代码。检查、渲染和导出仅在宿主当前阶段允许且工具真实可用时执行；技能不能额外开启独立 Agent、强制审批或绕过宿主交付边界。

附属文件相对当前技能包根目录读取，按当前问题选读，不把全部参考文档粘入提示词。不读取其他 Agent 的全局配置。素材优先用用户已有文件；需要新图片、视频或音频时使用当前宿主实际提供且用户允许的工具。缺少生成、测量或导出能力时说明具体缺口，交付可验证部分，不声称完成未执行的步骤。遵循当前任务的输出路径，不覆盖输入或历史产物。
# Motion.Lab 动效案例库

## 使用步骤

1. 先明确用户要表达的状态或动作，查看已有组件与技术栈。用 `references/index.md` 按中英文名称、ID、分类或标签检索。选择最符合用户目标的案例，不为展示库而堆满特效。
2. 读取相应分类文件中该 ID 的小节：`references/basic.md`（基础）、`references/text.md`（文字）、`references/interaction.md`（交互）、`references/advanced.md`（高级）。每项包含参数定义、HTML/CSS/JS 原始示例，不需要联网下载整站。
3. 将代码适配当前 DOM 和组件生命周期，保留用户内容与品牌。CSS 参数需带正确单位；检查 JS 变量和代码是否实际使用参数，不能只改展示控件。全局选择器改为组件内作用域，多实例不共用状态。
4. 运行依赖按实际代码确认：Three.js、GSAP 等并非随此技能安装。已有项目优先复用现有版本，不擅自加入多个动画框架。Canvas/WebGL 按容器尺寸与 DPR 调整，说明性能取舍。
5. 清理 requestAnimationFrame、定时器、滚动/指针监听和渲染资源；React 使用生命周期 cleanup。滚动监听需要节流时采用帧调度；不要让动画阻塞点击或键盘反馈。
6. 尊重 prefers-reduced-motion，提供静态或简化状态；交互同时支持键盘、触摸与焦点。检验代码中的硬编码尺寸、占位文字及资源路径；示例不能未经修改作为最终成品。
7. 在当前阶段允许时验证真实运行、触发、停止、卸载和多次进入；报告实际观察结果。只有静态源码检查时明确说明，不能宣称 160 个案例全部通过浏览器验收。

## 常见需求

- 按钮点击波纹：`click-ripple-material`。
- 标题打字：`text-typewriter`；多行版本 `text-typewriter-multi`。
- 卡片翻面：`hover-flip-card`。
- 滚动进入：`scroll-reveal`。
- 粒子背景：根据目的在 `particle-fountain`、`canvas-starfield`、`flow-field` 和 `particle-galaxy` 中选型。

案例用于局部功能实现，本包不创建 Motion.Lab 网站、不包含它的应用界面或预览站点，也不将 160 个案例拆成 160 条 @ 列表项。

## 许可随包保留

`references/license.md` 随会话包保留来源许可。复制参考代码到交付工程时保留上游署名及许可文本。

## Pull Request 提交规范与安全声明

感谢您对 **Phantom Motion** 的贡献！为了保证项目的极高标准与代码安全性，在合并 PR 前，请您务必确认以下事项：

### 🛡️ 安全与代码纯净度审查 (Security & Purity Check)
作为核心开源资产，本项目对任何恶意代码、隐藏后门或未授权的数据收集行为**零容忍**。
- [ ] 我确认提交的代码中**不包含**任何恶意脚本、病毒嫌疑代码或混淆的 Base64 危险负载。
- [ ] 我确认代码中**未引入**任何未知的、有安全争议的第三方闭源依赖或 CDN 外部脚本。
- [ ] 我确认未在代码中硬编码任何真实的 API Key、Secret、Token 等敏感信息。

### 🎨 架构与美学规范 (Architecture & Aesthetics)
- [ ] 如果修改了核心渲染引擎，我确认没有使用会引起 Hyperframes 掉帧的底层循环机制（例如独立于 GSAP masterTl 的 `requestAnimationFrame`）。
- [ ] 针对数据图表，我确认使用的是 D3.js + GSAP 方案，**没有**引入 ECharts/Chart.js 等阻塞截帧的 Canvas 库。
- [ ] 如果添加了新功能，我已经在 `README.md` 或 `SKILL.md` 中补充了必要的说明。

### 📝 变更说明 (Description)
<!-- 请在此处简要描述您提交的 PR 修复了什么问题，或增加了什么功能： -->



---
**⚠️ 维护者 (紫苏子ACG) 审核须知：**
此 PR 必须经过严格的代码审查（Code Review），必要时请通过安全工具扫描确认无异常后，方可 Merge。

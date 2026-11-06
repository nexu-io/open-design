# 插件规范示例

语言：[English](README.md) | 简体中文

这些示例是给插件作者和外部 agent 使用的源材料。它们不是随包一方插件，daemon 启动时不会扫描这个目录。

覆盖范围：

- `import-screenshot-to-prototype` - import 主类。
- `create-prototype-dashboard` - prototype create 模式。
- `create-slides-pitch` - slide deck create 模式。
- `create-live-artifact-ops` - live artifact create 模式。
- `create-image-campaign` - image create 模式。
- `create-video-storyboard` - video create 模式。
- `create-hyperframes-launch` - HyperFrames create 模式。
- `export-nextjs-handoff` - export 主类。
- `share-github-pr` - share 主类。
- `deploy-vercel-static` - deploy 主类。
- `refine-critique-loop` - refine 主类。
- `extend-plugin-author` - extend 主类。

使用这些示例作为可复制模式，然后为你的真实插件大幅裁剪。
示例 `open-design-marketplace.json` 在 catalog 顶层有版本，每个 entry 也固定列入的插件版本，便于 registry snapshot 审计。

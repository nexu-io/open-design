# 公开变更记录

## 2026-11-06：独立分发与复刻工作流

- Motion 源码位于 `plugins/motion/`；保持独立 npm lockfile、安装器、MCP 与 Skills，不依赖 OD 的应用私有代码或工作区链接。
- 复刻入口已实现：参考视频使用 motion-recreate，原生工程、重建与验收指引通过同一套 MCP resources 提供。区域测量脚本不把无效范围或测量失败写成成功；一期继续只有九个公开 Tool 和四个 Skills。
- npm 应用归档、插件 ZIP 与完整 ZIP 共用 `scripts/distribution.ts` 的正向清单。只分发运行所需源码、构建资源、指定使用文档、Skills 和许可证；不分发开发测试、Studio 源码、过程记录或发布辅助工具。新增文档和脚本必须显式加入清单。
- 删除上游浏览器统计密钥与网络发送实现，保留编辑器调用接口；自动实验分组关闭。引擎子进程继续使用 `HYPERFRAMES_NO_TELEMETRY=1`。本机编辑、预览、渲染与技术验证不依赖使用统计。
- 验证入口：`npm run check`、`npm run typecheck:studio`、打包与复刻单测、Studio 回归、独立 npm 安装和真实出片验收。具体结果绑定对应 PR 的提交及 CI；没有执行的目标平台或模型回合不记为通过。
- 当前工作流只构建和校验；npm 安装器保持 `private: true`，不发布 npm、Release 或存储对象。本次不增加账户、计费或托管服务。

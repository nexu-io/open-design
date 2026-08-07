# 刻意不要的上游件清单

本文件记录 xDesign fork **刻意不采纳 / 移除** 的上游件。fork-strategy ADR（`adr/0001-fork-strategy.md`）要求每次 upstream sync window（`git merge upstream/<tag>`）前核对这份清单——sync 时这些件会从上游重新进入，必须再次剔除。

每条记录：是什么、为什么不要、如何处理（删除 / 排除）、当前状态、sync 解冲突位置。

## 1. `apps/landing-page`（营销站）

- **是什么**：上游独立的静态 Astro 营销与公开目录站（含 Cloudflare Pages functions、blog/tutorial 内容、21 个测试、`install.sh`）。
- **为什么不要**：xDesign 是企业内部部署，不需要对外营销站。
- **如何处理**：从仓库**整体删除**（目录 + 专用 CI workflow + feishu/blog/youtube 运维脚本 + 所有引用）。`pnpm-workspace.yaml` 用 `apps/*` 通配，删目录即自动出 workspace。
- **sync 解冲突位置**：
  - 目录本身 `apps/landing-page/`
  - 专用 workflow：`.github/workflows/landing-page-{ci,production,staging,daily-feishu}.yml`、`blog-indexing-on-deploy.yml`、`tutorials-youtube-sync.yml`
  - 专用脚本：`.github/scripts/landing-page-{daily,deploy}-feishu.ts`
  - 消费方引用：`scripts/guard.ts`、`scripts/scopes.ts`、`scripts/check-certain-exempt-consumption.ts`、`scripts/source-check.ts`、`.github/labeler.yml`、`.github/workflows/ci.yml`（`--filter '!@open-design/landing-page'`）、`.github/workflows/agent-pr-explore.lock.yml`
  - 断言被删 workflow 的 e2e 测试：`e2e/tests/actions-cache-workflows.test.ts`、`e2e/tests/packaged-smoke-workflow.test.ts`、`e2e/tests/scripts/scopes.test.ts`
- **状态**：✅ 已移除（issue 02）。
- **注意**：`apps/landing-page/public/install.sh` 是对外 install 包装；fork 的安装走 packaged app（issue 01+），不依赖它。若 fork 将来需要 install 脚本，另立 fork 私有件，不从此处恢复。

## 维护约定

- 新增「不要的上游件」时追加条目，写明 sync 时在何处重新剔除。
- 不要把剔除做成「保留但禁用」——残留文件仍是 merge 面，违背减负初衷，除非该件无法整体删除（如散落在多文件的字面量，改走 identity 覆盖清单 `identity-coverage.md`）。

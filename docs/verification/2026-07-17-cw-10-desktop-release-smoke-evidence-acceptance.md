# CW-10 桌面真实发布 smoke 证据闭环 — 验收文档（Task 5）

> 分支：`feat/cw-10-release-smoke-evidence` · 工作树：`.worktrees/cw-10-release-smoke-evidence`
> 基线：`main @ 0cd3bf139` · 本轮 remediation 父提交（分支 tip）：`ac4d87b12`
> 提交顺序：`docs: design ...` → `test/feat: add machine-readable ... (G6-G10)` → `docs: verify desktop release smoke evidence` → **`fix: verify desktop release gate evidence`**
> **未合并 / 未推送 / 未删除** 任何分支或工作树（见末尾声明）。

---

## 0. 重要声明（无虚假真实 PASS）

- **本工作树运行于 Linux（非 `win32`/`darwin`）**。既有 `e2e/specs/win.spec.ts` 与 `e2e/specs/mac.spec.ts` 通过 `describe.skip` + `process.platform` 守卫：仅在目标平台真实运行安装/启动/升级/回滚/离线流程。因此**在本 sandbox 中真实 Windows/macOS smoke 被跳过**，CI 实际运行时会由 `release-smoke.ts` 写出 `release-gates-evidence.json`，**绝不以 mock 声称 PASS**（满足任务要求 #4）。
- 本轮交付的是 **CW-09 G6–G10 的可重复 CI 验收证据基础设施**：机器可读证据结构 + 工件 SHA-256 + 工作流证据留存。其**正确性**由绿灯单元测试 / 类型检查 / 发布工作流契约测试验证；**真实 PASS** 待 Windows/macOS CI 产出安装包后由同一流水线产出。
- 所有测试仅用 `mkdtemp` 临时目录与 fixture，**未触碰**真实 `.od`、用户素材、运行中的守护进程 / Web / Electron。

---

## 0.1 CW-10 审核整改（本 `fix:` 提交覆盖的 P0 / P1 / P2）

审核发现原实现存在"无真实测量即声称 PASS"的证据诚信缺口。本 `fix:` 提交按审核意见闭环：

- **P0 — G7 不再接受 `null` 即 PASS**（`e2e/lib/vitest/release-gates-evidence.ts`）：
  - `summarizePackagedReleaseGates` 中，G7 **仅当** `dataRootIntegrity.measured === true && dataRootIntegrity.consistent === true`（即升级前后对 `dataRoot/creator-workbench|creator-media|creator-content|creator-release|creator-performance` + `backups/creator` 做了真实内容指纹比对且一致）才 `PASS`。
  - 未测量（`dataRootIntegrity` 缺失或 `measured === false`）→ **`BLOCKED`**（理由："dataRoot + backups/creator content-integrity not measured across upgrade in this profile"）。
  - 指纹发散 → **`FAIL`**（理由："dataRoot or backups/creator content diverged across upgrade"）。
  - 内容指纹 `computeContentFingerprint` 与遍历顺序无关、与绝对路径无关、与 mtime 无关（仅依赖 `相对路径 + 文件大小 + 内容 SHA-256`）。
- **P1 — Windows full profile 真实执行 G8 / G9 失败路径**（`e2e/specs/win.spec.ts`）：
  - **G8（checksum-mismatch 保持旧版本）**：在成功升级前，取 fixture 真实 metadata，篡改其 `payloadSha256` 为 `deadbeef…`，由本地 HTTP server（`createServer`，端口 0）对外提供；更新环境变量后先重启桌面进程（updater 只在进程启动时读取配置），再通过真实 `tools-pack inspect --update-action download` 触发下载，必须观察到 `update.error.code === "checksum-mismatch"`。随后断言**原版本仍健康、dataRoot 指纹不变**；不吞掉失败路径错误。
  - **G9（metadata 不可达离线启动）**：在成功升级前把 updater 指向 `http://127.0.0.1:1/metadata.json`（不可达），重启桌面进程使其继承该 URL，通过真实 `tools-pack inspect --update-action check` 触发检查并断言 `update.error.code === "metadata-unreachable"`，再验证该离线启动的应用仍健康、dataRoot 指纹不变。
  - **G7（真实可观察内容）**：在升级前仅向 CI 临时命名空间的五个 Creator 存储目录和 `backups/creator` 写入种子文件，分别保存六个指纹；成功升级后逐项比对，任何缺失或发散均不得 PASS。
  - 三者仅在 `!verifyCoreOnly && beforeDataFingerprint` 时执行；仅用 runner fixture HTTP server + CI 临时目录，**无任何 mock PASS**。
  - **core profile 或 macOS → G7/G8/G9 一律 `BLOCKED`，附准确理由**（macOS 本轮未实现同等真实测量/失败路径，绝不假称 PASS）。
- **P2 — 大文件不再整读**（`byteLengthOf` 改用 `statSync(path).size`，不再 `readFileSync` 整个工件）；SHA-256 仍走流式 `createReadStream`。
- **测试与文档**：新增/更新 29 个聚焦单元测覆盖 G7 未测→BLOCKED、一致→PASS、发散→FAIL、G8/G9 未执行→BLOCKED、真实执行成功→PASS、stat 取大小不整读；更新 Windows smoke 真实失败路径与指纹采集；本验收文档去除"G7 健康即 PASS / CI 预期 PASS 而无可执行失败场景"表述。

---

## 1. 调研来源（GitHub 官方实践）

详见 `docs/plans/CW-10-desktop-release-smoke-evidence-research.md`。要点（高 Star 官方仓库优先）：

| 项目 | Star（约，2026-07） | License | 采纳原则 |
| --- | --- | --- | --- |
| `electron/electron` | ~122k | MIT | 运行时底座；官方 `autoUpdater` 仅 macOS/Windows；本项目自建 `updater.ts` 复用同一失败→ERROR 模型。 |
| `electron-userland/electron-builder` | ~14.6k | MIT | 打包/分发标准；自带 `electron-updater`。**本项目明确禁止引入 electron-updater 或另一套发布机制**，仅复用既有自建 `tools-pack` + `updater.ts`。 |
| `actions/upload-artifact` | ~48k（action 生态） | MIT | 制品不可变、默认 90 天保留；`if: always()` 失败也上传；`retention-days` 1–90；矩阵命名加前缀/后缀。本仓库用 `@v7`，沿用。 |

采纳铁律（与 CW-09 一致）：**用户数据与应用二进制/更新载荷严格分离**；回滚只影响载荷不触数据；离线优雅降级；下载校验。CW-10 仅"补齐证据闭环"，**不改变发布机制**。

---

## 2. G6–G10 证据映射（本轮核心交付）

| # | 发布门禁 | 证据采集点（真实平台运行时） | 机器可读证据字段 | CI 命令（产出证据） |
| --- | --- | --- | --- | --- |
| G6 | 冷启动安装成功 | `win/mac.spec.ts`：`install.ok` + `start.ok` | `release-gates-partial.json` → `gates.G6.status` | `pnpm exec tsx scripts/release-smoke.ts win specs/win.spec.ts` |
| G7 | 升级前后 `dataRoot` 与 `backups/creator` 内容一致（**真实指纹**） | `full` profile：升级**前**测 `beforeDataFingerprint`，升级**后**测 `afterCombined` + 各子目录指纹，比对 | `gates.G7.status` + `evidence.beforeFingerprint/afterFingerprint/measured/consistent/dirs`（来自 `dataRootIntegrity`） | 同上（`full` profile 跑真实比对；`core`/macOS 不测 → BLOCKED） |
| G8 | 校验失败（checksum-mismatch）进程级回滚旧版本且数据未动 | `full` profile：篡改 metadata `payloadSha256`，本地 HTTP 提供，跑真实更新；断言旧版本仍健康、指纹不变 | `gates.G8.status` + `evidence.scenario/failureCode/oldVersion/beforeFingerprint/afterFingerprint`（来自 `rollback`） | 同上（`full` profile 失败路径用例；`core`/macOS 不执行 → BLOCKED） |
| G9 | metadata 不可达时已安装应用仍可离线启动且数据未动 | `full` profile：updater 指向不可达地址，停止再启动；断言健康 + 指纹不变 | `gates.G9.status` + `evidence.metadataUnreachable/beforeFingerprint/afterFingerprint`（来自 `offline`） | 同上（metadata-unreachable 用例；`core`/macOS 不执行 → BLOCKED） |
| G10 | smoke 报告写明 artifact SHA-256/版本/commit/平台/执行 profile | `release-smoke.ts` 计算 `installerPath`/`payloadPath`/`portableZipPath` 的 SHA-256（仅 `stat` 取大小，流式哈希） | 顶层 `releaseVersion`/`commit`/`platform`/`profile` + `gates.G10.evidence.artifactHashes[]` | 同上（读取 `tools-pack` build JSON） |

**证据落盘链路**：
1. 真实平台 spec 运行成功后写 `release-report/<platform>/release-gates-partial.json`（G6–G9 信号：`installOk`/`startOk`/`dataRootIntegrity`/`rollback`/`offline`）。
2. `release-smoke.ts` 读取 build JSON → `collectArtifactHashes()` 计算工件 SHA-256 → `buildReleaseGatesEvidence()` 合并 spec 部分门禁与工件哈希 → 写 `release-report/<platform>/release-gates-evidence.json`（G6–G10 全结构）。
3. 工作流 `if: always()` 上传：
   - 既有 `open-design-release-{win,mac}-e2e-report`（`release-report/<platform>` 整目录，含截图 `screenshot.png` + `summary.json`）。
   - 新增 `open-design-release-{win,mac}-release-gates-evidence`（`release-gates-evidence.json` + `manifest.json`）。
4. **关键修复**：原 `Cleanup workflow artifacts` 步骤 `success()` 时以空 `ARTIFACT_NAME_REGEX` 删除**全部**制品（含 smoke 报告），与要求 #5 冲突。现将其限定为 `-release-assets$`，使 smoke 报告与证据在成功发布后**留存**（不被成功路径清理的唯一中间 artifact 吞掉）。

---

## 3. Smoke 矩阵：本 sandbox 状态 / CI 真实执行预期

> 本列"本 sandbox 结果"为 Linux 环境实际可验证状态；"Windows/macOS 真实执行预期"为流水线在真机产出安装包后的预期（由同一证据机制产出，无 mock）。**只有真正被执行且有可执行失败场景的 profile 才可能被标记 PASS；未执行测量的 profile 一律 BLOCKED。**

| # | 发布门禁 | 本 sandbox 结果 | Windows 真实执行预期 | macOS 真实执行预期 | 证据 |
| --- | --- | --- | --- | --- | --- |
| G6 | 冷启动安装成功 | **BLOCKED**（非 win32/darwin，spec 跳过） | PASS（真实安装+启动，core/full 均跑） | PASS（真实安装+启动，core/full 均跑） | `release-gates-evidence.json#gates.G6`、截图 `screenshot.png` |
| G7 | 升级后 data/备份内容一致（真实指纹） | **BLOCKED**（未测） | **full：PASS**（升级前后真实内容指纹比对一致）；**core：BLOCKED**（未测） | **BLOCKED**（本轮未实现同等真实测量；不声称 PASS） | `release-gates-evidence.json#gates.G7` + `evidence.dirs[]` |
| G8 | 校验失败回滚旧版本且数据未动 | **BLOCKED**（失败路径未执行） | **full：PASS**（注入 checksum-mismatch→真实进程级回滚，指纹不变）；**core：BLOCKED** | **BLOCKED**（未实现失败路径；不声称 PASS） | `release-gates-evidence.json#gates.G8` + `evidence.failureCode` |
| G9 | 离线启动（metadata 不可达） | **BLOCKED**（未执行） | **full：PASS**（metadata 不可达仍健康启动，指纹不变）；**core：BLOCKED** | **BLOCKED**（未实现；不声称 PASS） | `release-gates-evidence.json#gates.G9` + `evidence.metadataUnreachable` |
| G10 | 报告含工件 SHA-256/版本/commit/平台/profile | **BLOCKED**（sandbox 无构建产物可哈希） | PASS（`collectArtifactHashes` 写入 `artifactHashes`，stat 取大小 + 流式哈希） | PASS（同上） | `release-gates-evidence.json#gates.G10` + 顶层字段 |

> **为何不声称 PASS（审核核心）**：审核要求 G7 不得仅凭"健康即 PASS"、G8/G9 不得"无可执行失败场景却预期 PASS"。
> - **Windows full profile** 现已内建可执行失败场景（G8 checksum-mismatch、G9 metadata-unreachable）与真实升级前后指纹采集，故可被真实标记为 PASS/FAIL（由运行时数据决定）。
> - **Windows core profile** 与 **macOS** 本轮未执行真实测量/失败路径，因此 G7/G8/G9 **诚实 BLOCKED**，理由精确到"not measured / not exercised in this profile"，**绝不假称 PASS**（满足任务要求 #4）。

---

## 4. 验证命令 / 环境 / 临时目录策略

**环境**
- Node（托管）：`/c/Users/1/.workbuddy/binaries/node/versions/22.22.2`（v22.22.2）。
- `NODE_OPTIONS=--use-system-ca` 会阻断 tsc/vitest → 每条命令前清 `NODE_OPTIONS=`（`corepack pnpm` 垫片缺失，直接用 `pnpm`）。
- 依赖：`pnpm install --offline --frozen-lockfile`（共享 pnpm store，43s 级）。

**临时目录策略（绝不触碰真实数据）**
- 新增单元测 `e2e/tests/release-gates-evidence.test.ts` 全部用 `mkdtemp(join(tmpdir(),'cw10-evidence-'))` 生成绝对临时根，写入 `hello`/`payload-bytes` 等占位内容计算 SHA-256；`afterAll` 清理。含 4MB 大文件验证 `byteLengthOf` 走 `stat` 不整读。
- 既有 `win/mac.spec.ts` 仅在目标平台运行，使用 CI runner 临时目录与 fixture，读写被 `assertRelativeReportPath` 约束在 `release-report/<platform>` 内，**不触碰**真实 `.od`/用户素材/运行目录。

**实际执行的验证命令与结果（本 sandbox，remediation 后）**

```
# 1) 定向新增/更新测试（核心证据逻辑，全绿）
cd e2e && NODE_OPTIONS= pnpm exec vitest run tests/release-gates-evidence.test.ts
  -> Test Files  1 passed (1); Tests 29 passed (29)
     覆盖：computeFileSha256；collectArtifactHashes(stat 取大小、4MB 不整读、缺文件跳过、相对路径)；
           computeContentFingerprint(同内容不同绝对根→同指纹、遍历序无关、发散→不同、缺失根记录、
             resolveDataRootFingerprintPaths 6 路径与 OS 无关)；
           G6 PASS/FAIL；G7 未测→BLOCKED / 一致→PASS / 发散→FAIL / 回归守卫(无测量≠PASS)；
           G8 未执行→BLOCKED / 执行成功→PASS / FAIL；G9 同；no-mocked-PASS；
           buildReleaseGatesEvidence(G10、合并、跳过 BLOCKED、顶层结构)。

# 2) 类型检查（直接 tsc，规避 corepack / NODE_OPTIONS 干扰）
NODE_OPTIONS= pnpm --filter @open-design/e2e      exec tsc -p tsconfig.json --noEmit  -> 0
NODE_OPTIONS= pnpm --filter @open-design/tools-pack exec tsc -p tsconfig.json --noEmit -> 0
NODE_OPTIONS= pnpm --filter @open-design/desktop   exec tsc -p tsconfig.json --noEmit  -> 0

# 3) 发布工作流契约测试（所改 release-stable/preview YAML 必须通过；remediation 未改 YAML）
cd tools/pack && NODE_OPTIONS= pnpm exec vitest run tests/release-workflows.test.ts
  -> Test Files  1 passed (1); Tests 1 passed (1)   # 含 tsx scripts/release-smoke.ts 调用、
                                                     #   publish:/cleanup_partial_release_assets 作业、
                                                     #   RELEASE_ARTIFACT_MODE: all、RELEASE_COMMIT≥5×、
                                                     #   open-design-release-win-x64-publish-manifest 等 ~200 标记

# 4) e2e 侧契约测试（次要，含 1 个无关预存在失败）
cd e2e && NODE_OPTIONS= pnpm exec vitest run tests/packaged-smoke-workflow.test.ts
  -> Test Files  1 failed (1); Tests 34 passed | 1 failed (35)
  ⚠ 失败项：[P2] bake-plugin-previews-pr.yml "permissions:\n  contents: read"
     —— 预存在失败，与 CW-10 无关：该工作流文件用 CRLF 行尾，而断言用 `\n` 匹配；
        CW-10 未改动 bake-plugin-previews-pr.yml 或该测试文件（git diff 为空）。

# 5) 差异 / 工作树检查（提交后执行）
git diff --check main...HEAD   -> 无空白/换行问题（exit 0）
git status --short             -> 干净（4 个提交已落，无未跟踪文件）
```

---

## 5. 证据结构（机器可读 schema）

`release-report/<platform>/release-gates-evidence.json` 顶层：

```jsonc
{
  "schemaVersion": "1.0.0",
  "platform": "win",                 // win | mac
  "channel": "stable",               // stable | preview
  "releaseVersion": "x.y.z",
  "commit": "<sha>",
  "githubRunId": "...",
  "githubRunAttempt": "...",
  "namespace": "release-beta-win",
  "profile": "core|full",            // 执行 profile
  "reportPath": "...",
  "generatedAt": "<iso>",
  "skipReason": "...",               // 平台跳过时非空，否则缺失
  "gates": {
    "G6":  { "id":"G6", "title":"cold-start install success",      "status":"PASS|BLOCKED|FAIL", "evidence": {...}, "reason":"..." },
    "G7":  { "id":"G7", "title":"dataRoot + backups/creator content-identical across upgrade (measured)", "status":...,
             "evidence": { "measured":true, "consistent":true, "beforeFingerprint":"...", "afterFingerprint":"...", "dirs":[...] }, "reason":"..." },
    "G8":  { "id":"G8", "title":"payload/checksum failure -> process-level rollback to prior version, data intact", "status":...,
             "evidence": { "scenario":"checksum-mismatch", "failureCode":"checksum-mismatch", "oldVersion":"...", "beforeFingerprint":"...", "afterFingerprint":"..." }, "reason":"..." },
    "G9":  { "id":"G9", "title":"metadata unreachable -> installed app still offline-starts, data untouched", "status":...,
             "evidence": { "metadataUnreachable":true, "beforeFingerprint":"...", "afterFingerprint":"..." }, "reason":"..." },
    "G10": { "id":"G10","title":"smoke report records artifact SHA-256/version/commit/platform/profile", "status":..., "evidence":{ "artifactCount":N, "artifactHashes":[{"name":"payload","sha256":"...","bytes":N,"path":"..."}], "releaseVersion":"...", "commit":"...", "platform":"win", "profile":"full" }, "reason":"..." }
  }
}
```

- `status` 取值 `PASS | FAIL | BLOCKED`；`BLOCKED` 必带 `reason`（"platform smoke skipped" / "dataRoot + backups/creator content-integrity not measured across upgrade in this profile" / "failure-path (bad-payload/checksum-mismatch) scenario not exercised in this profile" / "metadata-unreachable scenario not exercised in this profile" / "no artifacts to hash"）。
- **G7 的诚信铁律（P0）**：`dataRootIntegrity` 未测量（缺失或 `measured=false`）→ 永远是 `BLOCKED`，**绝不会因 `null` 而被判 PASS**。`consistent=false` → `FAIL`。
- 失败路径（G8/G9）未执行时**只可能 BLOCKED 或 FAIL，绝不为 PASS**——由单元测 `never mocks PASS for unexercised failure paths` 固化。

---

## 6. 新增/修改文件清单（证据闭环 + 本 remediation）

| 文件 | 变更 | 作用 |
| --- | --- | --- |
| `e2e/lib/vitest/release-gates-evidence.ts` | 修改（remediation） | P0：`summarizePackagedReleaseGates` G7 仅真实测量一致才 PASS；P2：`byteLengthOf` 改 `statSync` 不整读；新增 `computeContentFingerprint` / `resolveDataRootFingerprintPaths` / 稳定内容指纹；信号类型改为 `dataRootIntegrity`/`rollback`/`offline` |
| `e2e/specs/win.spec.ts` | 修改（remediation） | P1：full profile 真实采集升级前/后 `dataRoot` 指纹（G7）；真实执行 checksum-mismatch 回滚（G8）与 metadata-unreachable 离线启动（G9）；core profile 留 BLOCKED |
| `e2e/specs/mac.spec.ts` | 修改（remediation） | 跟随新信号形状（`dataRootIntegrity`/`rollback`/`offline`）；macOS 本轮未实现真实测量/失败路径 → G7/G8/G9 诚实 BLOCKED，理由准确 |
| `e2e/tests/release-gates-evidence.test.ts` | 修改（remediation，17 → 29） | 覆盖 G7 未测→BLOCKED/一致→PASS/发散→FAIL、G8/G9 未执行→BLOCKED/执行成功→PASS、stat 取大小不整读、合并与顶层结构 |
| `e2e/scripts/release-smoke.ts` | 修改（前序） | 计算工件 SHA-256（仅 stat 取大小 + 流式哈希），合并 spec 部分门禁，写 `release-gates-evidence.json` |
| `.github/workflows/release-stable.yml` | 修改（前序） | 限定 `Cleanup workflow artifacts` 为 `-release-assets$`；新增 `open-design-release-{win,mac}-release-gates-evidence` 上传（`if: always()`） |
| `.github/workflows/release-preview.yml` | 修改（前序） | 同上（preview 通道对称） |
| `docs/verification/2026-07-17-cw-10-desktop-release-smoke-evidence-acceptance.md` | 修改（本 remediation） | 去除"G7 健康即 PASS / CI 预期 PASS 无失败场景"表述；记录 P0/P1/P2 修复与真实失败路径证据 |

> **未改动**：`package.json` / `pnpm-lock.yaml` / 设计系统 / 真实数据 / 既有发布机制（无 electron-updater 引入）。既有 `tsx scripts/release-smoke.ts win/mac specs/*.spec.ts` 调用签名保持不变，发布工作流契约测试全绿。

---

## 7. 未执行项与阻塞原因（与 CW-09 一致 + 本轮收窄）

| 项 | 阻塞原因 | 解除前置（同一流水线，无需改代码） |
| --- | --- | --- |
| G6–G9 真实安装/升级/离线/回滚 | 本 sandbox 非 win32/darwin，spec 跳过 | Windows/macOS CI runner 产出安装包后由 `release-smoke.ts` 真实执行 |
| G10 真实工件 SHA-256 | sandbox 无构建产物 | `tools/pack` 在 CI 产出 `installerPath`/`payloadPath` 后由 `collectArtifactHashes` 计算 |
| macOS G7/G8/G9 | 本轮未实现等效真实测量/失败路径（审核允许 macOS 保持 BLOCKED） | 后续补 macOS full profile 真实指纹采集与失败路径后，可由同一证据机制产出（当前诚实 BLOCKED，不声称 PASS） |
| Windows core profile G7/G8/G9 | core profile 不跑升级/失败路径 | 切换 `OD_PACKAGED_E2E_WIN_SMOKE_PROFILE=full` 后执行 |

> CW-10 已把"证据如何从真实运行产出"完全打通（含真实失败路径）；剩余仅为**平台/产物 availability**与**macOS 真实测量补全**，非代码诚信缺口。

---

## 8. 提交清单（无 Co-Authored-By 尾注）

1. `docs: design desktop release smoke evidence` — 新增 `docs/plans/CW-10-desktop-release-smoke-evidence-research.md`（GitHub 调研 + G6–G10 精确映射）。
2. `test/feat: add machine-readable desktop release smoke evidence (G6-G10)` — 新增证据模块/单元测，修改 `release-smoke.ts`/`win.spec.ts`/`mac.spec.ts`/两个 release 工作流（7 文件）。
3. `docs: verify desktop release smoke evidence` — 首版验收文档。
4. **`fix: verify desktop release gate evidence`** — 本审核整改：P0 G7 不再接受 `null`→PASS；P1 Windows full profile 真实执行 G8/G9 失败路径 + 升级前后真实内容指纹；P2 `byteLengthOf` 改 `stat` 不整读；29 个聚焦单元测；类型检查/契约测试全绿；本验收文档去"假 PASS"表述。**无 `Co-Authored-By`**。
5. **`fix: restart desktop before successful upgrade after G8/G9 failure paths`**（独立验收复核 2026-07-18）— P0：G8/G9 助手以坏 URL 重启桌面后，成功升级前必须再以恢复的正常 URL 重启桌面，否则运行中的桌面仍持死链/篡改 URL 导致 `inspect --update-action download` 超时失败。详见 §10。**无 `Co-Authored-By`**。

---

## 9. 分支 / 工作树状态声明

- 分支 `feat/cw-10-release-smoke-evidence` 基于 `main @ 0cd3bf139`，位于工作树 `.worktrees/cw-10-release-smoke-evidence`；remediation 叠加于分支 tip `ac4d87b12` 之上。
- **未合并**到 `main`，**未推送**到远程，**未 rebase / reset / force**，**未删除**任何既有分支或工作树。
- 仅新增/修改文档、测试与发布工作流 YAML；未改动 `package.json` / `pnpm-lock.yaml` / 依赖版本 / 既有源码逻辑 / 设计系统；**未引入 electron-updater 或另一套发布机制**。
- **真实用户数据 / 真实运行目录 / 真实 `.od` 资产未读取、未写入、未删除**；禁用分支/工作树破坏性 git 操作。
- 构建产物（`apps/*/dist`、`node_modules`）为 gitignored，未纳入提交。

---

## 10. 独立验收复核（2026-07-18）

独立复核（不信任先前报告，直接看真实 diff 与运行时调用链）结论：**发现并修复 1 个 P0**，其余 G6–G10 真实 PASS/BLOCKED 条件成立。

### 10.1 复核范围与调用链
- 运行时：`tools/pack/src/win/lifecycle.ts` —— `inspectPackedWinApp` 对 `updateAction` 走 `requestJsonIpc(stamp.ipc, { type: SIDECAR_MESSAGES.UPDATE })`，确认 `inspect --update-action download/check` 是发往**已运行桌面**的真实 IPC（非独立检查）。
- 错误码真实性：`apps/desktop/src/main/updater.ts` 真实存在 `createError("checksum-mismatch", …)`（行 1107/2782/2986）与 `createError("metadata-unreachable", …)`（行 2694）；`createError(code, …)` 以首参写入 `error.code`。
- 环境变量时序：`applyPackagedUpdateEnv` 仅写 `process.env`（不落盘）；桌面 `resolveDesktopUpdaterConfig` 从自身 `process.env` 取值，进程启动即冻结。故改 CLI 的 `process.env` 对**已运行桌面无效**，必须重启桌面生效（即提交 `70196f822` "restart desktop before release gate checks" 的出发点）。

### 10.2 P0：成功升级前缺少重启（运行时链路缺陷）
- 现象：G8（`checksum-mismatch`）与 G9（`metadata-unreachable`）助手各自 `stop`+`start` 桌面以坏 URL 重启；随后主流程仅把正常 URL 写回 CLI 的 `process.env`，却**未重启桌面**。
- 后果：`runPayloadUpdateAcceptance` → `waitForDownloadedUpdater` 立即轮询 `inspect --update-action download`，运行中的桌面仍持死链/篡改 URL → `metadata-unreachable` → 120s 超时抛错，整个 full profile 成功升级路径失败。
- 修复（`e2e/specs/win.spec.ts`）：恢复 URL 后、成功升级前增加 `stop`+`start`，使桌面继承正常 URL；覆盖 `payloadFixture` 与 `updateMetadataUrl` 两种来源。
- 测试覆盖：该路径属 Windows CI 的 e2e spec 本身（仅 win32 runner 执行）；本 sandbox 以 `tsc --noEmit` 校验类型，29 个单元测与发布工作流契约测全绿。重启时序无法在 Linux 单测复现，以 e2e spec 为覆盖。

### 10.3 其余项确认
- G7：种子写入 5 个 Creator 数据目录 + `backups/creator`；升级前后分别保存 6 个内容指纹；指纹与绝对路径/mtime/遍历序无关；未测/缺目录/内容不同 → BLOCKED/FAIL 不 PASS。✓
- G8/G9：真实 IPC + 重启 + 观测 `error.code`，且 `ok` 同时要求错误码、原版本健康、数据指纹不变（非仅凭版本相等判 PASS）。✓
- G10：`collectArtifactHashes` 流式 SHA-256 + `statSync` 取大小；工作流 `cleanup-artifacts.sh` 仅删 `-release-assets$`，证据与 e2e report 留存。✓
- macOS：G7/G8/G9 诚实 BLOCKED（信号为 `undefined`）。✓

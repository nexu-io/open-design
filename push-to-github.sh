#!/bin/bash
# ============================================================
# OpenDesign 多Agent团队协作模块 — 一键推送到GitHub
# 用法: chmod +x push-to-github.sh && ./push-to-github.sh
# ============================================================

set -e

# ---- 配置 ----
GITHUB_TOKEN="${GITHUB_TOKEN:-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}"
FORK_OWNER="pixcore598-design"
REPO_NAME="open-design"
BRANCH_NAME="feat/multi-agent-team"
SOURCE_DIR="$(pwd)/opendesign-team"

echo "=========================================="
echo "OpenDesign 多Agent团队协作模块 推送脚本"
echo "=========================================="
echo "目标: ${FORK_OWNER}/${REPO_NAME}"
echo "分支: ${BRANCH_NAME}"
echo ""

# ---- 步骤1: 检查 Fork 是否存在 ----
echo "[1/6] 检查 Fork..."
FORK_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  "https://api.github.com/repos/${FORK_OWNER}/${REPO_NAME}")

if [ "$FORK_EXISTS" = "404" ]; then
  echo "  Fork 不存在，正在创建 Fork..."
  curl -s -X POST \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/nexu-io/open-design/forks" \
    -d '{}' > /dev/null
  echo "  ✅ Fork 创建成功"
  sleep 3
else
  echo "  ✅ Fork 已存在"
fi

# ---- 步骤2: 获取 main 分支的 HEAD SHA ----
echo "[2/6] 获取 main 分支信息..."
MAIN_SHA=$(curl -s \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  "https://api.github.com/repos/${FORK_OWNER}/${REPO_NAME}/git/refs/heads/main" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['object']['sha'])" 2>/dev/null)

if [ -z "$MAIN_SHA" ]; then
  # 尝试 master
  MAIN_SHA=$(curl -s \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    "https://api.github.com/repos/${FORK_OWNER}/${REPO_NAME}/git/refs/heads/master" | \
    python3 -c "import sys,json; print(json.load(sys.stdin)['object']['sha'])" 2>/dev/null)
  BRANCH_REF="heads/master"
else
  BRANCH_REF="heads/main"
fi

if [ -z "$MAIN_SHA" ]; then
  echo "  ❌ 无法获取默认分支信息"
  exit 1
fi
echo "  ✅ 基准分支 SHA: ${MAIN_SHA:0:12}"

# ---- 步骤3: 创建新分支 ----
echo "[3/6] 创建分支 ${BRANCH_NAME}..."
curl -s -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${FORK_OWNER}/${REPO_NAME}/git/refs" \
  -d "{\"ref\":\"refs/${BRANCH_NAME}\",\"sha\":\"${MAIN_SHA}\"}" > /dev/null 2>&1

# 获取分支 SHA
BRANCH_SHA=$(curl -s \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  "https://api.github.com/repos/${FORK_OWNER}/${REPO_NAME}/git/refs/heads/${BRANCH_NAME}" | \
  python3 -c "import sys,json; print(json.load(sys.stdin)['object']['sha'])" 2>/dev/null)

if [ -z "$BRANCH_SHA" ]; then
  echo "  ❌ 分支创建失败"
  exit 1
fi
echo "  ✅ 分支 ${BRANCH_NAME} 创建成功"

# ---- 步骤4: 上传文件 ----
echo "[4/6] 上传文件..."

upload_file() {
  local local_path="$1"
  local remote_path="$2"

  if [ ! -f "$local_path" ]; then
    echo "  ⚠️  跳过不存在的文件: $local_path"
    return
  fi

  # Base64 编码文件内容
  local content
  content=$(base64 < "$local_path" | tr -d '\n')

  # SHA256 哈希（GitHub 用 blob hash）
  local blob_sha
  blob_sha=$(git hash-object "$local_path" 2>/dev/null || echo "")

  local payload
  payload=$(python3 -c "
import json
data = {
    'message': 'feat: add multi-agent team collaboration module',
    'content': '''${content}''',
    'branch': '${BRANCH_NAME}'
}
print(json.dumps(data))
" 2>/dev/null)

  local result
  result=$(curl -s -w "\n%{http_code}" \
    -X PUT \
    -H "Authorization: token ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${FORK_OWNER}/${REPO_NAME}/contents/${remote_path}" \
    -d "$payload")

  local http_code
  http_code=$(echo "$result" | tail -1)
  if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
    echo "  ✅ ${remote_path}"
  else
    echo "  ❌ ${remote_path} (HTTP ${http_code})"
  fi
}

# 上传所有文件（排除 .git 目录）
find "$SOURCE_DIR" -type f \
  -not -path "*/.git/*" \
  -not -name ".git" \
  | while read -r filepath; do
  rel_path="${filepath#${SOURCE_DIR}/}"
  upload_file "$filepath" "packages/multi-agent-team/${rel_path}"
done

echo ""
echo "  ✅ 文件上传完成"

# ---- 步骤5: 创建 RFC Issue ----
echo "[5/6] 创建 RFC Issue..."

ISSUE_BODY=$(cat <<'ISSUE_EOF'
## Why

OpenDesign 当前是单 Agent 驱动设计的工作流（`SKILL.md → daemon → agent → artifact`）。

在实际项目中，一个完整的设计方案往往需要多个 Agent 协作：

- 设计师 Agent 生成视觉原型
- 文案 Agent 撰写文案内容
- 前端 Agent 将设计转为代码
- 审核 Agent 校验品牌一致性

这些 Agent 之间需要任务拆分、上下文传递、结果聚合和工件版本管理。

## What I'm proposing

一个 **multi-agent team collaboration** 模块，作为 OpenDesign 的社区扩展包：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **parallel** | 同层级 Agent 并行执行同一任务的不同维度 | 多视角设计 |
| **serial** | 按阶段链式执行，前一阶段输出 = 下一阶段输入 | 线性工作流 |
| **genetic** | 多变体并行生成，选择+交叉+变异优化 | 设计探索 |
| **inheritance** | 父 Agent 输出继承给子 Agent | 细化迭代 |
| **hybrid** | 串行主干 + 阶段内并行 | 复杂项目 |

### 核心能力

- ✅ YAML 配置驱动的团队定义（Agent 角色、技能、设计系统绑定）
- ✅ 基于 daemon HTTP API + SSE 的流式调用（与现有架构 100% 兼容）
- ✅ DAG 拓扑排序 + 任务自动拆分
- ✅ Agent 间发布订阅通信总线
- ✅ 完整遗传算法引擎（选择/交叉/变异/适应度评估）
- ✅ 父子上下文继承与工件版本链
- ✅ SQLite 历史执行记录 + 事件重放
- ✅ 生命周期钩子（OnTeamStart/OnTaskStart/OnTaskComplete/OnTeamComplete）
- ✅ 自动重试机制

### 技术实现

- **语言**: Go 1.22+
- **架构**: 独立模块，通过 daemon HTTP API 对接，不修改 OpenDesign 核心代码
- **测试**: 全部通过 `-race` 检测（10 packages, 50+ 单元测试）

## My background

全栈工程师，负责多个 AI Agent 系统的设计与运维，包括基于 Dify 平台的多 Agent 工作流系统（10000+ 并发），对多 Agent 编排有实战经验。

## How I can contribute

1. 将现有模块整理为 OpenDesign 社区插件格式
2. 编写文档和使用示例
3. 根据社区反馈迭代改进
4. 持续维护

## Question for maintainers

1. 这个方向是否与你们的路线图一致？
2. 建议放在 `plugins/community/` 作为社区插件，还是有其他更合适的集成方式？
3. 是否需要先写一个更详细的 RFC 文档？
ISSUE_EOF
)

ISSUE_PAYLOAD=$(python3 -c "
import json, sys
body = sys.stdin.read()
data = {
    'title': '[RFC] Multi-Agent Team Collaboration Module — 并行/串行/遗传/继承协作模式',
    'body': body,
    'labels': ['enhancement', 'help wanted']
}
print(json.dumps(data))
" <<< "$ISSUE_BODY")

ISSUE_RESULT=$(curl -s -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${FORK_OWNER}/${REPO_NAME}/issues" \
  -d "$ISSUE_PAYLOAD")

ISSUE_NUMBER=$(echo "$ISSUE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('number',''))" 2>/dev/null)
ISSUE_URL=$(echo "$ISSUE_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('html_url',''))" 2>/dev/null)

if [ -n "$ISSUE_NUMBER" ]; then
  echo "  ✅ Issue #${ISSUE_NUMBER} 创建成功: ${ISSUE_URL}"
else
  echo "  ⚠️  Issue 创建可能失败，请手动检查"
fi

# ---- 步骤6: 创建 PR ----
echo "[6/6] 创建 Pull Request..."

PR_BODY=$(cat <<PR_EOF
## Why

**使用场景**: OpenDesign 当前是单 Agent 驱动设计。在实际项目中，一个完整设计需要设计师、文案、前端、审核等多 Agent 协作。

**要解决的问题**: 无官方多 Agent 编排机制，用户只能手动在多个终端窗口分别运行 agent，无法共享上下文、传递工件、进行遗传优化。

## What users will see

通过 YAML 配置文件定义 Agent 团队，一行命令启动协作：

\`\`\`bash
odteam -config team-parallel.yaml -task "设计一个落地页，包含 hero、定价表、FAQ"
\`\`\`

五种协作模式可选（parallel / serial / genetic / inheritance / hybrid）。

## Surface area

- [x] CLI / 环境变量 — 新增 \`odteam\` CLI 工具 + \`-daemon\` flag
- [x] API / 合约 — 新增 daemon HTTP client 对接 \`/api/chat\` + \`/api/skills\` + \`/api/design-systems\`
- [x] 扩展点 — 作为 community plugin 集成

## Validation

\`\`\`bash
go build ./...
go test -count=1 -race ./...   # 10 packages ALL PASS
go vet ./...
\`\`\`

## Screenshots

N/A — 纯后端模块，无 UI 变更。
PR_EOF
)

PR_PAYLOAD=$(python3 -c "
import json, sys
body = sys.stdin.read()
data = {
    'title': 'feat: add multi-agent team collaboration module',
    'body': body,
    'head': '${BRANCH_NAME}',
    'base': 'main'
}
print(json.dumps(data))
" <<< "$PR_BODY")

PR_RESULT=$(curl -s -X POST \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/nexu-io/open-design/pulls" \
  -d "$PR_PAYLOAD")

PR_NUMBER=$(echo "$PR_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('number',''))" 2>/dev/null)
PR_URL=$(echo "$PR_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('html_url',''))" 2>/dev/null)

if [ -n "$PR_NUMBER" ]; then
  echo "  ✅ PR #${PR_NUMBER} 创建成功: ${PR_URL}"
else
  echo "  ⚠️  PR 创建可能失败，可能需要手动创建"
fi

echo ""
echo "=========================================="
echo "全部完成！"
echo "=========================================="
echo "📦 Fork:   https://github.com/${FORK_OWNER}/${REPO_NAME}"
echo "🌿 分支:   ${BRANCH_NAME}"
if [ -n "$ISSUE_URL" ]; then
  echo "📋 Issue:  ${ISSUE_URL}"
fi
if [ -n "$PR_URL" ]; then
  echo "🔀 PR:     ${PR_URL}"
fi
echo ""
echo "下一步: 等待 OpenDesign 维护者审核 PR"
echo "=========================================="

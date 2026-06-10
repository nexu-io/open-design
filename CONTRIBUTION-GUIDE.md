# 多 Agent 团队协作模块 — OpenDesign 社区贡献操作手册

## 一、GitHub 账号准备（二选一）

### 方案 A：安装 gh CLI（推荐）
```bash
# 安装 gh
curl -sL https://github.com/cli/cli/releases/latest/download/gh_2.65.0_macOS_arm64.zip -o /tmp/gh.zip
unzip /tmp/gh.zip -d /tmp/gh
sudo cp /tmp/gh/bin/gh /usr/local/bin/

# 登录
gh auth login
# 选择 GitHub.com → HTTPS → Login with a web browser
```

### 方案 B：生成 Personal Access Token
1. 打开 https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. 勾选权限：`repo`, `read:org`, `workflow`
4. 复制 Token

---

## 二、Fork 仓库

### 网页操作
1. 打开 https://github.com/nexu-io/open-design
2. 点击右上角 **Fork**
3. 等待 Fork 完成

### 或用 gh CLI
```bash
gh repo fork nexu-io/open-design
```

---

## 三、克隆你的 Fork 到本地

```bash
git clone git@github.com:<你的用户名>/open-design.git
cd open-design
git remote add upstream https://github.com/nexu-io/open-design.git
```

---

## 四、推送代码到你的 Fork

```bash
# 在你的 fork 仓库里创建分支
git checkout -b feat/multi-agent-team

# 将本项目的代码复制过来
cp -r <你的本地路径>/opendesign-team/* .

# 提交
git add -A
git commit -m "feat: add multi-agent team collaboration module"

# 推送
git push origin feat/multi-agent-team
```

---

## 五、开 RFC Issue（先讨论，后编码）

在 https://github.com/nexu-io/open-design/issues/new 中填写以下内容：

### Issue 标题
```
[RFC] Multi-Agent Team Collaboration Module — 并行/串行/遗传/继承协作模式
```

### Issue 内容

```markdown
## Why

OpenDesign 当前是单 Agent 驱动设计的工作流（SKILL.md → daemon → agent → artifact）。
在实际项目中，一个完整的设计方案往往需要多个 Agent 协作：

- 设计师 Agent 生成视觉原型
- 文案 Agent 撰写文案内容
- 前端 Agent 将设计转为代码
- 审核 Agent 校验品牌一致性

这些 Agent 之间需要任务拆分、上下文传递、结果聚合和工件版本管理。

## What I'm proposing

一个 **multi-agent team collaboration** 模块，作为 OpenDesign 的扩展包：

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

### 技术实现
- **语言**: Go 1.22+
- **架构**: 独立模块，通过 daemon HTTP API 对接，不修改 OpenDesign 核心代码
- **集成方式**: 作为 `plugins/community/multi-agent-team/` 社区插件

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
```

---

## 六、创建 PR（与 Issue 同时或随后）

在你的 Fork 仓库中创建 PR，使用以下内容：

### PR 标题
```
feat: add multi-agent team collaboration module
```

### PR 内容（按 OpenDesign PR 模板）

```markdown
Fixes #

## Why

**使用场景**: OpenDesign 当前是单 Agent 驱动设计。在实际项目中，一个完整设计需要设计师、文案、前端、审核等多 Agent 协作。

**要解决的问题**: 无官方多 Agent 编排机制，用户只能手动在多个终端窗口分别运行 agent，无法共享上下文、传递工件、进行遗传优化。

## What users will see

通过 YAML 配置文件定义 Agent 团队，一行命令启动协作：

```bash
odteam -config team-parallel.yaml -task "设计一个落地页，包含 hero、定价表、FAQ"
```

五种协作模式可选（parallel / serial / genetic / inheritance / hybrid）。

## Surface area

- [ ] UI
- [ ] CLI / 环境变量 ✅ (新增 `odteam` CLI 工具 + `-daemon` flag)
- [ ] API / 合约 ✅ (新增 daemon HTTP client 对接 /api/chat + /api/skills + /api/design-systems)
- [ ] 扩展点 ✅ (作为 community plugin 集成)

## Validation

```bash
go build ./...
go test -count=1 -race ./...  # 全部 PASS
go vet ./...                    # 无 warning
```
```

---

## 七、代码推送 Checklist

确保以下文件存在于你的 Fork 仓库中：

```
open-design/packages/multi-agent-team/
├── cmd/odteam/main.go              # CLI 入口
├── go.mod                          # module: github.com/nexu-io/open-design/packages/multi-agent-team
├── go.sum
├── Makefile
├── README.md
├── pkg/protocol/
│   ├── message.go                  # 核心类型 + 工件类型（含 OpenDesign 原生类型）
│   └── artifact.go                 # 文件工件存储
├── internal/
│   ├── agent/pool.go               # Agent 池 + daemon HTTP 调用
│   ├── agent/pool_test.go
│   ├── agent/adapter/
│   │   ├── adapter.go              # Agent 适配器接口
│   │   ├── claude.go               # Claude Code 适配
│   │   ├── opendesign.go           # OpenDesign CLI 适配
│   │   └── daemon/client.go        # daemon REST + SSE 客户端
│   ├── bus/bus.go                  # 发布订阅通信总线
│   ├── config/                     # YAML 配置解析
│   ├── scheduler/                  # 并行/串行/遗传/继承调度器
│   ├── coordinator/                # 团队协调器 + 任务拆分
│   ├── events/emitter.go           # 事件驱动 + 历史重放
│   └── store/history.go            # SQLite 历史存储
└── examples/
    ├── team-parallel.yaml
    ├── team-serial.yaml
    ├── team-genetic.yaml
    └── team-inheritance.yaml
```

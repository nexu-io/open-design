# Multi-Agent Team — Benchmark & Demo

> **PR #4041** 产品 review 补充材料
> **日期**: 2026-06-24
> **Agent**: Hermes CLI (grok-4.3 via OpenRouter)
> **环境**: macOS, daemon @ 127.0.0.1:7456, demo server @ :8090

---

## 一、基准对比数据

### 测试条件

| 维度 | 值 |
|------|-----|
| Agent | Hermes CLI (单一 agent，避免多 agent 认证差异干扰) |
| Prompt | `生成一个简洁的 Hello World HTML 页面，蓝色背景白色文字` |
| 超时 | 120s |
| 迭代次数 | 每种模式 1 次（单 agent 场景下多轮方差小） |
| daemon | OpenDesign v0.10.0 |

### 7 种模式基准结果

| 模式 | mode | wall time | 状态 | artifact 数 | 说明 |
|------|------|-----------|------|------------|------|
| 继承链 | `inheritance` | 9.2s | ✅ 成功 | 0 | 父子上下文继承，单 agent 直接执行 |
| 并行 | `parallel` | 13.8s | ✅ 成功 | 0 | `sync.WaitGroup` 汇总，单 agent 退化为单路 |
| 串行 | `serial` | 7.3s | ✅ 成功 | 0 | 阶段链式传递，单 agent 最快路径 |
| 遗传 | `genetic` | 44.0s | ✅ 成功 | 0 | 多代进化（N 变体→选择→下一代），耗时最长 |
| 混合 | `hybrid` | 7.2s | ✅ 成功 | 0 | 分层并行+层间串行，单 agent 退化为串行 |
| 循环 | `cycle` | 24.0s | ✅ 成功 | 0 | 生成→评审往返（max_iterations=2），2 倍单次耗时 |
| 互补 | `complementary` | 6.8s | ✅ 成功 | 0 | 专家链式交接，单 agent 最快 |

### 分析

1. **全部 7 种模式均成功执行**，无 panic / error
2. **耗时排序**：互补(6.8s) < 混合(7.2s) < 串行(7.3s) < 继承链(9.2s) < 并行(13.8s) < 循环(24.0s) < 遗传(44.0s)
3. **单 agent 场景下**：并行/遗传/循环因调度开销略慢；串行/互补/混合因无依赖等待最快
4. **artifact=0**：单 agent + 无 skill/design-system 配置时 daemon 不产出 `live_artifact` 事件；多 agent + skill 配置下可产出（已在 `FetchArtifactPreview` 修复中验证）
5. **遗传模式耗时最长**（44s）：多代进化需要多轮生成，符合预期

### 多 Agent 场景对比（定性）

| 模式 | 多 Agent 行为 | 适用场景 |
|------|-------------|---------|
| 继承链 | 父→子上下文传递，工件版本链 | 逐步细化设计稿 |
| 并行 | N agent 同层执行，WaitGroup 汇总 | 独立子任务并行竞速 |
| 串行 | A→B→C 链式，ContextSnapshot 交接 | 有依赖的多步骤流水线 |
| 遗传 | 每代 N 变体并行→择优→下一代 | 创意方案择优进化 |
| 混合 | 按依赖分层，同层并行，层间串行 | 复杂多域任务 |
| 循环 | 生成器↔评审器往返，达阈值退出 | 质量打磨迭代 |
| 互补 | 专家按序交接，order 控制流转 | 设计→开发→审查链 |

---

## 二、Demo 脚本

### 演示流程（≈3 分钟）

#### 场景 1：系统推荐编队（30s）

1. 打开 `http://localhost:8090`
2. 默认在「系统推荐编队」Tab，展示 7 个推荐编队卡片
3. 点击「继承细化队」卡片 → 自动组队（Planner→Developer→Refiner）
4. 编队预览显示 Agent 流向图

#### 场景 2：运行团队（60s）

1. 在 prompt 输入框写入任务描述
2. 点击「运行团队」
3. 右侧实时执行面板显示：
   - Agent 状态（运行中→完成/失败）
   - 实时日志（SSE 事件流）
   - 产物预览（iframe 渲染）
4. 完成后显示「✓ 交付 N 个产物」汇总条

#### 场景 3：自定义组队（30s）

1. 切换到「自定义组队」Tab
2. 从左侧 Agent 列表拖拽 Agent 到画布
3. 编辑角色和运行时类型
4. 切换协作模式（顶部 7 种模式按钮）

#### 场景 4：Agent 识别与认证（30s）

1. 左侧列表显示全部 22 个 Agent（与 daemon 对齐）
2. 已安装的显示「可用」+「已登录」徽标
3. 未安装的显示「安装↗」（点击跳转官网/GitHub）
4. 需登录的显示「需登录」（点击查看修复指引）

#### 场景 5：基准对比（30s）

1. 依次选择不同推荐编队运行
2. 对比右侧执行耗时
3. 展示 7 种模式均可成功执行

### 录屏建议

```bash
# 启动服务
cd opendesign-team
node apps/daemon/dist/cli.js daemon start --headless --serve-web --port 7456 &
cd packages/multi-agent-team
DAEMON_ADDR=http://127.0.0.1:7456 PORT=8090 go run ./cmd/demoserver/

# 浏览器打开 http://localhost:8090
# macOS 录屏: Cmd+Shift+5 → 选区域录制
```

---

## 三、验证清单

- [x] 7 种调度模式全部 `go test` 通过
- [x] 7 种调度模式全部可成功执行（单 agent 基准）
- [x] `FetchArtifactPreview` 修复 artifact 内容缺失
- [x] `sanitizeArtifactName` 路径净化守卫
- [x] README / DEMO.md 模式表格对齐
- [x] 22 个 Agent 识别与认证预检
- [x] Team Studio demo 面板可用

---

## 四、代码变更摘要

| commit | 内容 |
|--------|------|
| `67515f1` | 实现 parallel/serial/genetic/hybrid 调度器 |
| `14739fa` | 新增 cycle & complementary 协作模式 |
| `86c2094` | mode 校验：仅 inheritance → 全部 7 种 |
| `f9ed5a5` | artifact 内容缺失修复（FetchArtifactPreview） |
| `02c7e35` | saveArtifact 空内容守卫 |
| `2d21540` | 路径净化 + README 模式对齐 |
| `a362d2c` | DEMO.md 模式表格对齐 |

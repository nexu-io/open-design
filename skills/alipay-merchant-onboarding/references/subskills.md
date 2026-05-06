# 子技能调用关系

> 本文档定义主技能与子技能的调用关系。
> 被引用文档：`SKILL.md`

## ⚠️ 重要：统一使用 Read 文件方式调用

> **所有子技能均通过 Read 工具渐进式调用，不使用 Skill 工具。**
>
> 原因：Skill 工具调用子技能会报错 `Unknown skill: claude-code-teams:alipay-merchant-onboarding/xxx`

## 子技能清单

| 子技能 | 触发时机 | 功能 | 输入 | 输出 | 调用方式 |
|--------|----------|------|------|------|----------|
| mcc-recommender | 方案规划阶段 | 推荐经营类目 | 用户经营描述 | mccCode | **Read 文件** |
| ar-sign-skill | 方案规划 + 签约阶段 | 产品推荐、签约状态查询、签约提交（`./ar-sign-skill/ar-sign apply`） | salesCode, mccCode（运行时变量）, 采集资料 | 签约结果（运行时） | **Read 文件** |
| application-publish | 应用阶段 | 应用创建与密钥配置 | salesCode | appId（运行时） | **Read 文件** |
| service-market | 应用阶段后 | 服务市场上架 | 服务信息（运行时） | serviceId（运行时） | **Read 文件** |

---

## ar-sign-skill 子技能

### 功能

产品推荐、签约状态查询、签约提交。

### 输入

从状态文件读取：
- `salesCode` - 产品码
- `collect_information` - 资料采集信息（截图 fileKey，仅电脑网站支付）

运行时变量（不持久化）：
- `mccCode` - 经营类目编码

### 输出

签约结果为运行时变量，不写入状态文件：
- 签约状态（通过 MCP 真实查询获取）
- arNo 合约号（运行时变量）

### 流程

```
1. 产品推荐（委托 ar-sign-skill/references/recommend-product.md）
   └─ 根据用户业务场景推荐签约产品

2. 查询签约状态（委托 ar-sign-skill/references/query-ar.md）
   ⚠️ 必须通过 MCP 真实查询，禁止依赖本地文件状态判断
   ├─ SIGNED → 跳过签约
   ├─ SIGNING → 跳过签约
   └─ NOT_SIGNED → 进入签约流程

3. 签约提交（未签约时）
   └─ 直接调用 ./ar-sign-skill/ar-sign apply --data '<json>'
      （跳过 previewFormView，主技能组装 JSON 后直接提交）
```

### 状态值

| 状态 | 说明 | 处理 |
|------|------|------|
| `SIGNED` | 已签约 | 跳过，直接进入应用创建 |
| `SIGNING` | 签约中 | 跳过，直接进入应用创建 |
| `FAILED` | 签约失败 | 提示用户重试 |
| `NOT_SIGNED` | 未签约（或无合约记录） | 进入签约流程 |

**⚠️ 重要判断规则：**
- 签约状态以 MCP 真实查询返回的 `arStatus` 为准
- `arInfos` 数组为空时，视为 `NOT_SIGNED`
- 禁止通过本地 `ar_sign_data` 或 `status` 字段判断签约是否完成

### 详细文档

参见：`ar-sign-skill/SKILL.md` 及 `ar-sign-skill/references/` 目录

---

## application-publish 子技能

### 功能

应用创建与发布全流程。

### 输入

从状态文件读取：
- `salesCode` - 产品码（决定应用类型）

### 输出

应用创建结果为运行时变量，不写入状态文件：
- `appId` - 创建的应用 ID（运行时变量）

### 流程

```
1. 查询应用列表 (apprelease.queryApplicationList)
   ├─ 有同类型 ON_LINE/AUDIT 应用 → 返回已有应用
   └─ 无同类型应用 → 创建新应用

2. 创建应用 (apprelease.createApplication)
   └─ 获取 appId

3. 设置应用公钥 (apprelease.createKeyConfirmPage)
   ├─ 输出跳转链接 供用户点击跳转
   └─ 等待用户输入确认

4. 提交审核 (apprelease.submitApplicationAudit)
   └─ 返回审核结果
```

### 应用类型映射

| salesCode | 应用类型 |
|-----------|----------|
| I1080300001000041203 | WEBAPP |
| I1080300001000160457 | WEBAPP |

### 触发方式

1. **签约完成后自动触发** - 签约成功后由主流程调用
2. **独立入口触发** - 用户说"我要创建应用"、"发布应用"等

### 详细文档

参见：`application-publish/SKILL.md` 及 `application-publish/references/` 目录

---

## service-market 子技能

### 功能

将 MCP 服务上架到支付宝服务市场。**仅对"智能收"产品需要**。

### ⚠️ 触发条件（重要）

```
✅ 智能收（salesCode = I1080300001000160457）→ 需要服务市场上架
❌ 电脑网站支付（salesCode = I1080300001000041203）→ 不需要
```

**触发时机：**
1. 主技能 Step 5 资料采集阶段，智能收产品收集5项服务注册入参并写入 `service_market_data`（状态文件）
2. 主技能 Step 6 并行执行时，本子技能从状态文件 `service_market_data` 读取入参并提交上架

### 输入

从状态文件读取：
- `salesCode` - 产品码（用于判断是否需要此流程）
- `service_market_data` - 服务注册入参（由主技能 Step 5 采集并写入状态文件）
  - `serviceName` - 服务名称
  - `serviceDesc` - 服务描述
  - `resourceUrl` - 服务地址
  - `pricing` - 服务单价
  - `schemaUrl` - 请求示例

### 输出

服务上架结果为运行时变量，不写入状态文件：
- `serviceId` - 服务 ID（运行时变量）

### 流程

```
1. 查询已上架服务 (a2a-pay-service.discoverBazaarServicesForMcp)
   ├─ 有已上架服务 → 展示状态，询问是否上架新服务
   └─ 无已上架服务 → 进入下一步

2. 从共享内存读取服务数据（由主技能 Step 5 采集）
   ├─ 数据完整 → 展示信息供用户确认
   └─ 数据不完整 → 返回错误，需回到主技能 Step 5 补充采集

3. 提交上架 (a2a-pay-service.saveBazaarServiceForMcp)
   └─ 返回服务 ID 和状态
```

### 服务状态

| 状态 | 说明 | 处理 |
|------|------|------|
| `DRAFT` | 草稿 | 可继续编辑 |
| `PENDING` | 审核中 | 等待审核结果 |
| `ONLINE` | 已上架 | 服务可被调用 |
| `OFFLINE` | 已下架 | 可重新上架 |
| `REJECTED` | 审核拒绝 | 修改后重新提交 |

### 触发方式

1. **产品选择后自动判断** - 用户选择智能收产品后，主技能 Step 5 采集服务注册入参并写入 `service_market_data`，Step 6 并行执行时本子技能从状态文件读取并提交
2. **独立入口触发** - 用户说"上架服务市场"、"服务上架"等（需先验证产品类型和状态文件 `service_market_data` 数据完整性）

### 产品判断逻辑

```bash
# 判断是否为智能收产品
SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)
if [ "$SALES_CODE" = "I1080300001000160457" ]; then
  # 进入服务市场上架流程
fi
```

### 调用方式

使用 Read 工具读取：

```markdown
Read tool call:
  file_path: "service-market/SKILL.md"
```

### 详细文档

参见：`service-market/SKILL.md` 及 `service-market/references/` 目录

---

## mcc-recommender 子技能

### 功能

根据用户经营描述推荐经营类目。

### ⚠️ 数量限制（最高优先级）

```
⛔ 最多向用户展示 3 个经营类目（按匹配度排序）
⛔ 禁止输出超过 3 个推荐结果
⛔ 禁止直接输出 JSON 数据给用户
```

### ⚠️ 调用方式（重要）

**mcc-recommender 不通过 Skill 工具调用，而是直接读取文件：**

```markdown
使用 Read 工具读取 mcc 参考文件：

Read tool call:
  file_path: "mcc-recommender/SKILL.md"
```

**原因：** 这是一个纯知识库查询型子技能，无需调用后端服务，LLM 直接读取文件后自行完成语义匹配。

### 输入

用户描述的经营内容，例如：
- "我有一个在线教育网站"
- "我是电商平台"

### 输出

**内部 JSON 格式（用于后续处理）：**

```json
{
  "recommendations": [
    {
      "level1_code": "A0002",
      "level2_code": "B0114",
      "level1_name": "零售批发",
      "level2_name": "互联网综合电商平台",
      "match_reason": "在线电商属于互联网综合电商平台类目"
    }
  ]
}
```

**用户展示格式（编号表格，最多 3 个）：**

```
📋 根据您的描述，为您推荐以下经营类目：

| 序号 | 一级类目 | 二级类目 | 匹配说明 |
|------|----------|----------|----------|
| 1 | 零售批发 | 互联网综合电商平台 | 在线电商属于互联网综合电商平台类目 |
| 2 | 零售批发 | 互联网垂直电商平台 | 垂直类电商也可选择此类目 |
| 3 | 商业生活服务 | 在线工具 | 纯线上工具服务场景 |

请选择：
  • 输入序号（1/2/3）选择对应类目
  • 输入更详细的描述，重新推荐类目
```

### 用户选择处理

| 用户输入 | 处理方式 |
|----------|----------|
| 输入数字序号（1/2/3） | 选择对应类目，构造 MCC_CODE |
| 输入更详细描述 | 重新匹配，返回新推荐列表（最多 3 个） |
| 输入"确认"（单推荐时） | 确认使用推荐的类目 |

### MCC 编码构造

推荐完成后，从用户选择的类目构造 MCC_CODE：

```bash
# 从推荐结果获取 MCC 信息
MCC_CODE="${level1_code}_${level2_code}"
MCC_NAME="${level1_name} > ${level2_name}"

# ⚠️ mccCode/mccName 不写入共享内存状态文件
# 作为运行时变量，在签约提交时直接传入 apply JSON
```

### 匹配规则

1. **精确匹配**：用户描述关键词与"二级类目"或"适用商家"完全匹配
2. **语义匹配**：理解用户经营场景，匹配最接近的类目
3. **多选推荐**：⭐ 按匹配度排序返回前 **3** 个结果（最多 3 个）
4. **数量限制**：⭐ **最多返回 3 个，不低于 1 个**

### 调用时机

- 方案规划阶段，用户描述经营内容后

---

## 调用示例（统一使用 Read 文件方式）

### 调用 ar-sign-skill

```markdown
⚠️ 不使用 Skill 工具调用！使用 Read 工具渐进式读取：

# Step 1: 读取子技能主文档
Read tool call:
  file_path: "ar-sign-skill/SKILL.md"

# Step 2: 根据需要读取详细文档（可选，按需深入）
Read tool call:
  file_path: "ar-sign-skill/references/query-ar.md"     # 签约状态查询
Read tool call:
  file_path: "ar-sign-skill/references/recommend-product.md"  # 产品推荐

⚠️ 注意：主技能跳过 previewFormView 流程，直接通过 ./ar-sign-skill/ar-sign apply --data 提交签约。
无需读取 ar-sign-skill/references/preview.md。
```

### 调用 application-publish

```markdown
⚠️ 不使用 Skill 工具调用！使用 Read 工具渐进式读取：

# Step 1: 读取子技能主文档
Read tool call:
  file_path: "application-publish/SKILL.md"

# Step 2: 根据需要读取详细文档（可选，按需深入）
Read tool call:
  file_path: "application-publish/references/cli-command-templates.md"
```

### 调用 service-market

```markdown
⚠️ 不使用 Skill 工具调用！使用 Read 工具渐进式读取：

# Step 1: 读取子技能主文档
Read tool call:
  file_path: "service-market/SKILL.md"

# Step 2: 根据需要读取详细文档（可选，按需深入）
Read tool call:
  file_path: "service-market/references/cli-command-templates.md"
```

### 调用 mcc-recommender

```markdown
⚠️ 不使用 Skill 工具调用！使用 Read 工具直接读取子技能文档：

Read tool call:
  file_path: "mcc-recommender/SKILL.md"

读取后，LLM 自行完成语义匹配并输出推荐结果。

⚠️ 重要规则：
- ⛔ 最多推荐 3 个类目（按匹配度排序）
- ⛔ 必须输出编号表格让用户选择
- 用户可输入序号（1/2/3）选择，或补充描述重新推荐
```

## 统一调用原则

| 子技能 | 调用方式 | 原因 |
|--------|----------|------|
| ar-sign-skill | **Read 文件** | 渐进式读取，避免 Skill 工具报错 |
| application-publish | **Read 文件** | 渐进式读取，避免 Skill 工具报错 |
| service-market | **Read 文件** | 渐进式读取，避免 Skill 工具报错 |
| mcc-recommender | **Read 文件** | 纯知识库查询，无需后端服务 |

### 渐进式读取原则

1. **先读 SKILL.md**：获取子技能整体流程和入口信息
2. **按需读 references/**：根据当前步骤选择性读取详细文档
3. **不要一次性读完**：避免上下文膨胀，按需深入
4. **遵循文档指引**：读取后严格按照文档中的 MCP 调用规范执行
# 执行流程

> 本文档定义完整的入驻执行流程。
> 被引用文档：`SKILL.md`

## 流程概览

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐    ┌─────────────────────────────────────────────┐
│  Step 1     │ →  │  Step 2      │ →  │  Step 3     │ →  │  Step 4: 授权后处理                           │
│  初始化     │    │  方案规划    │    │  登录授权   │    │                                                 │
└─────────────┘    └──────────────┘    └─────────────┘    │  ┌──────────────────────────────────┐       │
                                                              │  │ 查询签约状态                   │       │
                                                              │  │ （委托 ar-sign-skill 子技能）   │      │
                                                              │  └────────────┬──────────────── ─┘     │
                                                              │               │                        │
                                                              │  ┌────────────┼────────────┐          │
                                                              │  ↓            ↓            ↓          │
                                                              │ SIGNED    SIGNING    NOT_SIGNED       │
                                                              │  ↓            ↓            ↓          │
                                                              │ 应用创建   应用创建    进入签约流程     │
                                                              └────────────┴────────────┴─────────────┘
                                                                                                      ↓
                                                              ┌────────────────────────────────────────┐
                                                              │  Step 5: 资料采集（按产品类型）            │
                                                              │  ├─ 电脑网站支付: 3张截图 → fileKey       │
                                                              │  └─ 智能收: 5项服务注册入参                │
                                                              │           → service_market_data         │
                                                              └─────────────────────────────────────────┘
                                                                                        ↓
                                                              ┌───────────────────────────────────────────────────────────┐
                                                              │  Step 6: 签约 + 应用创建        + 服务注册(智能收需要)         │
                                                              │  ┌────────────┐  ┌────────────────┐  ┌────────────────┐   │
                                                              │  │ ar-sign    │  │ application-   │  │ service-       │   │
                                                              │  │ apply直调  │   │   publish      │  │   market       │   │
                                                              │  └────────────┘  └────────────────┘  └────────────────┘   │
                                                              └────────────────────────────────────────────────────────────┘
                                                                                            ↓
                                                              ┌────────────────────────────────────────────────────────────┐
                                                              │  Step 7.5: 支付能力集成配置（appId 已获取后触发）            │
                                                              │  └─ 调用 alipay-payment-production-integration skill       │
                                                              └────────────────────────────────────────────────────────────┘
                                                                                            ↓
                                                                            ┌────────────────────────────────────────┐
                                                                            │  Step 8: 流程结束                       │
                                                                            └────────────────────────────────────────┘
```

---

## Step 1: 初始化与断点检测

### 1.1 检查 CLI 安装

```bash
if ! alipay-cli version &>/dev/null; then
  echo "🔄 正在安装 alipay-cli..."
  curl -fsSL https://opengw.alipay.com/alipaycli/install | bash
fi
```

### 1.2 初始化共享内存状态

```bash
STATE_MANAGER=<skill-dir>/scripts/state_manager.py
python3 "$STATE_MANAGER" init
```

### 1.3 断点续传检测

通过共享内存中已有字段判断历史进度（不使用 status 字段，流程状态通过 MCP 真实查询）。

```bash
# 检查是否有历史进度
if [ "$(python3 "$STATE_MANAGER" exists)" = "true" ]; then
  # 通过已有数据判断进度
  PRODUCT_NAME=$(python3 "$STATE_MANAGER" get productName)
  SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)
  COLLECT_INFO=$(python3 "$STATE_MANAGER" get collect_information)
  SERVICE_DATA=$(python3 "$STATE_MANAGER" get service_market_data)

  if [ -n "$PRODUCT_NAME" ]; then
    echo "发现历史进度：产品=$PRODUCT_NAME"

    # 根据产品类型检查资料采集状态
    if [ "$SALES_CODE" = "I1080300001000160457" ]; then
      # 智能收：检查服务注册入参
      if [ -n "$SERVICE_DATA" ] && [ "$SERVICE_DATA" != "null" ] && [ "$SERVICE_DATA" != "{}" ]; then
        echo "服务注册入参已采集，可跳过采集步骤"
      fi
    else
      # 电脑网站支付：检查截图 fileKey
      if [ -n "$COLLECT_INFO" ] && [ "$COLLECT_INFO" != "null" ] && [ "$COLLECT_INFO" != "{}" ]; then
        echo "资料已采集，可跳过采集步骤"
      fi
    fi
    # 续传处理
  else
    echo "无有效历史进度，开始新入驻流程"
  fi
else
  echo "无历史进度，开始新入驻流程"
fi
```

> **⚠️ 禁止通过 status 字段判断流程进度，状态字段不属于允许的 5 个字段。**

---

## Step 2: 方案规划

### 2.0 智能推荐流程（核心）

**⚠️ 重要：方案规划阶段优先使用智能推荐，用户不满意时才让用户修改。**

```
Step 2.0: 智能推荐
    ├─ 1. 分析上下文（用户描述 + 项目信息）
    ├─ 2. 检测环境变量 COZE_PROJECT_TYPE
    ├─ 3. 综合判断 → 自动推荐产品和经营类目
    ├─ 4. 展示推荐结果给用户确认
    │   ├─ 用户认可 → 保存方案，进入 Step 3
    │   └─ 用户不认可 → 进入手动选择流程
    └─ 5. 手动选择：产品选择 → MCC 推荐 → 确认
```

### 2.0.1 方案规划阶段的登录状态预检

**在方案规划阶段可选择性执行 whoami 检查，用于提前了解登录状态。**

**⚠️ 重要：如果 whoami 返回过期（`logged_in: false`），不要中断流程，当用户没登录继续往下走。**

```bash
# 方案规划阶段的登录状态预检（可选）
CHECK_RESULT=$(alipay-cli whoami --json 2>&1)
LOGGED_IN=$(echo "$CHECK_RESULT" | jq -r '.data.logged_in // false')

if [ "$LOGGED_IN" = "true" ]; then
  echo "✅ 当前已登录，将在后续步骤校验 scope 权限"
else
  # ⚠️ 过期或未登录，当用户没登录处理，继续往下走
  echo "📋 当前未登录或登录已过期，将在 Step 3 进行登录授权"
fi

# 无论登录状态如何，继续执行方案规划流程
# 登录授权在 Step 3 统一处理
```

**处理规则：**

| whoami 返回 | 处理方式 |
|------------|----------|
| `logged_in: true` | 记录状态，继续方案规划，Step 3 校验 scope |
| `logged_in: false`（过期） | **当用户没登录，继续往下走，不中断流程** |
| 其他错误（网络/CLI 问题） | 忽略错误，继续往下走 |

**禁止行为：**

```
❌ 禁止：whoami 返回过期时报错或中断流程
❌ 禁止：whoami 返回过期时要求用户立即登录
❌ 禁止：因过期状态阻塞方案规划流程
✅ 正确：过期或未登录时，当用户没登录，继续往下走
✅ 正确：登录授权统一在 Step 3 处理
```

### 2.1 上下文分析与智能推荐

#### 2.1.1 检测环境变量

```bash
COZE_PROJECT_TYPE="${COZE_PROJECT_TYPE:-}"
```

**COZE_PROJECT_TYPE 对照表：**

| 环境变量值 | 推荐产品 | 推荐MCC | 推荐理由 |
|-----------|---------|--------|---------|
| `general_web` | 电脑网站支付 | 零售批发 > 互联网综合电商平台 (A0002_B0114) | PC网站场景，电商类目 |
| 未设置 | 根据用户描述和上下文信息智能判断 | 根据业务场景匹配 | 上下文语义分析 |

#### 2.1.2 用户上下文分析

**从以下来源分析用户业务场景（优先级从高到低）：**

| 优先级 | 来源 | 说明 | 示例 |
|-------|------|------|------|
| 1 | COZE_PROJECT_TYPE | 环境变量，确定性推荐 | `general_web` → 电脑网站支付 |
| 2 | 用户对话描述 | 用户主动说明业务场景 | "我是做AI智能体的" → 智能收 |
| 3 | 项目名称/目录名 | 从工作目录推断业务类型 | `my-ai-assistant` → 智能收 |
| 4 | 代码内容分析 | 分析项目依赖和代码特征 | 见 products.md 详细规则 |

**代码内容分析规则（通过 Glob/Grep 工具分析项目）：**

| 检测特征 | 推荐产品 | 匹配规则 |
|---------|---------|---------|
| AI/LLM 依赖 (`openai`, `anthropic`, `langchain`) | 智能收 | `package.json` 包含相关依赖 |
| Agent 框架代码 (`Agent`, `ChatOpenAI`) | 智能收 | 代码包含 Agent 相关类/函数 |
| API 服务代码 (`FastAPI`, `express.Router`) | 智能收 | 存在 API 路由定义 |
| 计费/配额逻辑 (`credits`, `usage`, `billing`) | 智能收 | 代码包含按调用付费特征 |
| 传统 Web 框架 (`React`, `Vue`) + 电商逻辑 | 电脑网站支付 | 存在购物车/订单/支付相关代码 |

**关键词匹配规则（按优先级）：**

| 业务关键词 | 推荐产品 | 推荐MCC | 推荐理由 |
|-----------|---------|--------|---------|
| AI、智能体、Agent、API、算力、数字内容、按调用付费 | 智能收 | 根据具体业务匹配（如：互联网垂直电商平台 A0002_B0115） | 智能收定义：面向AI智能体的机器支付 |
| 网站、电商、PC官网、在线教育、政务缴费、商城 | 电脑网站支付 | 互联网综合电商平台 (A0002_B0114) 或匹配具体业务 | 电脑网站支付定义：PC网页发起支付 |
| 直播、视频、内容创作 | 智能收 | 商业生活服务 > 在线工具 (A0003_B0112) | 数字内容场景适合智能收 |
| SaaS、工具、软件服务 | 智能收 | 商业生活服务 > 在线工具 (A0003_B0112) | API调用场景适合智能收 |

#### 2.1.3 智能推荐输出格式

**⚠️ 重要：先展示推荐结果，询问用户是否认可，不认可时才进入手动选择。**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 根据您的业务场景，智能推荐方案：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   🎯 推荐产品：智能收
      定义：面向 AI 智能体的机器支付收款产品
      适用场景：API、数字内容、算力资源、智能体按调用付费

   📂 推荐类目：零售批发 > 互联网垂直电商平台
      类目编码：A0002_B0115
      匹配理由：您的业务涉及 API 服务，适合垂直电商类目

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**用户确认选项：**

```
请确认推荐方案：
  1. ✅ 认可，使用推荐方案
  2. ❌ 不认可，我要修改产品和类目
  3. ❌ 不认可，仅修改产品
  4. ❌ 不认可，仅修改类目

请输入选项（1/2/3/4）：
```

#### 2.1.4 环境变量自动推荐（general_web）

**当检测到 `COZE_PROJECT_TYPE=general_web` 时：**

```
✅ 检测到环境变量 COZE_PROJECT_TYPE=general_web

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 根据项目类型，自动推荐方案：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   🎯 推荐产品：电脑网站支付
      定义：用户在 PC 网页发起支付，跳转支付宝完成付款
      适用场景：PC 官网、电商网站、在线教育、政务缴费网站

   📂 推荐类目：零售批发 > 互联网综合电商平台
      类目编码：A0002_B0114
      匹配理由：PC 网站项目，适合电商平台类目

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ 已自动识别项目类型，推荐方案如上。
   如需修改，请告知具体需求。
```

### 2.2 产品选择（手动选择流程）

**⚠️ 仅在用户不认可智能推荐时执行此步骤。**

详见 `references/products.md`

**使用 AskUserQuestion 工具：**

```
AskUserQuestion:
  question: "请选择您需要开通的支付产品："
  header: "产品选择"
  options:
    - label: "电脑网站支付"
      description: "用户在 PC 网页发起支付，跳转支付宝完成付款。适用：PC 官网、电商网站、在线教育、政务缴费网站"
    - label: "智能收"
      description: "面向 AI 智能体的机器支付收款产品。适用：API、数字内容、算力资源、智能体按调用付费"
```

### 2.3 MCC 推荐

**⚠️ 注意：mcc-recommender 不通过 Skill 工具调用，而是直接读取文件。**

```markdown
使用 Read 工具读取 MCC 参考文件：

Read tool call:
  file_path: "mcc-recommender/SKILL.md"

LLM 读取文件后，自行完成语义匹配，输出推荐结果。
```

**⚠️ 重要：MCC 推荐最多返回 3 个类目，供用户选择。**

#### 输出格式编排

**⚠️ 重要：不要直接向用户展示 JSON 数据，必须整理为易读的表格形式供用户选择。**

当有多个推荐结果时，使用编号表格让用户选择：

```
📋 根据您的描述，为您推荐以下经营类目：

| 序号 | 一级类目 | 二级类目 | 匹配说明 |
|------|----------|----------|----------|
| 1 | 餐饮 | 饮品/甜品 | 奶茶店属于饮品店铺 |
| 2 | 餐饮 | 快餐小吃 | 奶茶店可能兼营小吃 |
| 3 | 零售批发 | 食品饮料 | 瓶装饮料零售 |

请选择：
  • 输入序号（1/2/3）选择对应类目
  • 输入更详细的描述，重新推荐类目
```

当只有一个推荐结果时：

```
📋 根据您的描述，为您推荐：

| 一级类目 | 二级类目 | 匹配说明 |
|----------|----------|----------|
| 餐饮 | 饮品/甜品 | 奶茶店属于饮品店铺 |

请选择：
  • 输入"确认"使用此类目
  • 输入更详细的描述，重新推荐类目
```

#### 用户选择处理

| 用户输入 | 处理方式 |
|----------|----------|
| 输入数字序号（1/2/3） | 选择对应的类目，将 `mcc_code`（格式：`A0001_B0009`）作为运行时变量保存 |
| 输入更详细描述 | 根据新描述重新匹配，返回新的推荐列表（最多 3 个） |
| 输入"确认"（单推荐时） | 确认使用推荐的类目，将 `mcc_code` 作为运行时变量保存 |

用户选择后，将对应的 `mcc_code`（格式：`A0001_B0009`）作为运行时变量，签约时直接传入 apply JSON（不写状态文件）。

### 2.4 保存方案

```bash
# 写入状态文件（仅 5 个允许字段，此处写入前 3 个）
python3 "$STATE_MANAGER" set productName "$PRODUCT_NAME"
python3 "$STATE_MANAGER" set salesCode "$SALES_CODE"
python3 "$STATE_MANAGER" set scope "$SCOPE"

# collect_information 在 Step 5 截图上传后写入（仅电脑网站支付）
# service_market_data 在 Step 5 服务注册入参采集后写入（仅智能收）
# mccCode 作为运行时变量，不写状态文件
# 在签约提交时直接传入 apply JSON 的 businessProperty.mccCode
```

---

## Step 3: 登录授权

详见 `references/cli-commands.md`

### ⚠️ 授权前用户确认（强制执行）

**在执行登录命令前，必须先输出产品类型和经营类目给用户确认！**

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ \n
📋 请确认您的选择信息：\n
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ \n

   产品类型：xxx
   经营类目：xxx (xxx)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ \n

确认信息无误后，将为您生成授权链接。
是否确认？(是/否)
```

**禁止行为：**
- ❌ 禁止未经用户确认直接执行登录命令
- ❌ 禁止跳过产品类型和经营类目的展示

### 流程

```
1. whoami 检查登录状态
   ├─ 已登录 → 检查 scope/mcc 权限
   │   ├─ 匹配 → 进入 Step 4
   │   └─ 不匹配 → logout → 重新登录
   └─ 未登录 → 执行登录流程
       ├─ login --non-interactive → 获取 device_code
       ├─ 校验参数 (deviceCode + productCode + mccCode)
       ├─ 构建 BROWSER_URL → 输出给用户
       └─ 等待用户确认授权完成 → login --complete 确认
```

### ⚠️ 授权确认规范

**不再使用轮询机制。授权流程如下：**

1. **输出授权链接** - 确保浏览器链接完整输出给用户
2. **等待用户确认** - 由用户主动确认"我已完成授权"
3. **执行确认命令** - 用户确认后，执行 `login --complete` 一次性确认

**禁止行为：**
- ❌ 禁止自动轮询检查授权状态
- ❌ 禁止循环调用 `login --complete`
- ❌ 禁止在用户未确认前调用确认命令

---

## Step 4: 授权后处理

### 4.1 查询签约状态（委托 ar-sign-skill 子技能）

**⚠️ 重要：签约状态查询委托 ar-sign-skill 子技能处理。主技能禁止直接调用 ar-query MCP。**

```markdown
# 读取 ar-sign-skill 子技能的合约查询文档
Read tool call:
  file_path: "ar-sign-skill/references/query-ar.md"
```

按照子技能文档指引，传入 `salesProductCodes`（即产品码）进行查询。

**⚠️ MCP 调用格式（仅供参考，实际执行以 ar-sign-skill 子技能文档为准）：**

```bash
# 正确格式：alipay-cli mcp call <server>.<tool>
alipay-cli mcp call ar-query.queryArInfosBySalesProd \
  -d '{"request":{"salesProductCodes":["I1080300001000041203"]},"ctx":{}}' --json 2>/dev/null

# ❌ 错误：使用 Facade 类名作为 server 名
alipay-cli mcp call McpArQueryFacade.queryArInfosBySalesProd ...

# ❌ 错误：省略 --json 或使用 2>&1
alipay-cli mcp call ar-query.queryArInfosBySalesProd \
  -d '{"request":{"salesProductCodes":["I1080300001000041203"]},"ctx":{}}' 2>&1
```

```bash
# 从共享内存状态获取产品码
SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)

# 通过 ar-sign-skill 子技能查询签约状态
# 调用方式见 ar-sign-skill/references/query-ar.md
```

### 4.2 状态分支（基于查询结果）

| 状态 | 说明 | 处理 |
|------|------|------|
| `SIGNED` | 已签约 | 跳过签约，直接进入应用创建 |
| `SIGNING` | 签约中 | 跳过签约，直接进入应用创建(如果是智能收加上 服务注册) |
| `NOT_SIGNED` 或 空 | 未签约 | 进入签约流程（Step 5） |

### 4.3 查询结果处理

根据 ar-sign-skill 子技能返回的查询结果：

```bash
# 解析签约状态（从子技能返回结果中）
AR_STATUS=$(echo "$QUERY_RESULT" | jq -r '.data.arInfos[0].arStatus // "NOT_SIGNED"')

case "$AR_STATUS" in
  "SIGNED")
    echo "✅ 产品已签约，跳过签约流程"
    # 直接进入应用创建
    ;;
  "SIGNING")
    echo "⏳ 签约处理中，等待完成..."
    # 直接进入应用创建(如果是智能收加上 服务注册)
    ;;
  "NOT_SIGNED"|*)
    echo "📋 产品未签约，开始签约流程"
    # 进入 Step 5 资料采集
    ;;
esac
```

> **详细查询方法见：** `ar-sign-skill/references/query-ar.md`

---

## Step 5: 资料采集

**⚠️ 注意：此步骤仅在签约状态为 NOT_SIGNED 时执行。所有产品均需资料采集，按产品类型采集不同内容。**

### 5.0 检查已有资料数据

```bash
# 根据产品类型检查是否已有采集的资料数据
SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)

if [ "$SALES_CODE" = "I1080300001000160457" ]; then
  # 智能收：检查服务注册入参
  SERVICE_DATA=$(python3 "$STATE_MANAGER" get service_market_data)
  if [ -n "$SERVICE_DATA" ] && [ "$SERVICE_DATA" != "null" ] && [ "$SERVICE_DATA" != "{}" ]; then
    echo "✅ 已有服务注册数据，跳过采集步骤"
    # 进入 Step 6 签约流程
  else
    echo "📋 开始服务注册入参采集流程"
  fi
else
  # 电脑网站支付：检查截图 fileKey
  COLLECT_INFO=$(python3 "$STATE_MANAGER" get collect_information)
  if [ -n "$COLLECT_INFO" ] && [ "$COLLECT_INFO" != "null" ] && [ "$COLLECT_INFO" != "{}" ]; then
    echo "✅ 已有截图数据，跳过采集步骤"
    # 进入 Step 6 签约流程
  else
    echo "📋 开始截图上传采集流程"
  fi
fi
```

### 5.1 判断产品类型

```bash
if [ "$SALES_CODE" = "I1080300001000160457" ]; then
  # 智能收 → 收集 5 项服务注册入参，写入 service_market_data（状态文件）
  # 详见 SKILL.md 资料采集规范 → 智能收 — 服务注册入参采集
else
  # 电脑网站支付 → 收集 3 张截图文件路径，自动上传获取 fileKey
  # 写入 collect_information（状态文件）
fi
```

### 5.2 收集截图（电脑网站支付）

**⚠️ 采集流程：用户提供文件路径（可拖入终端） → skill 自动调用 `alipay-cli file upload` 上传 → 获取 fileKey → 写入共享内存。禁止向用户索取 fileKey。**

```
📋 电脑网站支付需要 3 张网站截图，请提供截图文件路径（可直接拖入终端）：

  1. 首页截图 — 网站首页完整截图（JPG/PNG，≤10MB）
  2. 商品页截图 — 商品或服务页面截图（JPG/PNG，≤10MB）
  3. 支付页截图 — 支付页面截图（JPG/PNG，≤10MB）

示例：/Users/xxx/screenshots/home.png
```

### 5.3 通过 alipay-cli file upload 上传文件并解析 fileKey

**⚠️ 重要：用户提供文件路径后，skill 自动调用 `alipay-cli file upload` 上传并获取 fileKey，无需用户提供 fileKey。**

#### 5.3.1 文件上传调用

```bash
# alipay-cli 文件上传（CLI 子命令，非 MCP 调用）
alipay-cli file upload /path/to/image.png -s payMerchantcodeSkill --json 2>/dev/null
```

**参数说明：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `<FILE_PATH>` | string | 是 | 文件的绝对路径（用户提供，可拖入终端） |
| `-s` | string | 是 | 上传场景，固定值 `payMerchantcodeSkill` |

#### 5.3.2 上传返回格式

```json
// 成功
{
  "success": true,
  "data": {
    "fileKey": "2eec4bbb-2727-4f24-95fe-154e7e941e9a.jpg"
  }
}
```

#### 5.3.3 解析 fileKey 的正确方式

**返回的 JSON 可能有不同的嵌套结构，需要兼容多种路径：**

```bash
# 统一解析函数（兼容多种返回结构）
parse_file_key() {
  local RESULT="$1"
  echo "$RESULT" | jq -r '.data.fileKey // .data.data.fileKey // .fileKey // .result.fileKey // empty'
}
```

#### 5.3.4 完整上传流程（推荐并行上传）

```bash
# 用户提供文件路径后，skill 自动执行以下流程：

# Step 1: 并行上传 3 张截图
alipay-cli file upload "$HOME_IMG" -s payMerchantcodeSkill --json 2>/dev/null > /tmp/upload_home.json &
alipay-cli file upload "$SHOP_IMG" -s payMerchantcodeSkill --json 2>/dev/null > /tmp/upload_shop.json &
alipay-cli file upload "$PAY_IMG" -s payMerchantcodeSkill --json 2>/dev/null > /tmp/upload_pay.json &
wait

# Step 2: 解析 fileKey
HOME_KEY=$(cat /tmp/upload_home.json | jq -r '.data.fileKey // .data.data.fileKey // .fileKey // .result.fileKey // empty')
SHOP_KEY=$(cat /tmp/upload_shop.json | jq -r '.data.fileKey // .data.data.fileKey // .fileKey // .result.fileKey // empty')
PAY_KEY=$(cat /tmp/upload_pay.json | jq -r '.data.fileKey // .data.data.fileKey // .fileKey // .result.fileKey // empty')

# Step 3: 校验上传结果
if [ -z "$HOME_KEY" ] || [ -z "$SHOP_KEY" ] || [ -z "$PAY_KEY" ]; then
  echo "❌ 截图上传失败，请检查文件路径后重试"
  [ -z "$HOME_KEY" ] && echo "  - 首页截图上传失败"
  [ -z "$SHOP_KEY" ] && echo "  - 商品页截图上传失败"
  [ -z "$PAY_KEY" ] && echo "  - 支付页截图上传失败"
  exit 1
fi

echo "✅ 截图上传成功"
echo "  - 首页: $HOME_KEY"
echo "  - 商品页: $SHOP_KEY"
echo "  - 支付页: $PAY_KEY"
```

#### 5.3.5 写入共享内存状态

```bash
# 将 fileKey 写入共享内存状态（collect_information 字段）
python3 "$STATE_MANAGER" set-json collect_information "{\"pc_home_page_image\":\"$HOME_KEY\",\"pc_shop_page_image\":\"$SHOP_KEY\",\"pc_payment_image\":\"$PAY_KEY\"}"
# ⚠️ 禁止写入 status 字段，流程进度通过 MCP 真实查询判断
```

### 5.4 智能收 — 服务注册入参采集

**⚠️ 仅当产品为智能收（salesCode = I1080300001000160457）时执行此步骤。**

```
📋 智能收需要提供服务注册信息（共 5 项）：

  1. 服务名称（1-50 字符）— 如：天气查询
  2. 服务描述（1-500 字符）— 简要描述服务功能
  3. 服务地址（URL）— 可访问的 API 地址，如：https://api.example.com/weather
  4. 服务单价（元）— 最低 0.01 元
  5. 请求示例（JSON）— 接口请求示例，如：{"city": "北京"}

请依次提供以上信息。
```

#### 5.4.1 写入共享内存状态

```bash
# 智能收的服务注册入参采集后写入状态文件（service_market_data 字段）
python3 "$STATE_MANAGER" set-json service_market_data "{
  \"serviceName\": \"$SERVICE_NAME\",
  \"serviceDesc\": \"$SERVICE_DESC\",
  \"resourceUrl\": \"$RESOURCE_URL\",
  \"pricing\": \"$PRICING\",
  \"schemaUrl\": \"$SCHEMA_URL\"
}"

# 验证写入
SERVICE_DATA=$(python3 "$STATE_MANAGER" get service_market_data)
if [ -z "$SERVICE_DATA" ] || [ "$SERVICE_DATA" = "null" ]; then
  echo "❌ 服务注册数据写入失败"
  exit 1
fi

echo "✅ 服务注册信息已保存"
```

#### 5.4.2 service-market 子技能读取入参

**⚠️ service-market 子技能在 Step 6 并行执行时，从状态文件读取入参，而非从运行时变量获取。**

```bash
# service-market 子技能在 Step 6 并行执行时，从状态文件读取入参
SERVICE_NAME=$(python3 "$STATE_MANAGER" get service_market_data.serviceName)
SERVICE_DESC=$(python3 "$STATE_MANAGER" get service_market_data.serviceDesc)
RESOURCE_URL=$(python3 "$STATE_MANAGER" get service_market_data.resourceUrl)
PRICING=$(python3 "$STATE_MANAGER" get service_market_data.pricing)
SCHEMA_URL=$(python3 "$STATE_MANAGER" get service_market_data.schemaUrl)
```

### 5.5 资料就绪确认

**⚠️ 资料采集完成后，确认数据完整即可进入 Step 6 签约提交。**

```bash
# 根据产品类型确认资料完整性
SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)

if [ "$SALES_CODE" = "I1080300001000160457" ]; then
  # 智能收：确认服务注册入参已写入共享内存
  SERVICE_NAME=$(python3 "$STATE_MANAGER" get service_market_data.serviceName)
  SERVICE_DESC=$(python3 "$STATE_MANAGER" get service_market_data.serviceDesc)
  RESOURCE_URL=$(python3 "$STATE_MANAGER" get service_market_data.resourceUrl)
  PRICING=$(python3 "$STATE_MANAGER" get service_market_data.pricing)
  SCHEMA_URL=$(python3 "$STATE_MANAGER" get service_market_data.schemaUrl)

  if [ -z "$SERVICE_NAME" ] || [ -z "$SERVICE_DESC" ] || [ -z "$RESOURCE_URL" ] || [ -z "$PRICING" ] || [ -z "$SCHEMA_URL" ]; then
    echo "❌ 服务注册数据不完整，请重新提供"
  fi
else
  # 电脑网站支付：确认截图 fileKey 已写入共享内存
  HOME_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_home_page_image)
  SHOP_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_shop_page_image)
  PAY_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_payment_image)

  if [ -z "$HOME_KEY" ] || [ -z "$SHOP_KEY" ] || [ -z "$PAY_KEY" ]; then
    echo "❌ 截图数据不完整，请重新上传"
  fi
fi
```

---

## Step 6: 产品签约与应用创建

### ⚠️ 签约提交：直接调用 ar-sign apply

**签约提交由主技能直接调用 `./ar-sign-skill/ar-sign apply --data`，跳过 previewFormView 流程。签约查询和产品推荐委托 ar-sign-skill 子技能处理。**

> **⛔ 详细的 apply JSON 结构、变量来源、完整示例和禁止行为见 SKILL.md「⛔ 签约规范（统一入口，规则集中）」章节。**

```bash
# 生成 UUID（每次签约提交前生成新的）
BIZ_REQUEST_NO=$(python3 -c "import uuid; print(uuid.uuid4())")

# 电脑网站支付签约提交
HOME_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_home_page_image)
SHOP_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_shop_page_image)
PAY_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_payment_image)

./ar-sign-skill/ar-sign apply --data "$(cat <<EOF
{
  "request": {
    "bizFeatures": {},
    "bizRequestNo": "${BIZ_REQUEST_NO}",
    "businessProperty": {
      "mccCode": "${MCC_CODE}",
      "webAppDTO": {
        "placeType": "ONLINE_WEBAPP",
        "appType": "PC_WEB",
        "appStatus": "OFFLINE",
        "screenshot": ["${HOME_KEY}", "${SHOP_KEY}", "${PAY_KEY}"]
      }
    },
    "channelCode": "B_SK_SH_RPC",
    "extension": {},
    "orderType": "NEW_SIGN",
    "salesProductCodes": ["I1080300001000041203"]
  },
  "ctx": {}
}
EOF
)"

# 智能收签约提交（重新生成 UUID）
BIZ_REQUEST_NO=$(python3 -c "import uuid; print(uuid.uuid4())")

./ar-sign-skill/ar-sign apply --data "$(cat <<EOF
{
  "request": {
    "bizFeatures": {},
    "bizRequestNo": "${BIZ_REQUEST_NO}",
    "businessProperty": {
      "mccCode": "${MCC_CODE}"
    },
    "channelCode": "B_SK_SH_RPC",
    "extension": {},
    "orderType": "NEW_SIGN",
    "salesProductCodes": ["I1080300001000160457"]
  },
  "ctx": {}
}
EOF
)"
```

### 并行执行规范

**⚠️ 签约、服务注册、应用创建三方互不依赖，必须并行执行。**

| 分支 | 操作 | 依赖子技能 | 适用产品 |
|------|------|------------|----------|
| Branch A | 产品签约 | 主技能直调 `./ar-sign-skill/ar-sign apply` | 所有产品 |
| Branch B | 服务注册 | Read `service-market/SKILL.md` | 仅智能收（从共享内存 service_market_data 读取入参） |
| Branch C | 应用创建 | Read `application-publish/SKILL.md` | 所有产品 |

```
✅ 必须：并行启动三个分支，缩短整体耗时
✅ 必须：每个分支执行前先校验 scope 权限
❌ 禁止：顺序执行三个分支（应并行）
❌ 禁止：等待某个分支完成后再启动其他分支
```

### apply JSON 关键变量

| 变量 | 来源 | 说明 |
|------|------|------|
| `bizRequestNo` | 主技能生成 | UUID，通过 `python3 -c "import uuid; print(uuid.uuid4())"` 生成，**禁止省略** |
| `mccCode` | Step 2 方案规划 | 运行时变量，格式 `Axxxx_Bxxxx`，不持久化到状态文件 |
| `channelCode` | 固定值 | `"B_SK_SH_RPC"` |
| `orderType` | 固定值 | `"NEW_SIGN"` |
| `screenshot` | Step 5 资料采集 | 仅电脑网站支付需要，fileKey 字符串数组 |

---

## Step 7.5: 支付能力集成配置

**⚠️ 触发条件：Branch C（应用创建）完成，appId 已成功获取，公钥已确认。**

### 前置条件

**application-publish 子技能必须完成以下步骤并返回结果：**

1. ✅ 查询已有应用并让用户选择（复用/新建）
2. ✅ 创建或复用应用，获得 appId
3. ✅ 设置应用公钥（如需要）
4. ✅ 公钥确认成功后，保存支付宝公钥到本地文件 ~/.alipay/config/2021000000000000-alipayPublicKey.keytext 告诉用户
5. ✅ 提交应用审核（如需要）
6. ✅ 返回成功结果（含 appId）

### 执行逻辑

当 application-publish 子技能返回成功结果后，主技能自动触发支付能力集成配置：

```json
// application-publish 子技能返回格式
{
  "success": true,
  "appId": "2021000000000000",
  "status": "AUDIT" | "ON_LINE",
  "alipayPublicKeySaved": true,
  "alipayPublicKeyPath": "~/.alipay/config/2021000000000000-alipayPublicKey.keytext",
  "message": "应用创建/发布成功"
}
```

```markdown
✅ 应用创建完成

📱 应用信息：
  • 应用ID：2021000000000000
  • 应用状态：AUDIT (审核中)
  • 公钥状态：已配置
  • 支付宝公钥：已保存至 ~/.alipay/config/2021000000000000-alipayPublicKey.keytext

🔷 正在为您调用支付能力集成配置...

传入参数：appId = 2021000000000000
```

### 调用方式

**使用 Skill 工具调用 `alipay-payment-production-integration`：**

```
Skill tool call:
  skill: "alipay-payment-production-integration"
  args: "<appId>"
```

**说明：**
- `appId` 从 application-publish 子技能返回结果中获取（必须存在）
- `alipayPublicKeySaved` 标识支付宝公钥是否已保存到本地
- 调用后，alipay-payment-production-integration skill 将接管后续的支付能力集成流程
- 当前入驻流程在此步骤后结束，进入 Step 8 清理阶段

### 调用时机判断

| 子技能返回结果 | 处理方式 |
|----------------|----------|
| `success: true` 且 `appId` 存在 | 调用 alipay-payment-production-integration，传入 appId |
| `success: true` 但 `appId` 为空 | 不调用，输出警告信息，进入 Step 8 |
| `success: false` 或执行失败 | 不调用，输出错误信息，进入 Step 8 |

### 与 Step 0 的区别

| 调用点 | 场景 | appId 来源 | 支付宝公钥 |
|--------|------|------------|------------|
| Step 0 分支 A | 用户已有凭证，直接进入集成配置 | 从凭证中读取或用户输入 | 需用户自行配置 |
| Step 0 分支 B 选项 2 | 用户选择"我已经是商家" | 用户输入或查询获取 | 需用户自行配置 |
| **Step 7.5** | **当前入驻流程中应用创建成功后** | **从 application-publish 返回** | **已自动保存到本地** |

---

## Step 8: 流程结束

### 7.1 输出入驻结果

```markdown
🎉 支付宝商家入驻流程结束！

📦 产品信息：
  • 产品类型：电脑网站支付
  • 经营类目：零售批发 > 电商平台

📋 签约信息：
  • 签约状态：已签约
  • 签约时间：2026-04-20 10:00:00

📱 应用信息：
  • 应用ID：2021000000000000
  • 应用类型：WEBAPP
  • 审核状态：已通过
```

### 7.2 清理共享内存状态（备份后删除）

**⚠️ 重要：流程结束后必须执行共享内存状态清理。**

#### 清理条件判断

```bash
STATE_MANAGER=<skill-dir>/scripts/state_manager.py
BACKUP_DIR=~/.alipay/alipay-merchant-onboarding/archive

# 检查状态是否存在
if [ "$(python3 "$STATE_MANAGER" exists)" = "false" ]; then
  echo "⚠️ 共享内存状态不存在，无需清理"
  exit 0
fi

# ⚠️ 不再通过 status/appId 字段判断是否完成
# 流程状态通过 MCP 真实查询判断，清理由用户确认后执行

echo "✅ 准备清理共享内存状态..."
```

#### 执行清理

```bash
# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 生成备份文件名（带时间戳）
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/$(whoami)_$TIMESTAMP.json"

# 备份共享内存状态到文件
python3 "$STATE_MANAGER" show > "$BACKUP_FILE"
echo "✅ 状态已备份: $BACKUP_FILE"

# 删除共享内存
python3 "$STATE_MANAGER" delete
echo "✅ 共享内存状态已清理"

# 清理共享内存状态文件（如果存在）
STATE_FILE=~/.alipay/alipay-merchant-onboarding/state.json
if [ -f "$STATE_FILE" ]; then
  rm "$STATE_FILE"
  echo "✅ 共享内存状态文件已清理"
fi

echo ""
echo "💡 下次启动将开始新的入驻流程"
```

#### 清理后的目录结构

```
~/.alipay/alipay-merchant-onboarding/
├── archive/                          # 备份目录
│   ├── user1_20260424_103000.json   # 历史入驻记录
│   ├── user1_20260425_140000.json   # 历史入驻记录
│   └── ...
└── (共享内存状态已删除)
```

#### 清理规范

```
✅ 必须：签约状态（MCP 查询）为 SIGNED 且应用创建成功后才执行清理
✅ 必须：通过 MCP 真实查询判断流程完成，禁止依赖本地 status/appId 字段
✅ 必须：备份后再删除，保留历史记录
✅ 必须：备份文件名包含用户名和时间戳
✅ 可选：清理共享内存状态文件

❌ 禁止：未备份直接删除
❌ 禁止：非完成状态执行清理
❌ 禁止：通过 status/appId 字段判断完成状态（这些字段禁止写入状态文件）
❌ 禁止：删除备份目录中的历史文件
```

> **详细说明见：** `references/state-management.md`
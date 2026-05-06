# 登录授权流程规范

> 本文档整合所有登录授权相关的规范和流程。
> 被引用文档：`SKILL.md`

---

## 目录

1. [CLI 前置检查](#cli-前置检查)
2. [登录状态检查](#登录状态检查)
3. [授权前用户确认（强制执行）](#授权前用户确认强制执行)
4. [执行登录](#执行登录)
5. [授权确认流程](#授权确认流程)
6. [生成授权链接](#生成授权链接)
7. [授权信息展示规范](#授权信息展示规范)
8. [权限检查](#权限检查)
9. [登录过期重新授权](#登录过期重新授权)
   - [检测登录过期](#检测登录过期)
   - [⛔ 重新授权三参数铁律](#⛔-重新授权三参数铁律最高优先级)
   - [重新授权流程](#重新授权流程)

---

## CLI 前置检查

**在执行任何 CLI 操作之前，必须先检测 alipay-cli 是否已安装。**

### 检测逻辑

```bash
# Step 1: 检测 CLI 是否可用
if ! alipay-cli version &>/dev/null; then
  echo "⚠️ alipay-cli 未安装，正在自动安装..."

  # Step 2: 执行安装脚本
  curl -fsSL https://opengw.alipay.com/alipaycli/install | bash

  # Step 3: 验证安装结果
  if ! alipay-cli version &>/dev/null; then
    echo "❌ alipay-cli 安装失败，请手动安装后重试"
    exit 1
  fi

  echo "✅ alipay-cli 安装成功"
fi
```

### 检测时机

**必须在以下操作前执行 CLI 检测：**
- 执行 `whoami` 检查登录状态前
- 执行 `login` 登录授权前
- 执行任何 MCP 调用前

### 检测优先级

```
Step 0: CLI 前置检查（alipay-cli version）
    ↓ 存在 → 继续
    ↓ 不存在 → 自动安装 → 验证 → 继续
```

> **注意：** CLI 检测应在 Step 1 初始化之前执行。

---

## 登录状态检查

### 方法一：whoami（推荐用于开始时）

```bash
CHECK_RESULT=$(alipay-cli whoami --json 2>&1)
LOGGED_IN=$(echo "$CHECK_RESULT" | jq -r '.data.logged_in // false')
```

**返回格式：**

```json
// 已登录
{ "success": true, "data": { "logged_in": true, "expires_at": "2026-04-20T15:37:42+08:00" } }

// 未登录
{ "success": true, "data": { "logged_in": false, "expires_at": "0001-01-01T00:00:00Z" } }
```

**判断方式：检查 `.data.logged_in` 字段（不是外层的 `.success`）**

### 方案规划阶段的 whoami 预检（Step 2）

**⚠️ 重要：在方案规划阶段（Step 2）如果执行 whoami 检查，当返回过期（`logged_in: false`）时，不要中断流程，当用户没登录继续往下走。**

```bash
# 方案规划阶段的登录状态预检
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

| whoami 返回 | 处理方式 | 说明 |
|------------|----------|------|
| `logged_in: true` | 记录状态，继续 | 后续 Step 3 校验 scope 权限 |
| `logged_in: false`（过期） | **当用户没登录，继续往下走** | 不中断流程，登录授权统一在 Step 3 处理 |
| 其他错误（网络/CLI 问题） | 忽略错误，继续 | 不影响方案规划流程 |

**禁止行为：**

```
❌ 禁止：whoami 返回过期时报错或中断流程
❌ 禁止：whoami 返回过期时要求用户立即登录
❌ 禁止：因过期状态阻塞方案规划流程
✅ 正确：过期或未登录时，当用户没登录，继续往下走
✅ 正确：登录授权统一在 Step 3 处理
```

### 方法二：login --complete（用户授权后确认）

**⚠️ 注意：不再使用轮询机制。输出授权链接后，等待用户确认授权完成，然后执行一次确认。**

```bash
# 用户确认在浏览器完成授权后，执行一次确认
RESULT=$(alipay-cli login --complete --json 2>&1)
DATA_SUCCESS=$(echo "$RESULT" | jq -r '.data.success // false')
```

**返回格式：**

```json
// 授权成功
{ "success": true, "data": { "success": true, "expires_at": "...", "scope": "..." } }

// 授权失败/未完成
{ "success": true, "data": { "success": false, "error": { "code": "authorization_pending" } } }

// 授权过期
{ "success": true, "data": { "success": false, "error": { "code": "auth_expired" } } }
```

**判断方式：检查 `.data.success` 字段（不是外层的 `.success`）**

**⚠️ 重要：授权链接输出后，不要自动轮询。应由用户主动确认"我已完成授权"后再调用此命令确认。**

---

## 授权前用户确认（强制执行）

<重要>
**在执行登录授权前，必须先输出产品类型和经营类目给用户确认！**

**执行流程：**

```
1. 输出产品类型和经营类目 → 让用户确认信息正确
2. 用户确认后 → 执行登录命令获取 device_code
3. 输出授权链接和授权信息 → 等待用户扫码授权
4. 用户确认授权完成 → 执行 login --complete 确认
```

**确认输出格式（固定展示）：**

```bash
# 从状态管理器读取产品类型
PRODUCT_NAME=$(python3 "$STATE_MANAGER" get productName)
[ -z "$PRODUCT_NAME" ] && PRODUCT_NAME="未知产品"

# ⚠️ mccCode/mccName 为运行时变量，不写状态文件；此处使用运行时变量
MCC_CODE="${MCC_CODE:-}"
MCC_NAME="${MCC_NAME:-}"

# 使用 heredoc 一次性输出确认信息（Markdown 格式，确保 Coze 兼容）
cat << EOF

---

## 📋 请确认您的选择信息

---

- **产品类型**: ${PRODUCT_NAME}
- **经营类目**: ${MCC_NAME}
- **类目编码**: ${MCC_CODE}

---

确认信息无误后，将为您生成授权链接。
是否确认？(是/否)
EOF
```

**禁止行为：**

```
❌ 禁止：未经用户确认直接执行登录命令
❌ 禁止：跳过产品类型和经营类目的展示
❌ 禁止：条件性隐藏产品或类目信息
❌ 禁止：在未获用户确认前调用 login 命令
```

</重要>

---

## 执行登录

### ⚠️ CLI 命令参数规范

**所有 CLI 命令参数必须严格按照本文档定义执行，禁止模型自行创造、推断或修改任何参数！**

**login 命令必须携带 scope：**

```bash
# ✅ 正确：login 必须携带 --scope 参数
alipay-cli login --non-interactive --scope "$SCOPE" --json

# ❌ 禁止：不带 scope 的 login
alipay-cli login --non-interactive --json

# ❌ 禁止：自行修改 scope 值
alipay-cli login --non-interactive --scope "my_custom_scope" --json
```

**Scope 定义（禁止修改）：**

| 产品 | salesCode | Scope（固定值） |
|------|-----------|-----------------|
| 电脑网站支付 | I1080300001000041203 | `app:all,fast_instant_trade_pay:write` |
| 智能收 | I1080300001000160457 | `app:all,machine_pay:write,agmnt:write` |

**禁止行为：**

```
❌ 禁止：自行创造 CLI 参数（如 --custom-flag）
❌ 禁止：修改 scope 格式或值
❌ 禁止：添加文档未定义的参数组合
❌ 禁止：基于猜测调用 CLI 命令
```

### 场景一：首次入驻（状态文件无数据）

```bash
# 此时 SALES_CODE 和 MCC_CODE 由用户选择或从内存变量获取
# 无需从状态文件读取

# 根据产品类型确定 scope
case "$SALES_CODE" in
  "I1080300001000041203") SCOPE="app:all,fast_instant_trade_pay:write" ;;  # 电脑网站支付
  "I1080300001000160457") SCOPE="app:all,machine_pay:write,agmnt:write" ;;  # 智能收
  *) echo "❌ 未知产品码"; exit 1 ;;
esac

# 执行登录
LOGIN_RESULT=$(alipay-cli login --non-interactive --scope "$SCOPE" --json 2>&1)

# 解析 device_code
DEVICE_CODE=$(echo "$LOGIN_RESULT" | jq -r '.data.data.device_code // empty')
VERIFICATION_CODE=$(echo "$LOGIN_RESULT" | jq -r '.data.data.verification_code // empty')
```

### 场景二：登录过期（状态文件有数据）

**⚠️ 重要：当检测到登录过期（whoami 返回 logged_in: false 或 MCP 调用返回 401 错误），但状态文件中有历史数据时，必须从状态文件获取 productCode 和 mccCode 来构造 scope。**

```bash
# Step 1: 从状态管理器读取产品码
SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)
# ⚠️ mccCode 为运行时变量，状态文件中不存在
# 如需 mccCode，从上下文中获取（Step 2 方案规划阶段的运行时变量）

# Step 2: 验证必要数据存在
if [ -z "$SALES_CODE" ]; then
  echo "❌ 状态文件缺少产品码或类目码，无法重新授权"
  echo "📋 salesCode: ${SALES_CODE:-空}"
  echo "📋 mccCode: ${MCC_CODE:-空}"
  echo "📋 请重新执行入驻流程"
  exit 1
fi

# Step 3: 根据 salesCode 构造 scope（禁止自行修改）
case "$SALES_CODE" in
  "I1080300001000041203") SCOPE="app:all,fast_instant_trade_pay:write" ;;  # 电脑网站支付
  "I1080300001000160457") SCOPE="app:all,machine_pay:write,agmnt:write" ;;  # 智能收
  *) echo "❌ 未知产品码: $SALES_CODE"; exit 1 ;;
esac

# Step 4: 执行登录（必须携带 scope）
LOGIN_RESULT=$(alipay-cli login --non-interactive --scope "$SCOPE" --json 2>&1)

# Step 5: 解析 device_code 和 verification_code
DEVICE_CODE=$(echo "$LOGIN_RESULT" | jq -r '.data.data.device_code // empty')
VERIFICATION_CODE=$(echo "$LOGIN_RESULT" | jq -r '.data.data.verification_code // empty')

# Step 6: 校验登录结果
if [ -z "$DEVICE_CODE" ]; then
  echo "❌ 登录失败，无法获取 device_code"
  echo "📋 返回结果: $LOGIN_RESULT"
  exit 1
fi

echo "✅ 成功获取 device_code，准备生成授权链接"
```

### 获取 device_code（通用逻辑）

```bash
# 解析 device_code（两种场景通用）
DEVICE_CODE=$(echo "$LOGIN_RESULT" | jq -r '.data.data.device_code // empty')
VERIFICATION_CODE=$(echo "$LOGIN_RESULT" | jq -r '.data.data.verification_code // empty')
EXPIRES_IN=$(echo "$LOGIN_RESULT" | jq -r '.data.data.expires_in // 600')

# 将有效期秒数转为可读格式
if [ "$EXPIRES_IN" -ge 60 ] 2>/dev/null; then
  EXPIRES_MIN=$((EXPIRES_IN / 60))
  EXPIRES_DISPLAY="${EXPIRES_MIN} 分钟"
else
  EXPIRES_DISPLAY="${EXPIRES_IN} 秒"
fi
```

### ⚠️ 禁止透出 CLI 返回的 verification_url

**CLI 返回的 JSON 中包含 `verification_url` 字段，此链接无法用于授权，禁止透出给用户！**

> **详细说明见：** [生成授权链接 → 授权链接规范](#生成授权链接)

---

## 授权确认流程

### ⚠️ 不再使用轮询机制

**授权流程：**

1. **输出授权链接** → 确保浏览器链接完整输出给用户
2. **等待用户确认** → 由用户主动确认"我已完成授权"
3. **执行确认命令** → 用户确认后，执行 `login --complete` 一次性确认

**禁止行为：**

```
❌ 禁止：自动轮询检查授权状态
❌ 禁止：循环调用 login --complete
❌ 禁止：在未获用户确认前调用 login --complete
```

### 授权确认命令

```bash
# 用户确认在浏览器完成授权后，执行一次确认
RESULT=$(alipay-cli login --complete --json 2>&1)
DATA_SUCCESS=$(echo "$RESULT" | jq -r '.data.success // false')

if [ "$DATA_SUCCESS" = "true" ]; then
  echo "✅ 授权成功"
else
  ERROR_CODE=$(echo "$RESULT" | jq -r '.data.error.code // "unknown"')
  echo "❌ 授权失败: $ERROR_CODE"
fi
```

---

## 生成授权链接

### 参数校验（必须执行）

```bash
# ⚠️ 必须确保三个参数都有值，否则不能透出给用户
if [ -z "$DEVICE_CODE" ] || [ -z "$SALES_CODE" ] || [ -z "$MCC_CODE" ]; then
  echo "❌ 授权链接参数不完整，无法生成授权链接"
  echo "📋 deviceCode: ${DEVICE_CODE:-空}"
  echo "📋 productCode: ${SALES_CODE:-空}"
  echo "📋 mccCode: ${MCC_CODE:-空}"
  exit 1
fi
```

### 构建链接

```bash
# ⚠️ 只输出处理后的 BROWSER_URL，不暴露 CLI 返回的 verification_url
BROWSER_URL="https://aipay.alipay.com/cli-auth?deviceCode=${DEVICE_CODE}&productCode=${SALES_CODE}&mccCode=${MCC_CODE}"

# ⚠️ deviceCode、browserUrl、verificationCode 为运行时变量，不写入状态文件
# salesCode 已在 Step 2 方案规划确认后写入状态文件，mccCode 为运行时变量
```

### ⚠️ 授权链接规范

**CLI 的 `login` 命令会返回 `verification_url` 字段，此链接无法用于授权，禁止透出给用户！**

#### CLI 返回结构说明

```bash
# CLI login 命令返回示例
{
  "success": true,
  "data": {
    "data": {
      "device_code": "xxx",
      "verification_url": "https://opengw.alipay.com/oauth/device",  # ← 禁止透出
      "verification_code": "ABCD1234"
    }
  }
}
```

**重要：** `verification_url` 字段指向的是一个无法完成授权的页面，必须使用正确的授权链接格式。

#### 正确的授权链接格式

```
❌ 禁止透出：https://opengw.alipay.com/oauth/device （此链接无法授权）

✅ 正确链接：[点击跳转进行授权](https://aipay.alipay.com/cli-auth?deviceCode=xxx&productCode=xxx&mccCode=xxx)
```

**链接参数说明：**
- `deviceCode`：从 CLI 返回的 `device_code` 字段获取
- `productCode`：当前入驻的产品码（salesCode）
- `mccCode`：当前选择的经营类目编码

#### 处理流程

```bash
# 解析 CLI 返回结果（只取 device_code 和 verification_code，不使用 verification_url）
# 详细解法见"执行登录 → 获取 device_code"章节

# 构建正确的授权链接
BROWSER_URL="https://aipay.alipay.com/cli-auth?deviceCode=${DEVICE_CODE}&productCode=${SALES_CODE}&mccCode=${MCC_CODE}"

# 输出正确的授权链接给用户（使用 Markdown 链接格式）
echo "🌐 请在浏览器打开以下链接进行授权：[点击跳转进行授权]($BROWSER_URL)"
```

---

## 授权信息展示规范

### ⚠️ 固定展示 4 项信息 + 授权链接

**向用户透出授权链接时，必须固定展示以下 4 项信息（无论是否有值都需展示）和授权链接：**

```
1. 产品类型（productName）— 如：电脑网站支付、智能收
2. 经营类目（mccName + mccCode）— 如：零售批发 > 互联网综合电商平台 (A0002_B0114)
3. 确认码（verificationCode）— login 返回的 verification_code
4. 授权链接（Markdown 可点击格式）— 自行构造的 BROWSER_URL

在您授权完成之后，请您在对话框中告诉我 好了

禁止条件性隐藏任何字段！
禁止将类目名称和编码分开为两行独立展示！
禁止使用纯文本链接（必须用 Markdown 可点击格式）！
```

### ⚠️ 确认码安全确认提示

**确认码输出时必须附加安全确认提示，提醒用户核对扫码页面显示的确认码，不要提示用户在页面输入此确认码，不需要输入！！只需要核对**

```
⚠️ 安全提示：
   请核对授权页面显示的确认码是否与上方一致，如不一致，请勿授权，立即停止操作！
```

### ⚠️ 有效期来源

**授权链接有效期从 login 返回的 `expires_in` 字段获取（与 `device_code`、`verification_code` 同级），禁止硬编码。**

### 输出格式

```bash
# 从状态管理器读取产品类型
PRODUCT_NAME=$(python3 "$STATE_MANAGER" get productName)
[ -z "$PRODUCT_NAME" ] && PRODUCT_NAME="未知产品"

# ⚠️ mccCode/mccName 为运行时变量，不写状态文件；此处使用运行时变量
MCC_CODE="${MCC_CODE:-}"
MCC_NAME="${MCC_NAME:-}"

# 解析 MCC 类目名称（如果有 mccName 则直接使用，否则从 mcc_reference.md 解析）
if [ -z "$MCC_NAME" ] && [ -n "$MCC_CODE" ]; then
  MCC_NAME="（请参考类目编码: $MCC_CODE）"
fi

# 使用 heredoc 一次性输出完整授权信息（Markdown 格式，确保 Coze 兼容）
cat << EOF

---

## 🔐 支付宝授权登录

---

📅 **授权链接有效期**: ${EXPIRES_DISPLAY}

---

### 📋 授权信息

---

- **产品类型**: ${PRODUCT_NAME}
- **经营类目**: ${MCC_NAME} (${MCC_CODE})
- **确认码**: ${VERIFICATION_CODE}

---

### ⚠️ 安全提示

请核对授权页面显示的确认码是否与上方一致，如不一致，请勿授权，立即停止操作！

---

### 🌐 授权链接

[点击跳转进行授权](${BROWSER_URL})


### 输出示例

```markdown
---

## 🔐 支付宝授权登录

---

📅 **授权链接有效期**: 10 分钟

---

### 📋 授权信息

---

- **产品类型**: 电脑网站支付
- **经营类目**: 零售批发 > 互联网综合电商平台 (A0002_B0114)
- **确认码**: ABCD1234

---

### ⚠️ 安全提示

请核对授权页面显示的确认码是否与上方一致，如不一致，请勿授权，立即停止操作！

---

### 🌐 授权链接

[点击跳转进行授权](https://aipay.alipay.com/cli-auth?deviceCode=xxx&productCode=xxx&mccCode=xxx)

```
```

---

## 权限检查

### Scope 权限检查

```bash
# 检查当前授权是否包含所需权限
GRANTED_SCOPE=$(echo "$CHECK_RESULT" | jq -r '.data.scope // empty')
REQUIRED_SCOPE=$(echo "$SCOPE" | sed 's/app:all,//' | sed 's/,app:all//')

if echo "$GRANTED_SCOPE" | grep -q "$REQUIRED_SCOPE"; then
  echo "✅ Scope 权限检查通过"
else
  echo "⚠️ 当前授权范围不包含所需权限，需要重新授权"
  # 引导用户重新授权
fi
```

### MCC 一致性检查

```bash
# ⚠️ mccCode 为运行时变量（Step 2 方案规划阶段确定），不在状态文件中
# 如需检查 MCC 变更，通过上下文中的运行时变量获取
NEW_MCC="${MCC_CODE:-}"
# authorizedMccCode 不存在状态文件中，通过 MCP 查询判断

if [ -n "$NEW_MCC" ]; then
  # MCC 变更检测需通过 MCP 调用结果判断
  # 如果 MCP 返回 "mccCode is not auth"，说明类目不匹配
  echo "📋 当前类目: $NEW_MCC，如 MCP 返回授权不匹配将引导重新授权"
fi
```

---

## 登录过期重新授权

### 检测登录过期

登录过期判断条件：
- `whoami` 返回 `logged_in: false`
- MCP 调用返回 `HTTP 401` 错误
- MCP 返回 `Authorization is empty` 或 `非法的认证信息`

### ⛔ 重新授权三参数铁律（最高优先级）

**无论是首次授权还是重新授权，构造授权链接时必须带上 deviceCode、productCode、mccCode 三个参数，缺一不可！**

> **核心原则：三参数合一，缺一即失败。重新授权时尤其注意 mccCode 不可丢失！**

```
✅ 必须：首次授权时带上三个参数
✅ 必须：重新授权时带上三个参数
✅ 必须：登录过期重新授权时带上三个参数
✅ 必须：Scope 不足重新授权时带上三个参数
✅ 必须：授权信息不匹配重新授权时带上三个参数

❌ 禁止：重新授权时省略任何参数
❌ 禁止：认为重新授权只需要 deviceCode
❌ 禁止：认为 productCode/mccCode 在重新授权时可选
❌ 禁止：重新授权时遗漏 mccCode（mccCode 是运行时变量，需从上下文获取不会自动保留）
```

**重新授权场景参数来源：**

| 场景 | deviceCode 来源 | productCode 来源 | mccCode 来源 |
|------|-----------------|------------------|--------------|
| 首次授权 | login 返回的 device_code | Step 2 方案规划确认的 salesCode | Step 2 MCC 推荐的类目编码 |
| 登录过期重新授权 | 新 login 返回的 device_code | 状态文件 salesCode 字段 | 运行时上下文变量（需确保传递） |
| Scope 不足重新授权 | 新 login 返回的 device_code | 状态文件 salesCode 字段 | 运行时上下文变量（需确保传递） |
| 授权信息不匹配重新授权 | 新 login 返回的 device_code | 状态文件 salesCode 字段 | 运行时上下文变量（需确保传递） |

**⚠️ 模型执行铁律：**

```
执行重新授权时，模型必须：
  1. 执行新 login 命令获取新的 deviceCode
  2. 从状态文件读取 salesCode 作为 productCode
  3. 从上文运行时变量获取 mccCode（如 mccCode 已丢失，需重新询问用户类目）
  4. 校验三个参数均有值后，构造授权链接
  5. 输出授权信息给用户

参数校验（必须执行）：
  if [ -z "$DEVICE_CODE" ] || [ -z "$SALES_CODE" ] || [ -z "$MCC_CODE" ]; then
    echo "❌ 授权链接参数不完整，无法生成授权链接"
    exit 1
  fi
```

**禁止行为：**

```
❌ 禁止：在重新授权场景只使用 deviceCode 构造授权链接
❌ 禁止：假设 mccCode 会自动从状态文件恢复（mccCode 是运行时变量，不写状态文件）
❌ 禁止：在 mccCode 丢失时跳过参数校验直接生成链接
❌ 禁止：因"重新授权"而省略三参数中的任何一个
```

### 重新授权流程

**当登录过期但状态文件中有历史数据时，必须确保三参数齐全（deviceCode、productCode、mccCode）才能生成授权链接。**

```bash
# ⛔ 重新授权必须获取三个参数

# Step 1: 从状态管理器读取产品码（作为 productCode）
SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)

# Step 2: 从运行时上下文获取 mccCode（mccCode 是运行时变量，不写状态文件）
# ⚠️ 重要：如 mccCode 已丢失，需重新询问用户类目
if [ -z "$MCC_CODE" ]; then
  echo "❌ mccCode 已丢失，无法生成授权链接"
  echo "📋 请重新选择经营类目"
  # 此处需触发 MCC 重新推荐流程
  exit 1
fi

# Step 3: 验证必要数据存在
if [ -z "$SALES_CODE" ]; then
  echo "❌ 状态文件缺少产品码，无法重新授权"
  echo "📋 请重新执行入驻流程"
  exit 1
fi

# Step 4: 根据 salesCode 构造 scope
case "$SALES_CODE" in
  "I1080300001000041203") SCOPE="app:all,fast_instant_trade_pay:write" ;;
  "I1080300001000160457") SCOPE="app:all,machine_pay:write,agmnt:write" ;;
  *) echo "❌ 未知产品码: $SALES_CODE"; exit 1 ;;
esac

# Step 5: 执行登录（获取新的 deviceCode）
LOGIN_RESULT=$(alipay-cli login --non-interactive --scope "$SCOPE" --json 2>&1)

# Step 6: 解析新的 deviceCode
DEVICE_CODE=$(echo "$LOGIN_RESULT" | jq -r '.data.data.device_code // empty')
VERIFICATION_CODE=$(echo "$LOGIN_RESULT" | jq -r '.data.data.verification_code // empty')
EXPIRES_IN=$(echo "$LOGIN_RESULT" | jq -r '.data.data.expires_in // 600')

# Step 7: ⛔ 三参数校验（必须执行）
if [ -z "$DEVICE_CODE" ] || [ -z "$SALES_CODE" ] || [ -z "$MCC_CODE" ]; then
  echo "❌ 授权链接参数不完整，无法生成授权链接"
  echo "📋 deviceCode: ${DEVICE_CODE:-空}"
  echo "📋 productCode: ${SALES_CODE:-空}"
  echo "📋 mccCode: ${MCC_CODE:-空}"
  exit 1
fi

# Step 8: 构造授权链接（三参数齐全）
BROWSER_URL="https://aipay.alipay.com/cli-auth?deviceCode=${DEVICE_CODE}&productCode=${SALES_CODE}&mccCode=${MCC_CODE}"

echo "✅ 重新授权链接已生成"
```

---

## 完整授权流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                      登录授权完整流程                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 0: CLI 前置检查                                            │
│    ├─ 检测 alipay-cli version                                   │
│    └─ 不存在 → 自动安装 → 验证                                   │
│                                                                 │
│  Step 1: 检查登录状态                                            │
│    └─ whoami --json                                             │
│                                                                 │
│  Step 2: 授权前用户确认（强制执行）                                │
│    ├─ 输出产品类型和经营类目                                      │
│    └─ 等待用户确认                                               │
│                                                                 │
│  Step 3: 执行登录                                                │
│    ├─ 首次入驻：使用用户选择的 SALES_CODE 构造 scope              │
│    ├─ 登录过期：从状态文件读取 SALES_CODE 构造 scope              │
│    └─ login --non-interactive --scope "$SCOPE" --json           │
│                                                                 │
│  Step 4: 解析 device_code 和 verification_code                   │
│    └─ ❌ 禁止使用 CLI 返回的 verification_url                     │
│                                                                 │
│  Step 5: 生成授权链接                                            │
│    ├─ 参数校验（deviceCode, productCode, mccCode 必须有值）        │
│    └─ 构建 BROWSER_URL                                          │
│                                                                 │
│  Step 6: 输出授权信息（固定展示 4 项 + 授权链接）                    │
│    ├─ 产品、类目、类目编码、确认码                                  │
│    └─ 输出授权链接（Markdown 格式）                                 │
│                                                                 │
│  Step 7: 等待用户确认授权完成                                     │
│    └─ ⚠️ 不再使用轮询机制                                        │
│                                                                 │
│  Step 8: 执行授权确认                                            │
│    └─ login --complete --json                                   │
│                                                                 │
│  Step 9: 权限检查                                                │
│    ├─ Scope 权限检查                                             │
│    └─ MCC 一致性检查                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 快速参考

### 关键命令

| 操作 | 命令 |
|------|------|
| 检查登录状态 | `alipay-cli whoami --json` |
| 执行登录 | `alipay-cli login --non-interactive --scope "$SCOPE" --json` |
| 确认授权 | `alipay-cli login --complete --json` |
| 退出登录 | `alipay-cli logout --json` |

### Scope 对照表

| 产品 | salesCode | Scope |
|------|-----------|-------|
| 电脑网站支付 | I1080300001000041203 | `app:all,fast_instant_trade_pay:write` |
| 智能收 | I1080300001000160457 | `app:all,machine_pay:write,agmnt:write` |

### 禁止行为速查

```
❌ 禁止：未经用户确认直接执行登录命令
❌ 禁止：透出 CLI 返回的 verification_url
❌ 禁止：自动轮询检查授权状态
❌ 禁止：循环调用 login --complete
❌ 禁止：自行修改 scope 格式或值
❌ 禁止：条件性隐藏授权信息字段
❌ 禁止：scope 禁止为空
❌ 禁止：在未获用户确认前调用 login --complete
❌ 禁止：重新授权时省略 deviceCode、productCode、mccCode 任意一个参数
❌ 禁止：假设 mccCode 会自动从状态文件恢复（mccCode 是运行时变量）
❌ 禁止：因"重新授权"而跳过三参数校验
```
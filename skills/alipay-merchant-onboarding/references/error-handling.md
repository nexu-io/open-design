# 错误处理规范

> 本文档定义错误类型和处理方式。
> 被引用文档：`SKILL.md`

## 错误类型

### MCP 调用失败 - 认证信息为空（HTTP 401）

| 错误码 | 错误信息 | 说明 | 处理方式 |
|--------|----------|------|----------|
| `api_error` | `HTTP 401` + `Authorization is empty` | 未登录或授权已过期 | 引导用户重新登录授权 |
| `api_error` | `非法的认证信息` | 认证信息无效 | 引导用户重新登录授权 |
| `-32602` | `Authorization is empty` | MCP 请求缺少认证头 | 引导用户重新登录授权 |

**识别关键词：** `HTTP 401`、`Authorization is empty`、`非法的认证信息`、`MCP 调用失败`

**错误示例：**

```json
{
  "success": false,
  "error": {
    "code": "api_error",
    "message": "MCP 调用失败: MCP 请求失败: HTTP 401 - {\"jsonrpc\":\"2.0\",\"error\":{\"code\":-32602,\"message\":\"非法的认证信息, Authorization is empty\"}}",
    "action": "检查网络连接和服务配置"
  }
}
```

**处理流程：**

```bash
# 检测 MCP 认证错误
detect_mcp_auth_error() {
  local CLI_RESULT="$1"

  # HTTP 401 或认证信息为空
  if echo "$CLI_RESULT" | grep -qiE "HTTP 401|Authorization is empty|非法的认证信息"; then
    echo "MCP_AUTH_ERROR"
    return
  fi

  echo "SUCCESS"
}

# 处理 MCP 认证错误
handle_mcp_auth_error() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔐 未登录或授权已过期"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "❌ 当前登录状态已失效，无法继续操作"
  echo ""
  echo "📋 原因：MCP 调用返回认证错误（HTTP 401）"
  echo "📋 说明：Authorization is empty（认证信息为空）"
  echo ""
  echo "🔄 正在退出当前登录..."
  alipay-cli logout  --json 2>/dev/null

  # ⚠️ 不再清理状态中禁止字段，deviceCode/browserUrl 为运行时变量
  # 状态文件仅存 4 个允许字段，无需重置

  echo ""
  echo "✅ 已退出登录状态"
  echo ""
  echo "📌 请重新执行登录授权流程："
  echo "   1. 我会生成授权链接"
  echo "   2. 您使用支付宝扫码授权"
  echo "   3. 授权成功后继续当前操作"
  echo ""
  echo "请回复「继续」开始重新授权，或「退出」结束流程。"
}
```

**处理原则：**

```
✅ 检测到 HTTP 401 → 退出当前登录 → 引导用户重新授权
✅ 清理状态文件中的授权相关字段
✅ 提供清晰的错误说明和下一步操作指引
❌ 禁止自动重试 MCP 调用（会导致相同的认证错误）
❌ 禁止静默忽略错误
❌ 禁止跳过登录流程直接继续
```

---

### MCP 服务不可用（网络/服务错误）

| 错误码 | 错误信息 | 说明 | 处理方式 |
|--------|----------|------|----------|
| `api_error` | `MCP 调用失败` 非 401 | 网络或服务异常 | 提示用户检查网络后重试 |
| `api_error` | `connection refused` | 无法连接服务器 | 提示用户检查网络 |
| `api_error` | `timeout` | 请求超时 | 提示用户稍后重试 |

**识别关键词：** `MCP 调用失败`、`connection refused`、`timeout`、`network error`

**处理流程：**

```bash
# 检测 MCP 服务不可用（非认证类错误）
detect_mcp_service_error() {
  local CLI_RESULT="$1"

  # 排除认证错误后，检查其他 MCP 错误
  if echo "$CLI_RESULT" | grep -qi "MCP 调用失败"; then
    # 如果不是认证错误，则是服务/网络错误
    if ! echo "$CLI_RESULT" | grep -qiE "HTTP 401|Authorization is empty|非法的认证信息"; then
      echo "MCP_SERVICE_ERROR"
      return
    fi
  fi

  if echo "$CLI_RESULT" | grep -qiE "connection refused|timeout|network error"; then
    echo "MCP_SERVICE_ERROR"
    return
  fi

  echo "SUCCESS"
}

# 处理 MCP 服务不可用
handle_mcp_service_error() {
  local CLI_RESULT="$1"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️  MCP 服务暂时不可用"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "❌ 无法连接到支付宝服务，请稍后重试"
  echo ""
  echo "📋 错误详情："
  echo "$CLI_RESULT" | jq -r '.error.message // .message // "未知错误"' 2>/dev/null || echo "$CLI_RESULT"
  echo ""
  echo "您可以："
  echo "  1. 检查网络连接是否正常"
  echo "  2. 等待几分钟后重新执行"
  echo "  3. 联系技术支持获取帮助"
  echo ""
  echo "请回复「重试」重新尝试，或「退出」结束流程。"
}
```

---

### 授权信息不匹配错误

| 错误码 | 错误信息 | 说明 | 处理方式 |
|--------|----------|------|----------|
| `AE05010000001200` | `mccCode is not auth` | 经营类目未授权 | logout → 重新授权 |
| `AE05010000001200` | `salesProductCodes is not auth` | 产品未授权 | logout → 重新授权 |

**处理流程：**

```bash
if echo "$ERROR_MSG" | grep -qi "mccCode is not auth"; then
  echo "❌ 当前授权的经营类目与所选类目不匹配"
  echo "🔄 正在退出当前登录..."
  alipay-cli logout  --json
  # 重新进入登录流程
fi
```

### 登录授权错误

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| `authorization_pending` | 用户尚未扫码或未确认授权 | 继续等待或提示用户 |
| `auth_expired` | 授权已过期（10分钟） | 重新执行登录流程 |

---

## 后端错误处理

### 签约错误

```json
{
  "errorCode": "xxx",
  "errorMessage": "错误描述",
  "bizTips": "业务提示（可展示给用户）",
  "needRetry": true
}
```

| 场景 | 处理方式 |
|------|----------|
| errorCode 存在 | 展示 errorMessage，如有 bizTips 一并展示 |
| needRetry=true | 告知用户可以重试 |
| checkedError | 提取校验错误信息，引导用户修正字段 |

---

## 错误处理代码模板

### 统一错误检测

```bash
# 检查 CLI 输出中是否包含错误关键词
# 返回值：MCP_AUTH_ERROR | MCP_SERVICE_ERROR | AUTH_MISMATCH | SERVICE_UNSTABLE | ERROR:xxx | SUCCESS
detect_error() {
  local CLI_RESULT="$1"

  # 优先检测 MCP 认证错误（HTTP 401）
  if echo "$CLI_RESULT" | grep -qiE "HTTP 401|Authorization is empty|非法的认证信息"; then
    echo "MCP_AUTH_ERROR"
    return
  fi

  # MCP 服务不稳定（后端返回的服务异常）
  if echo "$CLI_RESULT" | grep -qiE "MCP.*服务.*不稳定|服务暂时不可用"; then
    echo "SERVICE_UNSTABLE"
    return
  fi

  # MCP 调用失败（网络/连接错误，排除认证错误）
  if echo "$CLI_RESULT" | grep -qiE "MCP 调用失败|connection refused|timeout|network error"; then
    # 再次确认不是认证错误
    if ! echo "$CLI_RESULT" | grep -qiE "HTTP 401|Authorization is empty|非法的认证信息"; then
      echo "MCP_SERVICE_ERROR"
      return
    fi
  fi

  # 授权信息不匹配（MCC/产品未授权）
  if echo "$CLI_RESULT" | grep -qiE "mccCode is not auth|salesProductCodes is not auth"; then
    echo "AUTH_MISMATCH"
    return
  fi

  # 通用业务错误
  ERROR_CODE=$(echo "$CLI_RESULT" | jq -r '.errorCode // .data.errorCode // ""' 2>/dev/null)
  if [ -n "$ERROR_CODE" ] && [ "$ERROR_CODE" != "null" ]; then
    echo "ERROR:$ERROR_CODE"
    return
  fi

  # CLI 命令本身的错误（success: false）
  SUCCESS=$(echo "$CLI_RESULT" | jq -r '.success // "true"' 2>/dev/null)
  if [ "$SUCCESS" = "false" ]; then
    ERROR_MSG=$(echo "$CLI_RESULT" | jq -r '.error.message // .message // "未知错误"' 2>/dev/null)
    echo "CLI_ERROR:$ERROR_MSG"
    return
  fi

  echo "SUCCESS"
}
```

### 统一错误处理入口

```bash
# 统一处理所有错误类型
handle_error() {
  local CLI_RESULT="$1"
  local ERROR_TYPE=$(detect_error "$CLI_RESULT")

  case "$ERROR_TYPE" in
    "MCP_AUTH_ERROR")
      handle_mcp_auth_error
      ;;
    "MCP_SERVICE_ERROR")
      handle_mcp_service_error "$CLI_RESULT"
      ;;
    "AUTH_MISMATCH")
      handle_auth_mismatch "$CLI_RESULT"
      ;;
    "SERVICE_UNSTABLE")
      handle_service_unstable
      ;;
    "ERROR:"*)
      local CODE="${ERROR_TYPE#ERROR:}"
      handle_backend_error "$CLI_RESULT" "$CODE"
      ;;
    "CLI_ERROR:"*)
      local MSG="${ERROR_TYPE#CLI_ERROR:}"
      echo "❌ 命令执行失败：$MSG"
      ;;
    "SUCCESS")
      return 0
      ;;
  esac

  return 1
}
```

### 处理授权不匹配

```bash
handle_auth_mismatch() {
  local ERROR_MSG="$1"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ 授权信息不匹配，需要重新授权"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  if echo "$ERROR_MSG" | grep -qi "mccCode is not auth"; then
    echo "📋 原因：经营类目未授权"
  elif echo "$ERROR_MSG" | grep -qi "salesProductCodes is not auth"; then
    echo "📋 原因：产品未授权"
  fi

  echo ""
  echo "🔄 正在退出当前登录..."
  alipay-cli logout  --json

  # ⚠️ 不再清理状态中禁止字段，deviceCode/browserUrl 为运行时变量
  # 状态文件仅存 4 个允许字段，无需重置

  echo "✅ 已退出登录，请重新执行登录授权流程"
}
```

### 处理 MCP 服务不稳定

```bash
handle_service_unstable() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "⚠️  MCP 服务暂时不稳定"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "当前无法继续执行，请稍后重试。"
  echo ""
  echo "您可以："
  echo "  1. 等待几分钟后重新执行"
  echo "  2. 检查网络连接是否正常"
  echo "  3. 联系技术支持获取帮助"
  echo ""
  echo "请回复「重试」重新尝试，或「退出」结束流程。"
  # 停止流程，不自动进入下一步
}
```

### 处理后端业务错误

```bash
handle_backend_error() {
  local CLI_RESULT="$1"
  local ERROR_CODE="$2"

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "❌ 业务处理失败"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "📋 错误码：$ERROR_CODE"

  # 提取错误信息
  local ERROR_MSG=$(echo "$CLI_RESULT" | jq -r '.errorMessage // .data.errorMessage // .message // "未知错误"' 2>/dev/null)
  local BIZ_TIPS=$(echo "$CLI_RESULT" | jq -r '.bizTips // .data.bizTips // ""' 2>/dev/null)
  local NEED_RETRY=$(echo "$CLI_RESULT" | jq -r '.needRetry // .data.needRetry // "false"' 2>/dev/null)

  echo "📋 错误信息：$ERROR_MSG"

  if [ -n "$BIZ_TIPS" ] && [ "$BIZ_TIPS" != "null" ] && [ "$BIZ_TIPS" != "" ]; then
    echo ""
    echo "💡 提示：$BIZ_TIPS"
  fi

  if [ "$NEED_RETRY" = "true" ]; then
    echo ""
    echo "🔄 此错误可重试，请回复「重试」重新执行"
  fi

  echo ""
  echo "如需帮助，请联系技术支持并提供以上错误信息。"
}
```

---

## 错误检测优先级

按以下顺序检测错误（优先级从高到低）：

| 优先级 | 错误类型 | 关键词 | 处理方式 |
|--------|----------|--------|----------|
| 1 | MCP 认证错误 | `HTTP 401`, `Authorization is empty`, `非法的认证信息` | 退出登录 → 重新授权 |
| 2 | MCP 服务不稳定 | `MCP 服务不稳定`, `服务暂时不可用` | 提示用户稍后重试 |
| 3 | MCP 服务错误 | `MCP 调用失败`, `connection refused`, `timeout` | 提示检查网络 |
| 4 | 授权信息不匹配 | `mccCode is not auth`, `salesProductCodes is not auth` | 退出登录 → 重新授权 |
| 5 | 业务错误 | `errorCode` 存在且非空 | 展示错误信息 |
| 6 | CLI 命令错误 | `success: false` | 展示错误信息 |

---

## 快速识别速查表

```
┌─────────────────────────────────────────────────────────────────┐
│                        错误识别速查表                            │
├─────────────────────────────────────────────────────────────────┤
│ 🔐 MCP_AUTH_ERROR                                               │
│   关键词：HTTP 401 / Authorization is empty / 非法的认证信息     │
│   动作：引导用户重新登录授权                                     │
├─────────────────────────────────────────────────────────────────┤
│ ⚠️  SERVICE_UNSTABLE                                            │
│   关键词：MCP 服务不稳定 / 服务暂时不可用                        │
│   动作：提示用户稍后重试                                         │
├─────────────────────────────────────────────────────────────────┤
│ 🌐 MCP_SERVICE_ERROR                                            │
│   关键词：MCP 调用失败 / connection refused / timeout            │
│   动作：提示检查网络连接                                         │
├─────────────────────────────────────────────────────────────────┤
│ 🔄 AUTH_MISMATCH                                                │
│   关键词：mccCode is not auth / salesProductCodes is not auth    │
│   动作：退出登录 → 重新授权                                      │
├─────────────────────────────────────────────────────────────────┤
│ 📋 BUSINESS_ERROR                                               │
│   关键词：errorCode 字段存在                                     │
│   动作：展示错误信息，引导用户处理                               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 使用示例

### 在 CLI 调用后检测错误

```bash
# 执行 MCP 调用
CLI_RESULT=$(alipay-cli mcp call ar-query.queryArInfosBySalesProd -d '{"request":{"salesProductCodes":["xxx"]},"ctx":{}}' --json 2>/dev/null)

# 检测并处理错误
ERROR_TYPE=$(detect_error "$CLI_RESULT")

case "$ERROR_TYPE" in
  "MCP_AUTH_ERROR")
    handle_mcp_auth_error
    # 返回登录流程
    ;;
  "MCP_SERVICE_ERROR")
    handle_mcp_service_error "$CLI_RESULT"
    # 等待用户决定
    ;;
  *)
    # 正常处理结果
    AR_STATUS=$(echo "$CLI_RESULT" | jq -r '.data.arInfos[0].status')
    ;;
esac
```
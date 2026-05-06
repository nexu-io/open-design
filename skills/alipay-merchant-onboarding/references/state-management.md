# 状态管理

> 本文档定义状态的存储结构和读写规范。
> 被引用文档：`SKILL.md`

## ⛔ 状态字段铁律（最高优先级）

**状态文件只允许存在以下 4 个字段，禁止写入任何其他字段！**

> **核心原则：只存 4 个字段，不多不少。其他数据走运行时变量。**

### 允许的字段

```json
{
  "productName": "电脑网站支付|智能收",
  "salesCode": "I1080300001000041203|I1080300001000160457",
  "scope": "app:all,fast_instant_trade_pay:write|app:all,machine_pay:write,agmnt:write",
  "collect_information": {
    "pc_home_page_image": "fileKey（仅电脑网站支付）",
    "pc_shop_page_image": "fileKey（仅电脑网站支付）",
    "pc_payment_image": "fileKey（仅电脑网站支付）"
  }
}
```

### 字段说明

| 字段 | 类型 | 写入时机 | 来源 | 说明 |
|------|------|----------|------|------|
| `productName` | string | Step 2 方案规划确认后 | 用户选择 | "电脑网站支付" 或 "智能收" |
| `salesCode` | string | Step 2 方案规划确认后 | 产品映射 | 产品码，决定产品和 scope |
| `scope` | string | Step 2 方案规划确认后 | salesCode 映射 | OAuth 授权范围 |
| `collect_information` | object | Step 5 截图上传后 | `alipay-cli file upload` 返回 | 仅电脑网站支付有值，智能收为空对象 |

### scope 映射

| salesCode | scope |
|-----------|-------|
| I1080300001000041203 | `app:all,fast_instant_trade_pay:write` |
| I1080300001000160457 | `app:all,machine_pay:write,agmnt:write` |

### 禁止写入的字段

```
❌ status              → 禁止（流程状态通过 MCP 真实查询，不本地记录）
❌ mccCode / mccName   → 禁止（运行时变量，签约提交时直接传入 apply JSON）
❌ deviceCode / browserUrl / verificationCode → 禁止（临时变量，不持久化）
❌ ar_sign_data        → 禁止（由 ar-sign-skill 子技能内部管理）
❌ service_market_data → 禁止（由 service-market 子技能运行时处理）
❌ appId / merchantPid / authToken / userId → 禁止（子技能返回，不持久化）
❌ 任何其他字段        → 禁止
```

### 违反 vs 正确对照

```bash
# ❌ 错误：写入非允许字段
python3 "$STATE_MANAGER" set status "planning"
python3 "$STATE_MANAGER" set mccCode "A0002_B0115"
python3 "$STATE_MANAGER" set deviceCode "xxx"
python3 "$STATE_MANAGER" set-json ar_sign_data '{}'

# ✅ 正确：只写入 4 个允许字段
python3 "$STATE_MANAGER" set productName "电脑网站支付"
python3 "$STATE_MANAGER" set salesCode "I1080300001000041203"
python3 "$STATE_MANAGER" set scope "app:all,fast_instant_trade_pay:write"
python3 "$STATE_MANAGER" set-json collect_information '{"pc_home_page_image":"key1","pc_shop_page_image":"key2","pc_payment_image":"key3"}'
```

---

## 状态存储方式

**⚠️ 所有状态数据使用 Python 共享内存存储，替代文件存储方式**

### 状态管理器

使用 `scripts/state_manager.py` 管理 Python 共享内存状态：

```bash
# 状态管理器路径
STATE_MANAGER=<skill-dir>/scripts/state_manager.py

# 初始化共享内存
python3 "$STATE_MANAGER" init

# 检查状态是否存在
python3 "$STATE_MANAGER" exists

# 查看完整状态
python3 "$STATE_MANAGER" show

# 重置状态
python3 "$STATE_MANAGER" reset

# 删除共享内存
python3 "$STATE_MANAGER" delete
```

---

## 状态操作规范

### 写入状态（仅 4 个字段）

```bash
STATE_MANAGER=<skill-dir>/scripts/state_manager.py

# Step 2: 方案规划确认后写入产品信息
python3 "$STATE_MANAGER" set productName "电脑网站支付"
python3 "$STATE_MANAGER" set salesCode "I1080300001000041203"
python3 "$STATE_MANAGER" set scope "app:all,fast_instant_trade_pay:write"

# Step 5: 截图上传后写入采集信息（仅电脑网站支付）
python3 "$STATE_MANAGER" set-json collect_information '{"pc_home_page_image":"key1","pc_shop_page_image":"key2","pc_payment_image":"key3"}'
```

### 读取状态

```bash
# 读取单个字段
PRODUCT_NAME=$(python3 "$STATE_MANAGER" get productName)
SALES_CODE=$(python3 "$STATE_MANAGER" get salesCode)
SCOPE=$(python3 "$STATE_MANAGER" get scope)

# 读取嵌套字段
HOME_KEY=$(python3 "$STATE_MANAGER" get collect_information.pc_home_page_image)
```

### 重置状态

```bash
# 重置到初始状态
python3 "$STATE_MANAGER" reset
```

---

## 非 state 数据的存储位置

| 数据 | 存储位置 | 说明 |
|------|----------|------|
| mccCode / mccName | 运行时变量 | 签约提交时直接传入 apply JSON |
| screenshot fileKey | collect_information（状态文件） | 签约提交时用于 apply JSON 的 screenshot 字段 |
| deviceCode / verificationCode | 运行时变量 | login 返回后用完即弃 |
| browserUrl | 运行时变量 | 授权链接用完即弃 |
| 服务注册入参 | 运行时变量 | service-market 子技能运行时直接使用 |

---

## 状态清理（流程结束后）

### 清理时机

**当流程全部走完后，可以选择性导出备份后删除共享内存状态。**

### 清理逻辑

```bash
STATE_MANAGER=<skill-dir>/scripts/state_manager.py
BACKUP_DIR=~/.alipay/alipay-merchant-onboarding/archive

# 可选：导出备份到文件
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/$(whoami)_$TIMESTAMP.json"
python3 "$STATE_MANAGER" show > "$BACKUP_FILE"
echo "✅ 状态已备份到: $BACKUP_FILE"

# 删除共享内存
python3 "$STATE_MANAGER" delete
echo "✅ 共享内存状态已清理"

echo ""
echo "💡 下次启动将开始新的入驻流程"
```
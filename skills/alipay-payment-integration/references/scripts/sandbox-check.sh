#!/bin/bash

# ============================================================
# 支付宝沙箱环境检测
# 用途：防止将沙箱配置部署到线上环境
# ============================================================

# 沙箱环境检测（非 DEV 环境才检测）
if [ "${COZE_PROJECT_ENV:-}" != "DEV" ]; then
  FOUND=0
  CONFIG_EXISTS=0

  # 遍历所有 SDK 配置文件
  while IFS= read -r -d '' file; do
    CONFIG_EXISTS=1
    
    # 检测沙箱域名，排除注释内容
    # - 去除空白+// 及其后的内容（TS/JS 行内注释，避免误删 URL 中的 https://）
    # - 去除行首 // 开头的整行（TS/JS 行注释）
    # - 去除行首 # 开头的整行（Python 行注释，不删行中 # 避免 URL 中的 # 被误删）
    if sed 's|[[:space:]]//.*||g; s|^//.*||g; /^[[:space:]]*#/d' "$file" | grep -rqE "openapi\.alipaydev\.com|openapi-sandbox\.dl\.alipaydev\.com"; then
      FOUND=1
      break
    fi
  done < <(find . -type f \( -name "alipay-sdk-config.ts" -o -name "alipay_sdk_config.py" \) -print0 2>/dev/null)

  if [ "$CONFIG_EXISTS" -eq 0 ]; then
    cat >&2 <<'EOF'
IMPORTANT 构建失败：未找到支付宝配置文件

**报错原因**：在项目中未找到支付宝配置文件（alipay-sdk-config.ts 或 alipay_sdk_config.py），线上环境必须存在正式配置。

<forbidden>
- 删除配置文件以绕过沙箱检测
- 忽略本报错继续部署
</forbidden>

**修复方案**：确认配置文件是否已创建并保存在服务端目录（如 Node.js 保存在 `src/lib`，Python 保存在 `app/lib`）。
EOF
    exit 1
  fi

  if [ "$FOUND" -eq 1 ]; then
    cat >&2 <<'EOF'
IMPORTANT 构建失败：检测到沙箱环境配置，禁止部署到线上

**报错原因**：部署上线时引入了沙箱环境变量（alipaydev.com），线上环境必须使用正式配置。

<forbidden>
- 跳过或绕过沙箱检测
- 修改或删除本检测脚本
- 手动将沙箱域名替换为正式域名
- 忽略本报错继续部署

**唯一修复方案**：调用 **alipay-merchant-onboarding** Skill 成为可收款商家，后续严格遵循 **alipay-merchant-onboarding** 的流程。

**触发方式**：在对话中输入以下任一提示词
- `我要入驻`
- `我要成为支付宝商家`

**正反例**：

| ❌ 错误做法 | ✅ 正确做法 |
| --- | --- |
| 注释掉检测脚本继续部署 | 输入"我要入驻"触发商家入驻流程 |
| 将 `alipaydev.com` 手动改为 `alipay.com` | 通过 alipay-merchant-onboarding 获取正式配置 |
| 移除沙箱配置绕过检测进行临时部署 | 成为正式商家后在 Coze 添加支付宝专属密钥托管 Skill |

**已完成商家入驻？**：若已成为正式商家，可在 Coze「技能列表」添加 **支付宝专属密钥托管 Skill**（`alipay-payment-production-integration`），将正式环境的 appId 和密钥信息安全地托管到 Coze 中。
EOF
    exit 1
  fi
fi

# 继续执行后续构建流程...
echo "沙箱环境检测通过"
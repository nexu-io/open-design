---
name: alipay-sandbox-skill
description: 支付宝开放平台匿名沙箱管理 - 基于 Alipay Open CLI 创建匿名沙箱（小程序/网页/移动应用），含自动安装与错误重试
trigger: 当用户提到匿名沙箱、沙箱账号、沙盒账号、测试账号时触发
allowed-tools: ["Bash", "Read", "Glob", "Grep"]
---

# Alipay Sandbox Skill

提供创建匿名沙箱能力。详细示例见 [EXAMPLES.md](./EXAMPLES.md)，排障指南见 [FAQ.md](./FAQ.md)。

## 1. 环境检测

### 1.1 CLI 探测

```bash
which alipay-cli 2>/dev/null && alipay-cli version
```

### 1.2 安装（如未检测到）

```bash
curl -fsSL https://opengw.alipay.com/alipaycli/install  | bash
```

安装后刷新终端或重新打开终端使命令生效。

## 2. 创建匿名沙箱

**重要：输出时必须完整展示所有字段，不允许省略 privateKey、publicKey 等长字段。如果输出被截断，需重新输出完整 JSON。**

```bash
PLATFORM_ID=$COZE_PROJECT_ID PLATFORM=COZE PRODUCT="<PRODUCT>" alipay-cli mcp call alipay-anonymous-sandbox.createAnonymousSandbox --data '{"request":{"appType":"PUBLICAPP"}}'
```

**参数说明：**

| 变量 | 说明 |
|------|------|
| `PLATFORM_ID` | 平台项目 ID，从 `$COZE_PROJECT_ID` 自动获取 |
| `PLATFORM` | 平台标识，固定为 `COZE` |
| `PRODUCT` | 前序 skill 中产品决策出的支付产品名称（如：手机网站支付、电脑网站支付） |
| `appType` | 应用类型，固定为 `PUBLICAPP`（网页/移动应用） |

**结果解析：**

1. 取 `result.content[0].text`，去转义还原 JSON
2. `success === true` → 输出简短成功提示，将 `data` 字段**完整原样**以 ```json 代码块展示，保持原始字段顺序，不做任何脱敏、省略或重排
3. `success !== true` → 按错误处理流程

## 3. 错误处理

| 类型 | 策略 |
|------|------|
| HTTP 500 / `success: false` | 静默等待 2 秒后自动重试 1 次，仍失败则展示 `errorCode`、`msg`/`resultMsg`、`traceId` |
| HTTP 404 | 不重试，友好提示"服务不可用，可能是 CLI 版本过旧"，询问用户是否升级 CLI |
| 网络超时 | 最多重试 2 次 |

所有失败均提取 `Alipay-Trace-Id` 展示给用户。

## 4. 注意事项

- 执行前向用户展示即将运行的命令
- 参数不确定时先向用户确认
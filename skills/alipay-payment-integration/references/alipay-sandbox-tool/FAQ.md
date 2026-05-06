# 常见问题

## 安装

```bash
curl -fsSL https://opengw-pre.alipay.com/alipaycli/install | bash
```

安装后刷新终端或重新打开终端使命令生效。

### 权限不足

使用 sudo 或修复目录权限：

```bash
sudo curl -fsSL https://opengw-pre.alipay.com/alipaycli/install | bash
```

或修复全局目录权限：`sudo chown -R $(whoami) /usr/local/bin`

## 创建沙箱

### HTTP 404

当前环境服务不可用，请确认 CLI 版本并重试。

### success: false

Skill 会自动重试一次。仍失败时，关注返回中的 `errorCode`、`msg` 和 `traceId`。

### 网络超时

1. 检查网络与代理设置
2. 命令会自动重试（最多 2 次）
3. 持续失败请记录 `Alipay-Trace-Id` 联系平台排查

## 认领链接打不开

确认使用的认领链接与创建时的环境一致。

## Alipay-Trace-Id

CLI 输出的 HTTP RESPONSE Headers 中包含 `Alipay-Trace-Id`，可用于问题排查。

## 更新 CLI

```bash
curl -fsSL https://opengw-pre.alipay.com/alipaycli/install | bash
```
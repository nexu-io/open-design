# DeepSeek Harness × OpenDesign 一键安装指引

> 运营发布状态：文案已可评审，安装脚本尚未发布到正式下载地址。正式对外发送前，请确认下方三个 `open-design.ai/install-dsh.*` 地址均可访问，并分别完成一次 macOS、Windows PowerShell 和 Windows CMD 验证。

正式发布不采用开发机手动上传。脚本合并到 `main` 后，由 `landing-page-production` 生产发布 workflow 自动完成两件事：

1. 将脚本和 `SHA256SUMS` 以不可覆盖的版本保存到 `https://releases.open-design.ai/bootstrap/dsh/<version>/`。
2. 将相同脚本发布为下方 `open-design.ai/install-dsh.*` 用户短链接。

版本号由脚本内容决定，不需要人工维护：脚本没变就复用已发布的那一版，脚本改了就自动开下一版（`v1` → `v2` → …）。每个已发布版本都保持逐字节不可覆盖，历史版本永久留存，`https://releases.open-design.ai/bootstrap/dsh/latest.json` 指向当前版本并附带各文件的 sha256 与发布来源。

## 对外宣发文案

### DeepSeek Harness 已接入 OpenDesign

现在，你可以在 OpenDesign 中使用 DeepSeek Harness 完成设计生成任务。

如果电脑上还没有 Node.js、pnpm 或 `dsh`，无需逐项配置环境：运行对应系统的一行安装命令，即可安装 OpenDesign 当前兼容的 DeepSeek Harness 工具链，并进入 API Key 配置页面。

安装过程不会修改系统级 Node.js，也不需要 `sudo` 或管理员权限；已有的兼容环境会被自动复用。

## 一键安装

### macOS / Linux

打开“终端”，粘贴下面一行并按回车：

```sh
curl -fsSL 'https://open-design.ai/install-dsh.sh?version=1' | sh
```

支持 Apple Silicon、Intel Mac，以及主流 x64/arm64 Linux 发行版。Alpine Linux 暂不支持自动安装。

### Windows PowerShell

打开 PowerShell，粘贴下面一行并按回车：

```powershell
& ([scriptblock]::Create((irm 'https://open-design.ai/install-dsh.ps1?version=1')))
```

### Windows CMD

打开“命令提示符”，粘贴下面一行并按回车：

```bat
curl -fsSL "https://open-design.ai/install-dsh.cmd?version=1" -o "%TEMP%\install-dsh.cmd" && call "%TEMP%\install-dsh.cmd"
```

## 配置 DeepSeek API Key

是的，API Key 在 DeepSeek Harness 自己的 Web UI 中配置，不需要粘贴到 OpenDesign。

### 1. 打开 DeepSeek Harness Web UI

安装完成后，安装器会直接运行：

```sh
dsh web
```

终端会显示 Web UI 的访问地址，默认是：

```text
http://127.0.0.1:3080
```

如果浏览器没有自动打开，请复制终端显示的地址，在浏览器中手动访问；始终以终端实际打印的地址为准。

以后需要重新配置时，也可以在终端再次运行 `dsh web`。

### 2. 填写 API Key

首次打开 DeepSeek Harness 时，可能会依次看到：

1. “内测声明”：点击“继续”。
2. DeepSeek API Key 配置：将 Key 粘贴到输入框，点击“保存”或“应用”。

如果没有出现 API Key 弹窗，或者之前选择了稍后配置，请打开：

**设置 → 模型 → DeepSeek → API 密钥**

输入 API Key 后点击“保存”或“应用”。配置会立即生效，不需要重启 `dsh web`。

> 只粘贴 API Key 本身。不要粘贴 `DEEPSEEK_API_KEY=...`，也不要在 Key 外面添加引号。

如果还没有 API Key，请先前往 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 创建。

### 3. 确认配置成功

保存后，DeepSeek 提供方会显示为已配置，对应模型会出现在模型选择器中。如果页面提示 `MISSING_CREDENTIAL`，请回到 DeepSeek 卡片重新保存 API Key。

DeepSeek Harness 会以只写方式保存凭据：页面只能知道 Key 是否已经配置，无法重新读取或显示 Key 明文。官方说明见 [DeepSeek Harness 模型配置指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.zh.md)。

### 4. 回到 OpenDesign

1. API Key 配置完成后，可以在运行 `dsh web` 的终端按 `Ctrl+C`；日常使用 OpenDesign 时不需要让该页面常驻。
2. 回到 OpenDesign 的“本地 Agent”页面，点击“重新扫描”。
3. 选择“DeepSeek Harness”。如果出现“安装 OpenDesign 连接组件”的确认提示，确认安装即可。
4. 点击“测试”；测试通过后即可选择模型并开始生成。

## 安装器会做什么

- 检查电脑上是否已有兼容版本的 Node.js、pnpm 和 DeepSeek Harness。
- 已有环境满足要求时直接复用，不重复下载。
- 缺少环境时，在当前用户目录中安装隔离的 Node.js 和 DeepSeek Harness 工具链。
- 固定安装 OpenDesign 已验证的版本，避免自动升级造成兼容问题。
- 校验从 Node.js 官网下载的安装包 SHA-256，校验失败会停止安装。
- 为 OpenDesign 创建可发现的 `dsh` 启动入口，但不会覆盖用户已有的全局 Node.js。

## API Key 与隐私

DeepSeek API Key 在 DeepSeek Harness 自己的页面中配置和保存。OpenDesign 不要求用户把 Key 粘贴到应用内，也不会将 Key 写入 OpenDesign 的应用配置。

安装器需要联网访问 OpenDesign 下载地址、Node.js 官网和 npm registry。它不会上传项目文件或 API Key。

## 常见问题

### 已经安装过 dsh，还需要运行吗？

可以运行。安装器会先检测现有版本；Node.js、pnpm 和 dsh 都满足兼容要求时会直接复用，不会重复安装。

### 安装器会覆盖我电脑上的 Node.js 吗？

不会。自动补齐的运行环境安装在当前用户的独立工具链目录，不修改系统 Node.js，也不替换其他项目使用的版本。

### 为什么安装后终端里仍然找不到 dsh？

先重新打开一个终端窗口。OpenDesign 会扫描常见的用户级工具目录，通常不需要手动修改 PATH；如果 OpenDesign 已经打开，请回到“本地 Agent”页面点击“重新扫描”。

### dsh web 必须一直开着吗？

不需要。它主要用于首次配置模型和 API Key。配置完成后可以关闭，OpenDesign 在运行任务时会自行调用本机的 dsh。

### OpenDesign 仍然没有检测到 DeepSeek Harness 怎么办？

请依次确认：

1. 安装命令最后显示 DeepSeek Harness 已就绪。
2. 已重新启动 OpenDesign，或在“本地 Agent”页面点击“重新扫描”。
3. DeepSeek Harness 版本与 OpenDesign 当前支持版本一致。
4. 如仍无法识别，将安装器最后一屏输出和 OpenDesign 的测试提示一并反馈给支持人员。

## 适合社群直接转发的短版

DeepSeek Harness 已接入 OpenDesign。没有 Node.js、pnpm 或 dsh 也没关系：复制一行命令即可自动补齐兼容环境。安装完成后，在 Harness Web UI 的“设置 → 模型 → DeepSeek”中保存 API Key，再回到 OpenDesign 重新扫描并选择 DeepSeek Harness，就可以开始生成设计。

- macOS / Linux：`curl -fsSL 'https://open-design.ai/install-dsh.sh?version=1' | sh`
- Windows PowerShell：`& ([scriptblock]::Create((irm 'https://open-design.ai/install-dsh.ps1?version=1')))`
- Windows CMD：`curl -fsSL "https://open-design.ai/install-dsh.cmd?version=1" -o "%TEMP%\install-dsh.cmd" && call "%TEMP%\install-dsh.cmd"`

API Key 由 DeepSeek Harness 自己保存，OpenDesign 不保存你的 Key。

## 运营发布前检查

- 三个下载地址均返回对应脚本，而不是 HTML 页面或 404。
- R2 上的版本化对象、SHA-256 清单和 `open-design.ai` 稳定入口已经发布。
- 用全新 macOS 用户环境完成安装、配置、OpenDesign 重新扫描和一次真实生成。
- 用 Windows PowerShell 完成同样的全链路验证。
- 用 Windows CMD 至少验证下载、PowerShell 转发和安装完成。
- 确认宣发文案中的兼容 dsh 版本与 OpenDesign 当前 release 一致。
- 删除本文顶部“运营发布状态”提示后再面向用户发布。

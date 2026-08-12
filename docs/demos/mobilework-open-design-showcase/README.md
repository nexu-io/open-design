# Mobilework × Open Design 动态演示站

这是一个用于内部汇报和现场演示的独立静态网站，不会参与 Open Design 产品运行时。

桌面首屏验收图位于 `assets/showcase-preview.png`。

## 运行

可以直接双击 `index.html`，也可以在本目录启动任意静态文件服务器。例如：

```powershell
python -m http.server 4173
```

然后访问 `http://127.0.0.1:4173/`。

## 替换真实案例

建议按以下结构放入后续素材：

```text
assets/
└── cases/
    ├── a2a/
    │   ├── question.png
    │   └── result/index.html
    ├── elicitation/
    │   ├── question.png
    │   └── result/index.html
    └── multi-mcp/
        ├── question.png
        └── result/index.html
```

然后修改 `script.js` 顶部的 `caseData`：

- `request`：用户原始提示词；
- `context`：可公开展示的任务或协议上下文；
- `questionImage`：问题截图的相对路径；
- `resultUrl`：结果网站入口 HTML 的相对路径。

首版所有案例位置均使用占位组件。接入真实素材时，应先清理 token、用户路径、账号信息等敏感内容。

## 页面操作

- 顶部“自动演示”会循环切换通信方案和产物模式；
- 右上角按钮进入浏览器全屏；
- 通信方案和产物模式支持点击及方向键切换；
- 案例卡片可以打开完整证据链弹窗；
- `single-html` 模式内的 Hash 路由按钮用于现场解释单文件多页面方案。

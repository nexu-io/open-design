---
title: OpenDesign 0.19.0 — Image Generation, Unlocked
description: 用 OpenDesign 订阅把想法变成图片：直接使用 Seedream 5.0 Pro、GPT Image 2.0 和 Nano Banana 2.0 生成图像。
---

### 🌟 Codename: *Image Generation, Unlocked*

🖼️ **用 OpenDesign 订阅把想法变成图片：直接使用 Seedream 5.0 Pro、GPT Image 2.0
和 Nano Banana 2.0 生成图像。**

## 🔥 亮点

- 🎨 **订阅内直接使用三款主力图片模型。** 通过 OpenDesign Cloud，可以直接使用
  Seedream 5.0 Pro、GPT Image 2.0 和 Nano Banana 2.0 生成或编辑图片。只要所选模型
  公开了对应能力，Agent 就能传入多张参考图，并明确指定宽高比、分辨率和质量档位。
  任务开始前会先校验参数，生成过程中持续显示进度，输出路径由 daemon 统一管理；
  工具调用后偶发的一次中断也能恢复，不会直接丢掉结果。视频生成也走同一套 Vela
  集成。 (#6500)

- 📤 **Export、Share 与 Handoff 不再藏在同一个菜单里。** 产物查看器恢复了三个独立
  入口。Export 负责文件交付，Share 负责链接与发布，Handoff 回到原来的分裂按钮。
  HTML 和 React component 查看器使用同一套结构；即使外部编辑器接口返回了不符合
  约定的数据，也不会拖垮整个查看器。 (#6654)

- 🤝 **共享项目少做无用功，失败后也能自己恢复。** 团队项目同步会统一排除生成
  目录，根据 manifest 规模限制后台拉取，并用有限次数的退避重试恢复发布。短暂的
  workspace context 故障可以恢复，同时不会误用上一个账号留下的状态；会话分叉能
  守住正确边界，MCP 项目操作也会使用当前登录的 workspace。 (#6558, #6564, #6595,
  #6604, #6605, #6673)

## ✨ 新增

- MCP client 启动一次 run 时可以同时传入多个 skill，daemon 会转发全部已选 skill ID。
  (#6429)
- Launch Week Vol.01 上线五天内容，并提供多语言活动页。尚未公开的每日内容不会写进
  页面源码，而是在请求时按日期返回。 (#6647)
- 预览 iframe 加载失败时会记录有边界的诊断事件，排查产物无法渲染的问题时不再只能
  靠复述现象。 (#6671)

## 🔁 变更

- Qwen Code 的模型选项改为读取用户自己的 Qwen 配置；内置模型仍作为 fallback。
  配置文件旁边保存的密钥不会被读取。 (#6546)
- Presenter View 中的长篇演讲者备注可以滚动查看，不会被裁掉；离开项目后再回来，
  或 deck 在后台标签页完成加载时，预览也能恢复。 (#6271, #6519)
- “本轮生成的文件”按实际文件去重计数，不再把同一文件的多次写入和编辑重复相加。
  (#6420)

## 🐛 修复

### 🧠 运行与项目状态

- 旧的 retry generation 不会再结束较新的 generation；已经结束的旧 Design run 也不会
  在每次刷新后反复重连。 (#6578, #6600)
- 依赖 workspace 的写操作遇到短暂的 authority 故障时会有限重试；账号切换后，旧的
  workspace context 仍会立即失效。Workspace 报错会保留更有用的诊断码。
  (#6604, #6666)
- 删除项目时会一并清理 Design Browser 的历史记录与 viewport 缓存。新评论不会再
  复用已经退役的 pin 编号，邀请弹窗也不会被过期的 timer 意外关闭。
  (#6354, #6517, #6580)
- 没有关联 workspace 的 design system 可以正常删除。 (#6591)

### 🔌 Agent 与集成

- 运行时检测可以识别 Claude Enterprise 登录状态。 (#6652)
- MCP 项目工具会使用当前登录的 workspace；升级到 workspace scope 后，不会再只看到
  一个空的项目列表。 (#6595)
- daemon 会从配置好的静态目录返回 Web App fallback，直接打开应用内路由不再失败。
  (#6614)

### 🖥️ 桌面端与更新

- 打包客户端更新后会刷新已保存的 launcher 路径。MCP client 不会再拉起旧程序，
  也不会因此触发桌面端重启循环。 (#6621)
- 本机耗尽 socket 或文件描述符时，`od://` proxy 会立即停止重试，不再把一次故障放大成
  更多失败请求。 (#6530)
- Windows 卸载只会移除当前安装拥有的协议注册；NSIS 在安装和更新路径中都会保留带
  引号的协议命令。 (#6694, #6699)
- 诊断包会保留上一次 daemon 会话的日志，JSONL 事件尾部也会从完整记录处开始。
  (#6531)

## ⚠️ 破坏性变更

无。

## 🩺 已知问题

暂无已报告问题。

## ⬆️ 升级说明

稳定版发布后，可通过应用内正常更新流程升级到 OpenDesign 0.19.0，也可以下载安装包。
本次发布没有额外的手动操作说明。

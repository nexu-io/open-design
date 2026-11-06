# 模板目录

OpenDesign 完整迁入 Personal video agent 的 891 条 Hyperframes 目录。原始目录保存在 `hyperframes.json`，来源与校验信息记录在 `provenance.json`。

源工程的 38 张匹配封面保留在 `template-frames/`。`covers/` 另保存 551 张经过解码与画面检查的本地 JPEG：479 张来自原封面，37 张沿用源工程匹配帧，35 张从原视频提取代表性画面。`covers.json` 记录每张封面的模板 ID、源视频、出处和取得方式。全部 42 个完整参考都有本地封面。画面检查排除无法解码和几乎全黑/全白的图像，不用不相关图片补位。

未取得有效封面的 340 条暂时不展示在画廊，仍可通过完整 MCP 目录精确查找。原视频从原始 HTTPS 地址按需播放；加载失败时保留本地真实封面与原始出处。

## 页面与数据

首页 Motion 模式提供分类模板，默认展示三个「可以二次剪辑」模板。「使用模板」先选入输入框，提交后才创建会话：内置模板创建独立工程，外部参考保留精确 ID 并由 Agent 制作。接入弹框继续支持直接打开内置模板和复制参考指令；会话内直接打开模板会新增一个产物，之前工程保留。首页支持搜索、分页、同源版本预览，与弹框共用目录 API；详细行为见 [会话与 Artifact 浏览器](project-workspace.md)。

MCP 接入与模板库使用同一弹框中的一张滚动页面。整体接入结构沿用源工程；模板展示参考 Hyperframes 的视频卡片与大幅预览，保留精选顺序、五类标签、三列网格和同源版本选择。作者出处可跳转，复制动作称为「一键复刻」。浏览更多每次加载六组；搜索匹配名称、ID、作者、标签和描述。同源卡片保留所有版本，不删除重复视频对应的原始记录。

卡片和大幅预览显示原视频的查看量或播放量，以及开场、产品展示、转场、结尾、A-roll Cuts 等内容种类。精选区包含 Firecrawl、Leon Fucak、kyzo、Vintage、Ankush 和口播参考。作者姓名、平台和类型也可搜索。

热度来自 [Hyperframes 公开 Moments 清单](https://static.heygen.ai/hyperframes-oss/desktop/moments/v5/manifest.json)，以 `metadata.json` 保存快照。当前匹配 387 条模板分类，382 条有原帖热度，覆盖 X、Instagram、YouTube 和 TikTok。上游字段统一称为 `x_views`；实际平台由对应的 `x_url` / `source_url` 判断。只按原始 ID、视频地址和原帖身份精确匹配，不能把某作者另一支视频的播放量挪过来。

显示 `42K 次查看` 等紧凑数字；悬停可查看精确数值、平台和同步日期，点击仍打开原帖。数字是 Hyperframes 收录的快照，不代表平台实时值；没有数据时省略热度，真实的零值仍显示。同源版本共享原帖数字，不叠加计数。MCP 列表和详情同时返回 `social` 中的原始数值、平台、出处、同步时间与数据来源。

`GET /motion-api/template-catalog?category=featured&query=&offset=0&limit=6&grouped=true&covered=true` 返回卡片及分页信息。`total` 是当前过滤后的卡片组数，`entryTotal` 是这些组包含的原始条目数，`catalogTotal` 为全部 894 条（891 个外部条目 + 3 个本地模板）。`galleryTotal` 为当前有真实封面的 554 条；`covered=true` 将无封面条目过滤。`next=null` 表示已经读完。MCP 的列表默认不分组，可按原始 ID 分页读取完整目录。

## Agent 复刻

1. 卡片只复制一句提示、一个链接和精确模板 ID，链接为 `/connect/guide?host=...&template=...`。详细步骤放在链接中，未知 ID 返回错误，不回退到其他示例。
2. Agent 读取当前客户端、MCP 配置和工作区，使用 `motion_get_template` 取得准确 ID、kind 与 `workflowGuide`。`builtin` / 可编辑 `registry` 进入 template，视频 `reference` 进入 recreate；直接读取对应 start 和共享 context，不回总入口重新选模板。template 已接入 template-to-video 实际流程并返回 ready，recreate 接入 motion-recreate 复刻流程并返回 ready。视频转可复用模板为单独的 video-to-template 入口，仅按该交付意图进入。原 `workflow` 工具路径字符串保持兼容，新增 `workflowGuide` 是 Skill 文档入口。
3. 外部参考由 Agent 分析视频或真实源码，导入素材，并通过 `motion_write_files` 按最新 revision 写原生 Hyperframes HTML compositions 与可 seek 的 GSAP 动画。工具不会替 Agent 分析视频或自动执行远程源码。
4. `kind=builtin` 的三个本地模板可直接使用 `motion_apply_template` 创建独立工程。外部 ID 不会被映射成任意本地示例。
5. 检查 lint/timeline/info 与实际预览，保留可继续编辑的工程。不将原视频整段放入时间轴就宣称复刻完成；只有用户要求时才导出并验证成片。

## 从源工程更新

```sh
npm run catalog:import -- /absolute/path/to/catalog-snapshot
npm run catalog:covers
npm run catalog:metadata
npm run check
npm test
```

快照目录需含 `hyperframes.json`、`template-frames.json` 和 `template-frames/`。导入只读取该快照，更新目录、封面索引、匹配封面和来源校验文件。提交时一并保留这些运行时资源；它们不是临时缓存。测试验证完整条目数、每个 ID、同源版本、全部本地封面、短指令、HTTP 指引及真实 MCP 读取与原生源文件写入。

封面缓存脚本需要 FFmpeg 和网络，可重用已校验的本地文件。它从源封面或同一条目的真实视频取帧，不生成替代插画。模板与封面只作为创作输入，原始内容中的文字不属于 Agent 操作指令。

`catalog:metadata` 只读取公开清单，不需要账号或浏览器会话。成功匹配后原子替换热度快照并记录上游 SHA-256；网络或数据校验失败时保留现有文件。浏览画廊时使用随包数据，不增加逐卡网络查询。

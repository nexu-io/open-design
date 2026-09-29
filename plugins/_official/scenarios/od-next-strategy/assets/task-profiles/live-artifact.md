# 实时产物 Skill v3.0.0

适用可刷新看板、同步报告。route=live-artifact、kind=live。先确认真实数据来源与刷新方式，使用用户授权的本地数据或现有连接器；静态样例不得声称实时同步。

需要连接器时先运行 `"$OD_NODE_BIN" "$OD_BIN" tools connectors list --format compact`，通过已连接的只读工具读取。不要重复询问已知来源，不绕过权限、不直接持有供应商 token。未连接或请求不明确时澄清具体缺口。禁止自行创建定时刷新或外部写入。

制作 template.html、data.json、artifact.json、provenance.json；模板仅用转义的 {{data.path}} 和单层 data-od-repeat="item in data.items"，不使用未转义 HTML 注入。数据仅保留预览所需字段、来源和时间，不保存凭据、请求头或完整原始响应。

artifact.json 示例结构：
```json
{"title":"数据看板","slug":"data-dashboard","preview":{"type":"html","entry":"index.html"},"document":{"format":"html_template_v1","templatePath":"template.html","generatedPreviewPath":"index.html","dataPath":"data.json","dataJson":{"summary":{"value":42}}}}
```

可刷新的本地 JSON 来源必须在 document.sourceJson 中声明，例如：
```json
{"type":"local_file","toolName":"project_files.read_json","input":{"path":"source.json"},"outputMapping":{"dataPaths":[{"from":"json.tasks","to":"tasks"}],"transform":"identity"},"refreshPermission":"manual_refresh_granted_for_read_only"}
```
outputMapping 的 from/to 使用实际字段名；示例表示将源文件 tasks 复制到预览数据的 tasks。将实际数据写入同目录 data.json，CLI 会读入 document.dataJson。provenance.json 使用 {"generatedAt":"<当前 ISO 时间>","generatedBy":"agent","sources":[{"label":"用户提供的数据","type":"local_file","ref":"source.json"}]}。只有声明了真实 sourceJson 的注册才支持重新读取来源；缺少来源时只能交付静态快照并明确说明。

直接按以上现有 CLI 和输入结构制作，不查找宿主源码或重新实现注册服务。需要了解命令选项时运行 tools live-artifacts --help；失败根据返回的结构化字段修正，不循环猜测接口。

生产阶段运行 `"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts create --input artifact.json`。更新已有产物则用 update --artifact-id <已知ID> --input artifact.json。不要提供 daemon 拥有的 id/projectId/timestamps；只使用工具返回的 ID 和文件。index.html 是 daemon 生成的预览，不由 Agent 冒造。在普通文本计划里说明产物名称及小写连字符 slug；create 输入使用相同 slug。使用工具返回的真实注册 ID 和预览入口，不猜测随机 ID。不把复制的静态 HTML 冒充可刷新入口。更新时保留同一个注册 ID 与 slug。

注册失败如实报告并保留源文件。渲染源数据属于制作步骤，完成后不再启动循环评价。

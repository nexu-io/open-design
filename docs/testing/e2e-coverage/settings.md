# 设置模块

## 覆盖范围

- Execution mode 页面
- Memory 页面
- Automations / Orbit 页面
- Language 页面
- Pets 页面
- Integrations 的 Skills 标签页
- Settings 的 Design systems 页面
- API protocol 迁移与切换回归
- 国际化内容注册完整性

## 对应测试文件

- `e2e/ui/settings-api-protocol.test.ts`
- `e2e/ui/settings-media-providers.test.ts`
- `e2e/ui/settings-memory-routines.test.ts`
- `e2e/ui/settings-design-systems.test.ts`
- `e2e/tests/localized-content.test.ts`
- `apps/web/tests/components/App.connectors.test.tsx`
- `apps/web/tests/components/App.mediaProviders.test.tsx`
- `apps/web/tests/components/MemorySection.test.tsx`
- `apps/web/tests/components/SettingsDialog.test.ts`
- `apps/web/tests/components/SettingsDialog.execution.test.tsx`
- `apps/web/tests/components/SettingsDialog.orbit.test.tsx`
- `apps/web/tests/components/SkillsSection.test.tsx`
- `apps/web/tests/components/DesignSystemsSection.test.tsx`

## 已自动化

| ID | 场景 | 来源 |
| --- | --- | --- |
| SET-001 | BYOK 页面展示 protocol tabs，以及 `Quick fill provider / API key / Model / Base URL` 核心字段 | `SettingsDialog.execution.test.tsx` |
| SET-002 | BYOK 的 `Show / Hide` 可以切换 API key 明文与密文显示 | `SettingsDialog.execution.test.tsx` |
| SET-003 | 切换 `Quick fill provider` 后，`Model` 与 `Base URL` 会联动更新到对应 preset | `SettingsDialog.execution.test.tsx`, `settings-api-protocol.test.ts` |
| SET-004 | 手动修改 `Base URL` 后，当前 provider 会回退为 custom 状态 | `SettingsDialog.execution.test.tsx` |
| SET-005 | 不同 protocol 的 draft 相互隔离，`apiKey` 不会跨协议泄漏 | `SettingsDialog.execution.test.tsx`, `SettingsDialog.test.ts` |
| SET-006 | 历史 OpenAI-compatible 已知 provider 切到 Anthropic 时，会命中对应 sibling preset | `settings-api-protocol.test.ts`, `SettingsDialog.test.ts` |
| SET-007 | 历史 custom provider 切换 protocol 时，会保留自定义 `Base URL` 和 `Model` | `settings-api-protocol.test.ts`, `SettingsDialog.test.ts` |
| SET-008 | BYOK 下只有必填字段合法时才会触发自动保存，非法 `Base URL` 会阻止保存 | `SettingsDialog.execution.test.tsx`, `settings-api-protocol.test.ts` |
| SET-009 | BYOK 自动保存后，配置会写入本地并在关闭后重新打开设置时正确回显 | `settings-api-protocol.test.ts` |
| SET-010 | Azure 的 `apiVersion` 仅保留在 Azure draft 中，不污染其他协议 | `SettingsDialog.test.ts` |
| SET-011 | Settings 弹窗支持右上角关闭按钮和遮罩关闭，关闭入口不会误触额外保存动作 | `SettingsDialog.execution.test.tsx` |
| SET-012 | Azure OpenAI 页面展示 `Deployment name / API version` 专属字段，并支持保存 Azure 配置 | `SettingsDialog.execution.test.tsx` |
| SET-013 | BYOK 支持切换到 `Custom model id` 输入路径并保存自定义 model | `SettingsDialog.execution.test.tsx` |
| SET-014 | Local CLI 模式下只能选择已安装 agent，选择后会自动保存为当前执行 CLI | `SettingsDialog.execution.test.tsx` |
| SET-015 | Local CLI 在无 agent 时显示 empty state，且不会触发无效保存 | `SettingsDialog.execution.test.tsx` |
| SET-016 | `Rescan` 会展示 loading 状态、阻止重复点击，并在成功后展示可用 agent 数 | `SettingsDialog.execution.test.tsx` |
| SET-017 | `Rescan` 失败时会展示错误提示，但不破坏当前页面状态 | `SettingsDialog.execution.test.tsx` |
| SET-018 | Configure execution 页面里的 `CLAUDE_CONFIG_DIR`、`CODEX_HOME` 可保存进配置 | `SettingsDialog.execution.test.tsx`, `SettingsDialog.test.ts` |
| SET-019 | daemon offline 时 `Local CLI` 模式不可选，并展示 offline 文案 | `SettingsDialog.execution.test.tsx` |
| SET-020 | Local CLI 保存后，首页左下角执行状态 pill 会联动展示当前 agent 与版本 | `settings-api-protocol.test.ts` |
| SET-021 | Media providers 会按 `已配置优先 -> Integrated 优先 -> 名称排序` 稳定展示，已配置 provider 会显示 `Configured` badge | `SettingsDialog.execution.test.tsx` |
| SET-022 | Unsupported media providers 会以禁用行展示，不允许编辑当前不支持的 provider 配置 | `SettingsDialog.execution.test.tsx` |
| SET-023 | Media providers 支持保存 API key / Base URL / 自定义 model，并在 `Clear` 后从保存 payload 中移除对应 provider | `SettingsDialog.execution.test.tsx` |
| SET-024 | Media providers 支持右上角关闭按钮和遮罩关闭，关闭入口不会误触额外保存动作 | `SettingsDialog.execution.test.tsx` |
| SET-025 | App 启动时如果本地已有已配置的 media providers，且 daemon 在线，会自动把配置同步到 daemon | `App.mediaProviders.test.tsx` |
| SET-026 | Settings 保存 media providers 后，会以 `force: true` 触发 daemon 同步，并把 `onboardingCompleted` 一并落盘 | `App.mediaProviders.test.tsx` |
| SET-027 | Media providers 页面支持从 daemon load error 回退到 browser-saved state，并可通过 `Reload from daemon` 拉回 saved marker / tail / base URL | `SettingsDialog.media.test.tsx`, `settings-media-providers.test.ts` |
| SET-028 | Media providers 的 reload 成功会展示短暂 `Reloaded` flash，失败时展示 sticky error，且 reload 不会覆盖 saved-marker 行上的本地 pending edit | `SettingsDialog.media.test.tsx`, `config.test.ts` |
| SET-029 | Media providers 支持 marker-only saved state：replace placeholder、saved tail badge、clear，以及 custom-model provider 清理时连同 `model` 一起移除 | `SettingsDialog.media.test.tsx` |
| SET-030 | 真实 settings media flow 支持 provider 输入自动保存，并在关闭后重新打开设置时稳定回显 | `settings-media-providers.test.ts` |
| SET-090 | Settings 中保存的 media provider 配置会被 New Project 的 Media model picker 跨页面消费：provider badge 从 `Integrated` 升级为 `Configured` | `settings-media-providers.test.ts`, `NewProjectPanel.media.test.tsx` |
| SET-031 | Connectors 页面会展示已保存的 Composio key 尾号、替换占位文案、帮助说明和 `Get API Key` 外链 | `SettingsDialog.execution.test.tsx` |
| SET-032 | Connectors 页面支持替换已保存的 Composio key，并在未保存时展示 pending 提示 | `SettingsDialog.execution.test.tsx` |
| SET-033 | Connectors 页面支持清空已保存的 Composio key，并在保存 payload 中移除保存态标记 | `SettingsDialog.execution.test.tsx` |
| SET-034 | Connectors 页面支持右上角关闭按钮和遮罩关闭，关闭入口不会误触额外保存动作 | `SettingsDialog.execution.test.tsx` |
| SET-035 | App 启动时如果本地没有待保存 key，会优先使用 daemon 返回的 Composio 已保存态展示尾号 | `App.connectors.test.tsx` |
| SET-036 | Settings 保存 Connectors key 时，本地只保留 `apiKeyConfigured/apiKeyTail`，同时把原始 key 同步给 daemon | `App.connectors.test.tsx` |
| SET-037 | 清空 Connectors 已保存 key 后，会把 cleared composio 配置同步给 daemon | `App.connectors.test.tsx` |
| SET-038 | MCP server 页面在 daemon 返回 install info 后，会默认渲染 Claude Code 的安装命令、重启提示和能力说明 | `SettingsDialog.execution.test.tsx` |
| SET-039 | MCP server 页面切换不同 client 后，会联动更新安装方式说明和 snippet 内容 | `SettingsDialog.execution.test.tsx` |
| SET-040 | MCP server 页面支持复制当前 snippet 到剪贴板，并展示 `Copied` 反馈 | `SettingsDialog.execution.test.tsx` |
| SET-041 | MCP server 页面在 daemon 无法返回 install info 时，会展示错误提示和降级 snippet 文案 | `SettingsDialog.execution.test.tsx` |
| SET-042 | 在 Settings 里保存 Connectors key 后，Entry 页 connectors gate 会立即解锁，且本地只保存尾号标记 | `entry-configuration-flows.test.ts` |
| SET-043 | Language 页面展开下拉后，会渲染完整 locale 列表，并正确标记当前已选语言 | `SettingsDialog.execution.test.tsx` |
| SET-044 | 在 Language 页面切换语言后，触发器文案会立即更新，同时把 locale 写入 `localStorage` 并同步 `html[lang]` | `SettingsDialog.execution.test.tsx` |
| SET-045 | 切换到 `fa` 等 RTL 语言后，会同步更新 `html[dir=rtl]`，且语言菜单支持 `Escape` 关闭 | `SettingsDialog.execution.test.tsx` |
| SET-046 | Language 页面不依赖全局保存按钮；语言切换即时生效，关闭 Settings 也不会回滚已应用 locale | `SettingsDialog.execution.test.tsx` |
| SET-047 | 多语言内容资源可通过翻译字典或英文 fallback 渲染为非空 skill、design system、prompt template 展示内容 | `localized-content.test.ts` |
| SET-048 | Design system category、prompt template category 和 tag 在缺少 locale 字典项时回退到源值，已有字典项仍可本地化 | `localized-content.test.ts` |
| SET-049 | Notifications 默认以 `offline` 展示；开启 completion sound 后才会显示成功/失败音选择器，并立即试听默认成功音 | `SettingsDialog.execution.test.tsx` |
| SET-050 | Notifications 支持切换 success / failure sound，并把声音选择保存到通知配置 | `SettingsDialog.execution.test.tsx` |
| SET-051 | Desktop notification 在授权成功后会切为 `active`，支持发送测试通知并展示发送结果文案 | `SettingsDialog.execution.test.tsx` |
| SET-052 | Desktop notification 在权限被拒绝时，会保持禁用并展示浏览器阻止提示，不显示测试按钮 | `SettingsDialog.execution.test.tsx` |
| SET-053 | Notifications 支持右上角关闭按钮和遮罩关闭，关闭入口不会误触额外保存动作 | `SettingsDialog.execution.test.tsx` |
| SET-054 | Appearance 页面把 `System` 作为当前模式回显；它表示“跟随系统”，而不是固定亮/暗主题 | `SettingsDialog.execution.test.tsx` |
| SET-055 | 在 Appearance 页面从 `Light/Dark` 切回 `System` 时，会移除显式 `html[data-theme]`，恢复系统跟随模式 | `SettingsDialog.execution.test.tsx` |
| SET-056 | Appearance 的实时主题预览在立即关闭后，会回滚到已保存主题，避免未落盘预览泄漏 | `SettingsDialog.execution.test.tsx` |
| SET-057 | 保存 `theme=system` 时，不会写死显式主题，同时会保留当前 accent color 配置 | `SettingsDialog.execution.test.tsx` |
| SET-058 | Pets 页面默认展示 Built-in 标签页，并把 bundled pets 与 community pets 分开显示 | `SettingsDialog.execution.test.tsx` |
| SET-059 | Pets 页面支持在 Custom 标签页编辑 `Name / Glyph / Greeting / Accent color`，实时更新预览并保存为当前自定义宠物 | `SettingsDialog.execution.test.tsx` |
| SET-060 | 已领养宠物的 `Wake / Tuck away` 状态切换会即时更新页面，并在保存时正确落到 `pet.enabled` | `SettingsDialog.execution.test.tsx` |
| SET-061 | Community 标签页支持 `Refresh` 和 `Download community pets`，并展示同步完成状态文案 | `SettingsDialog.execution.test.tsx` |
| SET-062 | Community 标签页的 hatch prompt 会带上当前 concept，支持复制到剪贴板并展示 `Copied!` 反馈 | `SettingsDialog.execution.test.tsx` |
| SET-063 | Integrations 的 Skills 标签页展示 functional skills，支持按 type/category 筛选并结合搜索缩小结果 | `SettingsDialog.execution.test.tsx`, `SkillsSection.test.tsx` |
| SET-064 | Integrations 的 Skills 标签页支持展开详情，并可通过 toggle 把 skill 加入 `disabledSkills` 保存 | `SettingsDialog.execution.test.tsx`, `SkillsSection.test.tsx` |
| SET-065 | Settings 的独立 Design systems 页面支持按 category 筛选、展开详情，并保存 `disabledDesignSystems` | `SettingsDialog.execution.test.tsx`, `DesignSystemsSection.test.tsx` |
| SET-066 | Integrations 的 Skills 标签页在筛选或搜索无匹配时展示空结果提示 | `SettingsDialog.execution.test.tsx` |
| SET-067 | About 页面会正确展示 `Version / Channel / Runtime / Platform / Architecture` 五项只读版本信息 | `SettingsDialog.execution.test.tsx` |
| SET-068 | About 页面在 `appVersionInfo` 缺失时，会展示版本信息不可用的降级空态 | `SettingsDialog.execution.test.tsx` |
| SET-069 | About 页面是只读信息页；关闭按钮或遮罩关闭不会产生保存动作或脏状态 | `SettingsDialog.execution.test.tsx` |
| SET-070 | Settings 顶部 autosave 状态会覆盖 `Saving… / All changes saved / Couldn’t save changes` 三种状态 | `SettingsDialog.execution.test.tsx` |
| SET-071 | BYOK 页面 `Test` 按钮只有必填字段可用后才允许测试，并会展示 provider 连接测试结果 | `SettingsDialog.execution.test.tsx` |
| SET-072 | Local CLI 页面 `Test` 按钮会使用当前选中的已安装 agent 发起连接测试，并展示 agent 响应结果 | `SettingsDialog.execution.test.tsx` |
| SET-073 | Appearance 支持 preset accent color 和自定义色值，切换时实时预览并自动保存 `accentColor` | `SettingsDialog.execution.test.tsx` |
| SET-074 | Orbit 页面在没有可用 connector 时锁定 Run / 开关 / 时间 / 模板控件，并通过 gate CTA 跳转到 Connectors | `SettingsDialog.orbit.test.tsx` |
| SET-075 | Orbit 页面在 connector 可用后支持切换 daily summary、修改 run time、切换 prompt template，并自动保存 schedule 配置 | `SettingsDialog.orbit.test.tsx` |
| SET-076 | Orbit 页面展示最近一次运行收据、统计计数、live artifact 入口，并支持复制 markdown 结果 | `SettingsDialog.orbit.test.tsx` |
| SET-077 | Memory 页面默认展示新的三分区 source tabs：`Add manually / Learn from chats / Import from apps`，并保留手动新增入口 | `settings-memory-routines.test.ts` |
| SET-078 | Memory 页面会展示 `Saved memory` 统计、type filters、extractions 管理按钮和 `Memory tree` 结构摘要 | `settings-memory-routines.test.ts`, `MemorySection.test.tsx` |
| SET-079 | 手动新建 memory 后，条目会立即出现，并在关闭后重开设置时继续可见 | `settings-memory-routines.test.ts`, `MemorySection.test.tsx` |
| SET-080 | 关闭 memory injection 后，会展示 disabled banner，并在重开设置时保持关闭状态 | `settings-memory-routines.test.ts`, `MemorySection.test.tsx` |
| SET-081 | `Learn from chats` 开关会持久化 `chatExtractionEnabled`，重开 Memory 页面后保持一致 | `settings-memory-routines.test.ts`, `MemorySection.test.tsx` |
| SET-082 | 手动创建 memory 失败时，编辑器保持打开，用户已输入内容不会丢失 | `settings-memory-routines.test.ts`, `MemorySection.test.tsx` |
| SET-083 | Automations 主页面支持创建 automation、Run now，并在列表内展示最近一次运行入口 | `settings-memory-routines.test.ts` |
| SET-084 | Automations 创建失败时，modal 保持打开并回显错误，不会误写入列表 | `settings-memory-routines.test.ts` |
| SET-085 | `Import from apps` 页面支持通过 `Manage` 跳到 `Connectors`，并在重开后保留 connector authorization pending 状态 | `settings-memory-routines.test.ts`, `MemorySection.test.tsx` |
| SET-086 | `Import from apps` 支持 connected app 的选择、扫描、失败诊断、`Suggested memories` 保存，以及 `Saved memory` extraction 的 `Refresh / Clear` 管理 | `settings-memory-routines.test.ts`, `MemorySection.test.tsx` |
| SET-087 | `Import from apps` 支持 connector OAuth 完成后的回流：pending app 会在授权回调后变成 connected，并可立即继续扫描生成 suggested memories | `settings-memory-routines.test.ts` |
| SET-088 | `Import from apps` 在 mixed connector state 下保持稳定：已连接、刚完成 OAuth、仍未连接的 app 会正确更新 `connected / selected` 计数，且扫描只提交已选中的 connected apps | `settings-memory-routines.test.ts` |
| SET-089 | `Import from apps` 会在 connected app 断连/重连后自动收敛已选集合：失联 app 被移出 selected，恢复连接后不会误自动重新选中，扫描 payload 只包含当前仍选中的 connected apps | `settings-memory-routines.test.ts` |

## 自动化候选

| ID | 场景 | 原因 |
| --- | --- | --- |
| SET-C03 | Media providers 配置被下游视频/音频生成请求实际消费的端到端回归 | 图片生成请求链路已由 `settings-media-providers.test.ts` 覆盖；视频/音频仍可在对应生成入口稳定后补 |
| SET-C05 | MCP server 的 Cursor deeplink / 多平台路径差异（macOS/Linux/Windows） | 适合自动化，但需要更细的环境 mock 或浏览器 scheme 行为校验，适合后续补 |
| SET-C06 | Notifications 在 ProjectView 中收到真实任务完成事件后，是否按 success/failure 正确播放声音和发送桌面通知 | 适合自动化，但需要结合流式消息完成态和窗口焦点状态做更完整联动断言 |
| SET-C07 | `theme=system` 时在系统亮/暗偏好切换下，页面是否通过 `matchMedia` 或宿主环境同步实时跟随 | 适合自动化，但要先确认当前实现是否真的监听系统主题变化 |
| SET-C08 | Pets 页面上传 sprite、导入 Codex atlas、裁剪单行或保留 full atlas 的文件处理链路 | 适合自动化，但依赖文件输入、图片读取、canvas 裁剪和 atlas 预处理，维护成本更高 |
| SET-C09 | Built-in / Community 宠物的一键领养路径：下载 spritesheet、准备 atlas、写入 custom slot 并在 overlay 中真实生效 | 适合自动化，但需要补齐 fetch/blob/image 级 mock 或浏览器级联动验证 |
| SET-C10 | Skills / Design Systems 在 ProjectView / runtime 生成流中被真实消费：禁用项不会进入可用内容库或生成上下文 | Entry 创建入口已由 `settings-design-systems.test.ts` 覆盖；ProjectView / runtime 生成上下文仍可后续补 |
| SET-C11 | Memory 的 `Import from apps` 真实多步授权回流：外部浏览器完成 OAuth 后通过宿主/弹窗回调返回，再次打开 Settings 时是否能正确恢复到最新 connected 状态 | 现在 E2E 已覆盖页面内 callback、mixed state、断连/重连收敛，但还没覆盖更接近真实宿主环境的跨窗口回流 |

## 手工保留

| ID | 场景 | 原因 |
| --- | --- | --- |
| SET-M01 | 不同主题下的整体观感是否协调 | 视觉主观项，人工验收更合理 |
| SET-M02 | 多语言翻译语气是否自然、本地化是否地道 | 语义质量判断仍需人工 review |

## 说明

- API protocol 用例的价值在于：历史配置迁移和协议切换很容易静默回归，单靠单元测试不够稳。
- `localized-content.test.ts` 不是浏览器流，但它确实保护了设置页/入口页在多语言下的展示完整性，适合放在这个模块下维护。

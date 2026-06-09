---
name: open-design-tracking
description: >
  给 Open Design web (apps/web) 加 / 改 PostHog 埋点的完整流程。当需要为某个
  UI 行为新增或修改埋点事件 (ui_click / surface_view / page_view / *_result)、
  扩展 analytics 事件参数 (page_name/area/element/...)、或把新埋点同步回飞书
  「Open Design 埋点文档」时使用。触发词：埋点、加埋点、tracking、analytics、
  PostHog、上报、事件参数、trackXxxClick。处理飞书文档读写、命名规范、
  contracts + web 两处代码改动、以及验收。
---

# Open Design 埋点流程

给 `apps/web` 的某个用户行为加埋点 = 5 步：① 读规范文档 → ② 设计三元组 → ③ 改 contracts 类型 → ④ 加 track 调用 → ⑤ 同步文档。先读懂现有规范再动手，**不要凭空发明 area/element 命名**。

## 0. 前置

- 在 `open-design` 仓库内工作（`apps/web`、`packages/contracts`）。
- 飞书读写用 `lark-cli ... --as user`（埋点文档是个人/团队资源，user 身份才读得到）。

## 1. 读埋点文档（飞书）

文档：**「Open Design 埋点文档」**
- wiki node token：`Ltr7wd07siTU7lk9aTacaCGYneD`
- 底层电子表格 obj_token：`P4ajsXTmfhI4wFthrwIcpoBknhc`
- 主工作表：`MUu2Au`（标题「埋点文档2.0」，23 列 × ~119 行，**这是唯一现行表**）；`VCEpqt`（1.0）已废弃，忽略。

列含义：A 页面名称 · B 事件英文名 · C 事件类型 · I 触发时机 · J 触发频次 · **L 事件参数**（最关键）· M 指标映射 · N 验收规则。

读全表关键列（筛你关心的模块，如 plugin/home/composer）：
```bash
lark-cli api GET "/open-apis/sheets/v2/spreadsheets/P4ajsXTmfhI4wFthrwIcpoBknhc/values/MUu2Au!A2:L119" --as user --format json > /tmp/track.json
# 用 python 展平 cell（cell 可能是富文本数组），打印 A/B/C/I/L 列，grep 你的模块关键词
```
展平函数（飞书 cell 是 list[dict{text}]）：
```python
def flat(c):
    if isinstance(c,list): return ''.join(flat(x) for x in c)
    if isinstance(c,dict): return c.get('text','')
    return str(c) if c is not None else ''
```

读之前先确认：**你要加的埋点文档里是不是已经规划好了**（常有「文档已定义、代码未实现」的行，例如某 element 已在枚举里）。是的话直接照着落地，不要新造。

## 2. 设计埋点（命名规范）

**事件类型**（B 列 / `send(track, '<event>', props)` 的第二参）：
- `page_view` — tab/页面渲染完成
- `surface_view` — 弹窗/浮层/抽屉曝光
- `ui_click` — 点击（最常用）
- `<name>_result` — 一段流程结束（成功/失败/取消），如 `project_create_result`、`run_created`、`run_finished`、`file_upload_result`

**三元组（必填）**：`page_name` + `area` + `element`
- `page_name` 枚举：`home | projects | automations | plugins | design_systems | integrations | studio | chat_panel | settings | landing_home | file_manager`
- `area` = 页面内的区域，snake_case（如 `chat_composer`、`community_gallery`、`plugin_detail_modal`、`new_project_modal`、`templates_dropdown`）
- `element` = 区域内的具体控件，snake_case 枚举（如 `use_plugin`、`plugin_chip`、`working_dir_clear`、`send_button`）
- 清除/次级动作沿用既有对称命名：主控件 `working_dir` ↔ 清除 `working_dir_clear`；`plugin_chip` ↔ `plugin_chip_clear`。
- 维度字段按需补：`plugin_id`、`plugin_type`、`chip_id`、`action`、`template_id`、`resource_kind`/`resource_id` 等。`action` 这类子类型用下划线枚举（`use | use_with_query`），**注意代码里的内部值若是 kebab-case（`use-with-query`）要映射成下划线**。

公共参数（`event_id / request_id / session_id / device_* / app_version / has_available_configure_cli / configure_type / configure_availability` 等）由 AnalyticsProvider 自动带，**不要手动塞进 props**。

## 3. 改 contracts 类型

`packages/contracts/src/analytics/events.ts`（纯 TS）。每个埋点点位一个强类型 `interface`，字面量收紧 page_name/area/element：
```ts
export interface CommunityGalleryClickProps {
  page_name: 'home';
  area: 'community_gallery';
  element: 'card' | 'card_open_external' | 'use_plugin';   // 扩枚举就在这加
  plugin_id?: string;
  plugin_type?: string;
  action?: 'use' | 'use_with_query';                        // 维度字段
}
```
- 扩展现有点位：直接往 `element` union / 字段里加，配注释说明何时上报。
- 新点位：新增 interface，并加入文件末尾的总 union type（约 line 1900+，`| XxxProps`），否则 `track()` 不认。

## 4. 加 track 调用

`apps/web/src/analytics/events.ts` —— 每个 props 类型配一个薄封装：
```ts
import type { CommunityGalleryClickProps } from '@open-design/contracts/analytics';

export function trackCommunityGalleryClick(track: Track, props: CommunityGalleryClickProps): void {
  send(track, 'ui_click', props);   // 'ui_click' | 'surface_view' | 'page_view' | '<x>_result'
}
```
（`send` 已存在，转发到 AnalyticsProvider 的 `track`。）

组件里调用：`const analytics = useAnalytics();` 然后在 handler 里
```ts
trackCommunityGalleryClick(analytics.track, {
  page_name: 'home', area: 'community_gallery', element: 'use_plugin',
  action: action === 'use-with-query' ? 'use_with_query' : 'use',   // kebab→下划线映射
  plugin_id: record.sourceMarketplaceEntryName ?? record.id,
  plugin_type: record.marketplaceTrust ?? 'official',
});
```
**埋在数据最全、最唯一的地方**：多个入口共用一个 handler（如 `routePluginUse` 被卡片和详情弹窗共用）时，埋在 handler 入口一次覆盖所有入口，而不是每个按钮各埋一遍。清除类按钮包一层 onClick：先 `trackXxx(...)` 再调原回调。

改完 contracts 必须重建类型再 typecheck：
```bash
pnpm --filter @open-design/contracts build      # 生成 dist 的 .d.ts，web 才看得到新类型
pnpm --filter @open-design/web typecheck
```

## 5. 同步飞书文档

代码新增了文档里**还没有**的 area / element / event，要补回 `MUu2Au`。最稳是「读 cell → 字符串最小替换 → 写回」，避免动其它内容。

读某行 L 列全文（单 cell 直接读有时返回空，用整行 `A<n>:L<n>` 更稳）：
```bash
lark-cli api GET "/open-apis/sheets/v2/spreadsheets/P4ajsXTmfhI4wFthrwIcpoBknhc/values/MUu2Au!A13:L13" --as user --format json > /tmp/cell.json
# python flat(values[0][11]) 拿 L13 全文
```
最小替换 + 写回（**range 单 cell 必须写成 `L13:L13`，写 `L13` 会报 90202 wrong range**）：
```python
newL = L.replace('working_dir_clear|task_chip', 'working_dir_clear|plugin_chip_clear|task_chip')
json.dump({'valueRange':{'range':'MUu2Au!L13:L13','values':[[newL]]}}, open('/tmp/put.json','w'), ensure_ascii=False)
```
```bash
lark-cli api PUT "/open-apis/sheets/v2/spreadsheets/P4ajsXTmfhI4wFthrwIcpoBknhc/values" --as user --data "$(cat /tmp/put.json)" --format json
# 看 data.updatedCells == 1；然后回读 A13:L13 验证新值在、其余结构未动
```
新增整行点位则用 append/写新行区间，同样 `range` 用范围格式。写飞书是对外写操作，动手前向用户确认。

## 6. 验收

```bash
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/contracts build && pnpm --filter @open-design/contracts test
pnpm --filter @open-design/web test     # 跑被改组件相关的测试文件即可
pnpm guard                               # 仓库根
```
埋点字段进了强类型 union，typecheck 是第一道闸。改了 `packages/contracts` 记得先 build 再 web typecheck。

## 易错点

- 改了 contracts 没 build → web typecheck 仍报旧类型；先 `--filter @open-design/contracts build`。
- 新 interface 忘了加进末尾 union → `track()` 调用处类型不匹配。
- 内部 action 值 kebab-case（`use-with-query`）直接上报 → 应映射成文档约定的下划线（`use_with_query`）。
- 公共参数手动塞进 props → 重复，交给 provider。
- 飞书写 range 用单 cell `L13` → `90202 wrong range`，改 `L13:L13`。
- 凭直觉造 area/element → 先读文档，多数已有对应或已规划。

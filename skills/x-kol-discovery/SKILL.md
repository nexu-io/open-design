---
name: x-kol-discovery
version: 1.0.0
description: "在 X (Twitter) 上穷尽搜索某个产品/项目的自来水推广博主，按统一 rubric 打分分级（A/B/C），写入飞书 Twitter KOLs sheet。Use when user asks to: 在 X 上找推广 XX 的博主 / 找 XX 的 X 自来水 / 收集 X 上的 KOL / KOL outreach 池 / 给某产品做 X KOL pool / refresh Twitter KOL sheet."
metadata:
  requires:
    bins: ["lark-cli", "twitter", "jq", "python3"]
---

# X KOL Discovery Skill

**目的：** 给定一个产品（GitHub repo + X 官号 + 关键词），穷尽找出一段时间内在 X 上推广它的自来水博主，统一打分写入飞书 sheet。

**前置：**
- `twitter --version` ≥ 0.8.5（`pipx install twitter-cli`），且 `twitter user @anyhandle` 能返回 JSON（说明已登录）
- `lark-cli` 已配置 user 身份（见 `../lark-shared/SKILL.md`）
- 飞书目标 sheet 已存在，列结构按本 skill 约定（见步骤 5）

## 输入

用户给三件事，缺哪个就问：
1. **产品标识**：GitHub repo URL + X 官号（如 `nexu-io/open-design` + `@nexudotio`）
2. **时间范围**：默认最近 30 天
3. **目标 sheet**：飞书 spreadsheet URL + sheet_id（追加模式）

## 步骤 1：穷尽搜索

构造关键词矩阵，每个关键词跑 `--since DATE -t latest --json` **和** `-t top --json` 两次（合计 N×2 个查询），结果写到 `/tmp/<product>-search/qN.json`。

**关键词矩阵**（用产品的 X 官号 handle / repo 名 / 产品名拼出来）：
- `<handle>`（不带 @）
- `@<handle>`
- `<product-name>`（如 `Open Design`）— **带空格的全名必须独立搜一次**，中文/纯文本博主写法多是这种
- `"<product-name>"`（带引号的精确匹配，进一步过滤）
- `<repo-name>`（如 `open-design`）— 连字符变体
- `<org/repo>`（如 `nexu-io/open-design`）
- `<org-name>`（如 `nexu-io`）
- 产品的差异化定位词（如 `Claude Design alternative` / `open source <竞品>`）

**注意**：`open-design`（连字符）和 `Open Design`（带空格）会**搜出不同结果集**——必须都跑。漏了 yihui_indie（5.2w 粉的 A 级博主）就是因为只搜了连字符版本。

每条关键词限制 `-n 100`。Twitter API 单次查询封顶约 40 条，所以早窗口（如 `--since X --until X+14d`）要单独跑一遍补全。

```bash
twitter search "@nexudotio" -n 100 --since 2026-04-21 -t latest --json > q1.json
twitter search "nexu-io/open-design" -n 100 --since 2026-04-21 -t latest --json > q2.json
# ... 重复
twitter search "@nexudotio" -n 100 --since 2026-04-21 --until 2026-05-05 -t latest --json > q_early.json
```

合并去重，排除官号自己的推文：

```bash
jq -s '[.[].data[]] | unique_by(.id) | map(select(.author.screenName != "<official_handle>"))' q*.json > merged_all.json
```

## 步骤 2：主题相关性过滤

用 jq 把推文文本对照关键词正则过滤，剔除「design」「open」等通用词的误命中：

```bash
jq '[.[] | select(.text | test("<handle>|<repo-name>|<product-name>|open-source <product>"; "i"))]' \
  merged_all.json > merged_filtered.json
```

## 步骤 3：人工剔除非自来水

用 `Read` 看完整 `merged_filtered.json`（按 likes 排序的 TSV 看更快），从结果里**剔除**：

| 类型 | 示例 |
|---|---|
| 团队/创始人 | 用 `twitter user @<handle>` 看 bio 是否含 "Co-founder @<official>" 或 "@<official> CTO" 等；含则剔 |
| 批评/吐槽 | 「lol I don't think you guys understand」「just running the website inside Codex」等否定语气 |
| 通用 emoji 回复 | 单独的「🔥」「❤️」「nice!」「awesome」 |
| 自动 newsletter bot | 看 bio 含 "automated bot posting" / "Daily GitHub finds" 且每日重复推同样模板 |
| 求助/吐槽 | 「Daemon 403 error 怎么办」「能不能做成 plugin」 |
| 同义关键词误命中 | text 不含产品名，只是讨论 generic "design" / "open source" |
| 已在 sheet 里的 handle | 步骤 5 读现有 sheet 拿到的 handle 列表 |

剩下的就是候选自来水池。

## 步骤 4：拉用户元数据 + 打分

```bash
# 并行拉用户卡片
mkdir -p users
while read h; do
  twitter user "@$h" --json > "users/$h.json" 2>&1 &
  if (( $(jobs -r | wc -l) >= 8 )); then wait -n; fi
done < final_keep.txt
wait
```

**评分规则（统一，不要随便改 — 改了要同步更新 sheet 顶部 rubric）**：

```
score = 20
      + (verified ? 2 : 0)
      + 粉丝档位（≥1k+2 / ≥5k+4 / ≥1w+6 / ≥5w+8）
      + 点赞档位（≥2+1 / ≥10+3 / ≥30+5 / ≥100+8）
      + 阅读档位（≥500+1 / ≥5k+3 / ≥5w+6）
      + 命中关键词 +3（关键词列表 = 产品名 / repo 名 / 「开源」/「open-source」/「オープンソース」）
封顶 50

分级：≥40 → A 级 · 优先回；30–39 → B 级 · 择机回；<30 → C 级 · 观察
```

**手动上调**：规则不覆盖的高价值贡献（YouTube 视频专题、长文系列、社区 PR 提交），可手动上调到 B 级，备注里写明原因（例：「B 级（手动上调：YouTube 视频专题报道）」）。

打分后按 `(tier, -score)` 排序，重新编号 `#`。

## 步骤 5：写入飞书 sheet

**Sheet 列结构**（A:R 共 18 列）：

| # | 优先级 | 评分 | X Handle | 认证 | 粉丝 | Bio | 推文摘要 | 情感 | 时效 | 👀 Views | ❤️ Likes | 互动建议 | 钩子 | 推文链接 | 状态 | 负责人 | 备注 |

**首次创建表时**，在 A1:R1 合并 1 行写 rubric（一行字），然后 `update-sheet --frozen-row-count 2` 把 rubric+表头一起冻结：

```bash
RUBRIC='评分 = 20 + 粉丝(≥1k+2 / ≥5k+4 / ≥1w+6 / ≥5w+8) + 点赞(≥2+1 / ≥10+3 / ≥30+5 / ≥100+8) + 阅读(≥500+1 / ≥5k+3 / ≥5w+6) + 蓝V+2 + 关键词命中+3，封顶 50。≥40 A / 30-39 B / <30 C。规则不覆盖的高价值贡献（视频专题/长文系列/社区 PR）可手动上调到 B'

lark-cli sheets +write   --url "$URL" --sheet-id "$SID" --range "A1:A1" --values "[[\"$RUBRIC\"]]"
lark-cli sheets +merge-cells --url "$URL" --sheet-id "$SID" --range "A1:R1" --merge-type MERGE_ROWS
lark-cli sheets +update-sheet --url "$URL" --sheet-id "$SID" --frozen-row-count 2
```

**追加数据时**，先读现有数据末尾位置，从下一行起 `+append`：

```bash
lark-cli sheets +append --url "$URL" --sheet-id "$SID" \
  --range "A1:R200" --values "$(cat sheet_rows.json)"
```

**URL 列（推文链接）格式**（写入时用对象，不要传字符串）：

```json
{"type":"url","text":"https://x.com/<h>/status/<id>","link":"https://x.com/<h>/status/<id>"}
```

## 步骤 6：差异化标签（可选）

C 级粉丝 > 2k 的，逐个看推文判定：
- **强聚焦产品** → 升 B 级，备注说明手动上调原因
- **真实用户吐槽 / 反馈 issue** → 不放 outreach 池，标「产品反馈 - issue 跟进」
- **想合作 / 想集成** → 标「合作机会」
- **泛泛夸赞** → 留 C 级

## 工作目录

所有中间产物放 `/tmp/<product>-search/`，不要污染用户工作区：
- `q*.json` — 搜索原始结果
- `merged_all.json` / `merged_filtered.json` — 去重 / 主题过滤后
- `users/<h>.json` — 用户卡片
- `final_keep.txt` — 人工剔除后的候选 handle 列表
- `rows_scored.json` — 打分后行数据
- `sheet_rows.json` — sheet 写入格式

## 权限

| 操作 | 所需 |
|---|---|
| `twitter search` / `twitter user` | TWITTER_AUTH_TOKEN + TWITTER_CT0（cookie） |
| `lark-cli sheets +read/+write/+append` | scope `sheets:spreadsheet` |
| `lark-cli sheets +merge-cells` / `+update-sheet` / `+insert-dimension` | scope `sheets:spreadsheet:write_only` |

## 已知限制

- **Twitter search 上限 ~40 条/查询**：必须用关键词矩阵 × 时间窗口分片才能穷尽
- **search GraphQL 端点会变**：报 404 就 `pipx upgrade twitter-cli`；最新版还不行就 fallback 到 `twitter user-posts @<handle>` + 手动看每个候选
- **VPS/数据中心 IP 风险**：高频 `twitter search` 容易被风控，跑这个 skill 用本地或住宅代理
- **Bio 团队识别有假阴**：有些团队成员 bio 不挂官号，靠 @ mention 频率和发推风格识别（连续多天每天多条转推官号 ≈ 团队）
- **打分不捕捉平台外贡献**：YouTube 视频专题、长文系列、社区 PR 在 X 推文上看不出来，靠步骤 6 手动覆盖

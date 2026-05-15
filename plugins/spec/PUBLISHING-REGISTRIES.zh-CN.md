# 发布到 Skill Registries

语言：[English](PUBLISHING-REGISTRIES.md) | 简体中文

Open Design 插件刻意设计成一个文件夹可以跨多个 agent 生态流转。最稳妥的发布模型是：

1. 把公开 GitHub 仓库或 Open Design PR 作为 source of truth。
2. 保持 `SKILL.md` 可移植、适合 registry 读取。
3. 添加 `open-design.json` 作为 Open Design sidecar。
4. 本地验证通过后，再发布或登记到外部 registry。

各 registry 的规则可能变化，运行 publish 命令前一定要查看目标 registry 的当前文档。

## 推荐发布顺序

1. 本地验证插件文件夹。
2. 推送公开 GitHub 仓库，或向 Open Design 打开 PR。
3. 在 README 中添加 Open Design 和通用 Agent Skills 客户端的安装说明。
4. 添加 registry 专属 badge 或链接。
5. 发布到符合目标用户的 registry。
6. 在 README 和 PR body 中记录所有已发布 URL。

## Registry 矩阵

| 目标 | 适合场景 | 源形态 | 发布策略 |
| --- | --- | --- | --- |
| Open Design | OD marketplace、composer chips、pipelines、GenUI、artifact provenance | `SKILL.md` + `open-design.json` | 向 Open Design 提 PR，或发布指向插件仓库的 marketplace index entry。 |
| skills.sh | 面向多种编码 agent 的 Agent Skills 发现 | 包含 `SKILL.md` 的公开 Git repo 或 subpath | 确保 `npx skills add owner/repo` 可用，添加 skills.sh badge，并写清 README。 |
| ClawHub | 让 OpenClaw 用户从 registry 安装 skills 或 OpenClaw plugins | skill 使用 `SKILL.md` 文件夹；plugin 使用 OpenClaw package metadata | `SKILL.md` 文件夹使用 `clawhub skill publish ./my-skill`。只有同时提供 OpenClaw plugin metadata 时，才使用 `clawhub package publish ... --family code-plugin`。 |
| 独立 GitHub | source of truth 和广泛 agent 兼容 | 可移植文件夹或 mono-repo subpath | 打 tag、写安装命令、维护 changelog。 |

## skills.sh 策略

skills.sh 生态索引可安装 Agent Skills，并把 `skills` CLI 作为主要安装路径。公开文档展示了通过 GitHub 风格来源安装：

```bash
npx skills add owner/repo
npx skills add https://github.com/owner/repo/tree/main/path/to/skill
npx skills add ./my-local-skills
```

对 Open Design 插件作者：

- 确保 repo 或 subpath 包含合法 `SKILL.md`。
- 保持 `open-design.json` 为纯增量；通用 skill 客户端应能忽略它。
- 在 README 中放一个短安装块：

```bash
npx skills add owner/repo --skill my-plugin
od plugin install https://github.com/owner/repo
```

- 公共来源稳定后添加 badge：

```markdown
[![skills.sh](https://skills.sh/b/owner/repo)](https://skills.sh/owner/repo)
```

- 使用与插件主类匹配的 GitHub topic 和 README 关键词，例如 `open-design-plugin`、`agent-skill`、`prototype`、`deck`、`hyperframes`、`design-system`。

不要把 skills.sh 视为 canonical 存储位置。GitHub 是 source of truth，skills.sh 是发现和安装表面。

## ClawHub 策略

ClawHub 是 OpenClaw 的 skills 和 plugins registry layer。它的文档区分 skill publishing 与 package publishing：

```bash
npm i -g clawhub
clawhub login

clawhub skill publish ./my-skill \
  --slug my-skill \
  --name "My Skill" \
  --version 1.0.0 \
  --changelog "Initial release"
```

普通 Open Design 插件应优先走这个路径，因为它们以 `SKILL.md` 为核心。

只有当你明确发布 OpenClaw code plugin，并提供 OpenClaw compatibility metadata 时，才使用 OpenClaw package 路径：

```bash
clawhub package publish <source> --family code-plugin --dry-run
clawhub package publish <source> --family code-plugin
```

为了适配 ClawHub：

- 保持 `SKILL.md` metadata 准确。
- 在 README 和 skill 正文中声明所需环境变量、工具、权限、connectors 或 network access。
- 公开 listing 前先跑 dry run 或 inspect。
- 链回 canonical GitHub repo 和 Open Design PR。
- changelog 诚实且版本化。
- `open-design.json` 的 `specVersion` 保持为规范包版本；每次可发布的行为变化都 bump 插件 `version`。

## 安全 Checklist

公共 skill registry 是供应链表面。发布前检查：

- 没有隐藏安装脚本。
- 不自动收集凭据。
- 没有未声明原因的网络请求。
- 没有未经过用户明确确认的破坏性 shell 命令。
- 包含 `license`、`author`、source URL、version 和 changelog。
- 包含 `pnpm guard`、plugin manifest validation 和 registry dry run 的验证输出。
- 优先使用小型示例资产，避免大型不透明 archives。

## PR Body 片段

```markdown
## Registry publishing

- Canonical source:
- Open Design PR:
- Open Design specVersion:
- Plugin version:
- Marketplace catalog version:
- skills.sh install:
- ClawHub listing:
- Other registries:

## Registry validation

- `pnpm guard`:
- `pnpm --filter @open-design/plugin-runtime typecheck`:
- `od plugin validate ./path/to/plugin`:
- `npx skills add ... --list`:
- `clawhub skill publish ./path --dry-run` or equivalent:
```

## 参考

- [skills.sh](https://skills.sh/)
- [skills.sh docs](https://www.skills.sh/docs)
- [skills CLI](https://github.com/vercel-labs/skills)
- [ClawHub](https://clawhub.ai/)
- [ClawHub quickstart](https://github.com/openclaw/clawhub/blob/main/docs/quickstart.md)
- [How ClawHub works](https://documentation.openclaw.ai/clawhub/how-it-works)

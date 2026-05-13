# Magazine Web PPT · 电子杂志风网页 PPT Skill

> 🌏 **English version: [README.en.md](./README.en.md)**

一个 [Claude Code / Claude Agent Skills](https://agentskills.io/) 技能,用于生成**单文件 HTML 横向翻页 PPT**,视觉基调是"**电子杂志 × 电子墨水**"——像 *Monocle* 贴上了代码的样子。

> 由 [歸藏](https://x.com/op7418) 在"一人公司:被 AI 折叠的组织"、"一种新的工作方式"等线下分享中沉淀而成,踩过的每一个坑都写进了 `checklist.md`。

![Magazine Web PPT 效果展示](https://github.com/user-attachments/assets/5dc316a2-401c-4e37-9123-ea081b6ae470)

## 效果

- 🖋 **衬线大标题 + 非衬线正文 + 等宽元数据**的三级字体分工
- 🌊 **WebGL 流体/色散背景**,hero 页可见,正文页克制
- 📐 **横向左右翻页**:键盘 ← → / 滚轮 / 触屏滑动 / 底部圆点 / ESC 索引
- 🎨 **5 套主题色预设**:墨水经典 / 靛蓝瓷 / 森林墨 / 牛皮纸 / 沙丘
- 🧩 **10 种页面布局**:开场封面、章节幕封、数据大字报、左文右图、图片网格、Pipeline、悬念问题、大引用、Before/After 对比、图文混排
- 📄 **单文件 HTML**:不需要构建、不需要服务器,浏览器直接打开

## 适合 / 不适合

**✅ 合适**:线下分享 / 行业内部讲话 / 私享会 / AI 产品发布 / demo day / 带强烈个人风格的演讲

**❌ 不合适**:大段表格数据 / 培训课件(信息密度不够)/ 需要多人协作编辑(静态 HTML)

## 安装

### 方式一:把下面这段话直接发给 AI(推荐)

> 帮我安装 `guizang-ppt-skill` 这个 Claude Code skill。请按下面步骤做:
>
> 1. 确保 `~/.claude/skills/` 目录存在(不存在就创建)
> 2. 执行 `git clone https://github.com/op7418/guizang-ppt-skill.git ~/.claude/skills/magazine-web-ppt`
> 3. 验证:`ls ~/.claude/skills/magazine-web-ppt/` 应该看到 `SKILL.md`、`assets/`、`references/` 三项
> 4. 告诉我安装好了,之后我说"做一份杂志风 PPT"之类的话就会触发这个 skill

把这段话复制粘贴给 Claude Code / Cursor / 任何有 shell 权限的 AI Agent,它会自动完成安装。

### 方式二:手动命令行

```bash
git clone https://github.com/op7418/guizang-ppt-skill.git ~/.claude/skills/magazine-web-ppt
```

### 触发方式

装好后,Claude Code 会在对话里自动发现并调用这个 skill。触发关键词:

- "帮我做一份杂志风 PPT"
- "生成一个 horizontal swipe deck"
- "editorial magazine style presentation"
- "electronic ink 风格演讲 slides"

## 使用流程

Skill 本身是结构化的 6 步工作流,Claude 会逐步引导:

1. **需求澄清** — 6 问清单:受众、时长、素材、图片、主题色、硬约束
2. **拷贝模板** — `assets/template.html` → 项目目录,改 `<title>`,换主题色
3. **填充内容** — 从 10 种 layout 骨架里挑、粘、改文案(先做类名预检 + 主题节奏规划)
4. **自检** — 对照 `references/checklist.md`,P0 级问题必须全过
5. **预览** — 浏览器直接打开
6. **迭代** — inline style 改字号/高度/间距

详细说明见 [`SKILL.md`](./SKILL.md)。

## 目录结构

```
magazine-web-ppt/
├── SKILL.md              ← Skill 主文件:工作流、原则、常见错误
├── README.md             ← 本文件
├── assets/
│   └── template.html     ← 完整可运行的种子 HTML(CSS + WebGL + 翻页 JS 全配好)
└── references/
    ├── components.md     ← 组件手册(字体、色、网格、图标、callout、stat、pipeline)
    ├── layouts.md        ← 10 种页面布局骨架(可直接粘贴)
    ├── themes.md         ← 5 套主题色预设(只能选不能自定义)
    └── checklist.md      ← 质量检查清单(P0 / P1 / P2 / P3 分级)
```

## 主题色预设

从 `references/themes.md` 里选一套——**不允许自定义 hex 值**,保护美学比给自由更重要。

| 主题 | 适合场景 |
|------|---------|
| 🖋 墨水经典 | 通用默认、商业发布、不知道选啥 |
| 🌊 靛蓝瓷 | 科技 / 研究 / AI / 技术发布会 |
| 🌿 森林墨 | 自然 / 可持续 / 文化 / 非虚构 |
| 🍂 牛皮纸 | 怀旧 / 人文 / 文学 / 独立杂志 |
| 🌙 沙丘 | 艺术 / 设计 / 创意 / 画廊 |

切换主题只需替换 `template.html` 开头 `:root{}` 里的 6 行变量,其他 CSS 全走 `var(--...)`。

## 核心设计原则

1. **克制优于炫技** — WebGL 背景只在 hero 页透出
2. **结构优于装饰** — 信息靠字号 + 字体对比 + 网格留白,不用阴影和浮动卡片
3. **图片是第一公民** — 只裁底部,顶部和左右完整
4. **节奏靠 hero 页** — hero / non-hero 交替,才不累眼睛
5. **术语统一** — Skills 就是 Skills,不中英混译

## 视觉参考

- [*Monocle*](https://monocle.com) 杂志的版式
- YC Garry Tan "Thin Harness, Fat Skills"
- 歸藏线下分享 PPT 系列

## 贡献

Bug、排版问题、新布局需求——欢迎开 Issue 或 PR。改动请优先:

- 在 `template.html` 里补类,不要让 layouts.md 使用未定义的类
- 把踩过的坑写到 `checklist.md` 对应的 P0 / P1 / P2 / P3 级别
- 新主题色进 `themes.md` 并给出适合的场景

## License

MIT © 2026 [op7418](https://github.com/op7418)

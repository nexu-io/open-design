# xDesign fork

`zgar-limited/open-design` 对上游 `nexu-io/open-design`（Open Design）的企业内部 fork。本 context 只记录 **fork 工程策略** 的术语；Open Design 产品本身的领域模型见仓库根 `CONTEXT.md`。

我们刻意不新建根 `CONTEXT-MAP.md`，以免改动上游根目录、增加 merge 面；本文件自解释并指向产品 context。

## Language

### Fork 与同步

**Upstream（上游）**:
原始仓库 `nexu-io/open-design`，所有 fix 与 feature 的源头。我们通过名为 `upstream` 的 git remote 跟踪它。
_Avoid_: origin（指我们自己的 fork）, source repo

**Fork（派生）**:
我们的仓库 `zgar-limited/open-design`，承载 xDesign 的全部定制。
_Avoid_: clone, copy

**Light fork（轻派生）**:
当前范围约定：只替换品牌、企业配置、模型接入、更新源、加飞书准入闸门，不改 core 产品逻辑。重度 core 改动留待未来单独评估、单独定 merge 策略。
_Avoid_: 重 fork / heavy fork（目前不适用）

**Sync window（同步窗口）**:
一次有计划地 merge 上游已发布 tag 的运维动作，频率约每 1–2 个上游 release 一次；区别于随手 merge main。
_Avoid_: rebase（我们不用）, continuous sync

**Overlay（覆盖层）**:
xDesign 定制的承载方式——所有定制落在隔离层（私有目录 + build-time 注入脚本 + 扩展点 + 专属文档目录），上游源原样保留，使 `git merge upstream` 近乎无痛。
_Avoid_: patch, modification, diff

**Upstreamable（可上游化）**:
非企业专有、上游也受益的通用改造（如把散落的 app identity 收敛到单一 config）——争取提 PR 给上游；与企业专有的私有 patch 相对。
_Avoid_: generic fix（口语）

### 身份（两个不同的「身份」）

**App identity（应用身份）**:
应用**自身**的标识——显示名（PRODUCT_NAME，"Open Design"→"xDesign"）、appId、channel、安装器名、窗口标题、图标。构建时定，目前散落在 `packages/release` descriptors + `tools/pack` constants + 运行时字面量。
_Avoid_: brand（口语，本 glossary 用 app identity 精确化）

**User identity / 认证（用户身份）**:
**谁在使用**——飞书登录校验的身份。与 app identity 是两件不同的事；「身份」一词歧义时必须指明是哪个。
_Avoid_: 把「登录」和「应用改名」混为一谈

**Admission gate（准入闸门）**:
packaged app 启动入口的飞书 OAuth 校验——通过才 boot 主 app，未登录/未通过则挡住。**app 级**，不引入 daemon per-request 用户身份。
_Avoid_: SSO（暗示完整认证层，我们没有）, auth middleware（暗示 per-request）

### 易混淆

**Design system（设计系统，目录 `design-systems/`）**:
用户**生成内容**的视觉风格参考（选 stripe → 影响生成的设计），**不是** app 自身的品牌外观。换 app logo 不走这里。
_Avoid_: 把 `design-systems/` 当成 app 品牌资源（错误）

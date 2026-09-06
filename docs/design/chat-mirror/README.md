# 执行记录 · 镜像陈列页

`build-matrix.mjs` 抽的是**设计稿自己的实体**,`mirror-exec.html` 用的是**我们的组件**。
编号一致(唯一出处是 `build-matrix.mjs` 里的 `ORDER`),两页并排开着就能逐格对 ——
这是「对齐了没有」目前唯一能被人判断的地方。

覆盖范围:交付稿 **90 格**,其中 **89 格出了实体**。

| 家族 | 格 | 组件 |
|---|---|---|
| 执行记录 | 1–11 | 7 / 9 / 10 / 11 / 12 |
| 理解段 | 12–27 | 3 / 4 / 5 / 8 |
| 产出收尾 | 28–44 | 13 / 14 / 15 / 16 / 24 |
| 输入 | 45–69 | 1 / 2 / 21 / 23 |
| 边界 | 70–84 | 6 / 17 / 18 / 19 / 20 / 22 |
| 稿子新增 | 85–90 | 1 / 5 |

**唯一没出实体的一格**是第 70 格(Plan 卡展开态)—— 那是**拍板不做**(D33 / S9),
出格是为了让「不做」这件事留痕,不是没做完。

**第 85–90 格排在最后而不是插回各自家族**:`diff-cells.mjs` 按 `.cell` 的下标配 gid,
插回中间会让后面每一格整体错位,连带所有注记里的「第 N 格」全部指错。

> 早先这里写着「84 格里的 79 格」「没上页的五格 47 / 49 / 50 / 54 / 55」——
> 那五格(hover 无差异、发送失败态、附件失败与 hover 预览)后来都补齐了,那句话是旧话。

各族性质不同,别拿同一把尺子看:执行记录、暂停、重连是这次新建的;**意图澄清 / 记忆卡 /
总结文案 / 产物卡 / 回合状态行 / 下一步引导 / Queue** 产品里早就有生产实现,页面上挂的就是那些
现成组件 —— 那些格照出来的是「现有实现离稿子有多远」。
它们的样式大多不在 chat 的接缝里(`.qf-*` 住在 `styles/viewer/composio.css`、产物卡在
`styles/viewer/tools.css`、回合状态行分在 `composio.css` 与 `theater.css` 两处且**有覆盖关系**),
生成器按 `index.css` 的导入顺序把用得上的规则挑出来内联,别整张 94KB 塞进去。

## 怎么重建

```bash
# ① 我们这一侧(每一格都重新走一遍真实事件流)
OD_WRITE_MIRROR="$PWD/docs/design/chat-mirror/mirror-exec.html" \
  pnpm --filter @open-design/web exec vitest run \
  -c vitest.config.ts tests/components/chat/mirror-gallery.test.tsx

# ② 稿子那一侧 —— 稿子的版本**写死在脚本里**(DRAFT_COMMIT),不靠「我起的那个服务是新的」
node docs/design/chat-mirror/build-matrix.mjs --out /tmp/od-serve/chat-matrix/matrix.html
cp docs/design/chat-mirror/mirror-exec.html /tmp/od-serve/chat-mirror/

# ③ 逐格量(两页要同源同域,外链样式才加载得到)
cd /tmp/od-serve && python3 -m http.server 17699 --bind 127.0.0.1 &
DIFF_BASE=http://127.0.0.1:17699 node docs/design/chat-mirror/diff-cells.mjs 1 90 > diff.json
```

`diff-cells.mjs` 的几个开关(默认值就是推荐值,改之前先读它文件里对应那段注释):
`DIFF_NUMWILD=0` 关掉配对时的数字通配(关了以后带数字的元素会整批掉进 onlyDesign / onlyOurs)、
`DIFF_FREEZE=0` 不冻结 CSS 动画(不冻的话读数每跑一次都不一样)、
`DIFF_MATRIX=<路径>` 换矩阵页的位置、`DIFF_NEUTRALIZE=<css>` 量之前额外注一段样式、
`DIFF_WALKS=1` 打印两边完整的元素走法。

**它每趟都会先打印两句读数的前提** ——「稿子选择器 N 条(来自 …)」和「配对判据:数字已通配」。
第一句是从**正在量的那张矩阵页**上扫出来的,不是另外去找一份稿子:曾经它去 fetch
`/chat-panel-next.html`,换个服务目录就静默 404,滤网整个空掉,属性差从 207 掉到 153
—— 看起来像修好了。现在扫不到就当场报错,少于 500 条也当场报错。

`diff.json` 里有五列,别只看一列:`diffs`(稿子写过的属性对不上)、`rawDiffs`(不过滤网的
字号 / 字重 / 行高 / 颜色,专抓「两边都没人亲自写过」的那批)、`geom`(落点与尺寸)、
`texts`(配上了但原文不一样 —— 数字通配放过去的那批在这儿念出来)、
`onlyDesign` / `onlyOurs`(结构上多出来 / 少掉的元素)。

```bash
# 逐格截图(需要先起个静态服)
cd docs/design && python3 -m http.server 8791 --bind 127.0.0.1 &
node docs/design/chat-mirror/shoot.mjs        # → shots/cell-01.png … full.png

# 只拍格子里的实体(出不来的格连同说明一起拍),序号是页面顺序不是格号
MIRROR_PICK=".stage, .gap" MIRROR_NO_FULL=1 node docs/design/chat-mirror/shoot.mjs
```

页面自包含,双击即可打开;截图脚本走无头 Chrome 的 CDP(本仓库不装 playwright)。

落点由命令给、不写死在测试里:合并闸的 web 车道会跑那个文件,而 `docs/` 是 certain-exempt 面 ——
源码里出现这条路径,等于让一次纯文档改动去影响一条本该被跳过的车道。

## 三条自律

1. 每一格的数据都从 `buildTurnBlocks` 走一遍真实事件流,**不手捏组件 props**。
   手捏就成了「照着稿子摆一遍」,证明不了产线上真的长这样。
2. 我们做不到的格子照样出格,写清楚**为什么做不到** —— 卡在**行为**、**数据 / 契约**、
   **产品裁决**,还是**这一页本身够不着**(静态标记没有布局、没有 React state、渲染不了 portal)。
   不留空、不拿近似糊过去,也**不为了让某一格好看去改组件**(这一轮对组件只加了三个 `export`)。
3. 待设计确认的地方逐格标在格子下面,不混进已对齐的格子。

## 三处刻意的不同

- **替设计师点开**:稿子里的实体本身就是「点开之后」的样子(7-2 的状态名写着「点开只摊一级」),
  收着没法比。产线上跑完是默认收起的(D18),摊开只发生在这一页。
- **类名摘掉了哈希**:页面内联的是 CSS Module 的**源文件**,所以把 `_fold_09d9ab` 还原成 `fold`。
  顺带的好处是设计师看到的 `class="fold flat"` 能直接和稿子里的 `fold mod-flat` 对上。
- **名字太大路的 module 要关进笼子**:摘掉哈希之后 `NextStepActions.module.css` 的 `.root`
  正好和每一格外面那层 `<div class="root">`(ChatRoot 的接缝,负责 `--chat-*` 变量)撞名,
  撞上之后**每一格**都会套上一圈下一步引导的边框和渐变底。所以这类 module 走 `scope()`
  加一层笼子选择器(`UserActionCard.module.css` 的 `.card` / `.title` / `.icon` 同理)。

## 挂的过程中照出来的实现缺陷 —— 三条**都已经修好了**

建页那一轮页面本身是只读的(只允许给组件加 `export`),所以下面三条当时都只写进注记、
没有顺手改。**它们后来都由各自的 PR 修掉了**,这里保留下来只作为线索的出处:

- **第 34 格**:稿子右端那个 `14:32` 在最常见的路径上根本不出 —— `createdAt` 只传给了
  「没有反馈按钮」的那条分支。✅ 现在两条分支都传了。
  连带那条「就算补上也贴不到右端」:`.assistant-feedback-wrap` 原来是 `inline-flex` +
  `max-width: min(360px,100%)`,整行缩成 220.6px、弹簧撑不开。✅ 现在是 `flex` +
  `width: 100%`(下面那块原因面板改成自己限宽),`footer-time.test.tsx` 钉着。
- **第 39 格**:中断的一轮照出来是绿勾 + 绿字 —— 换勾那条规则只排除了 `data-streaming` /
  `data-unfinished`,没排除 `canceled`。✅ 现在也排除了 `data-canceled`,中断档是
  灰点 + `--text-muted`。
- **第 72–74 格**:`.chat-queued-send-row` 的 `grid-template-columns` 只有三条轨道,
  而补上行首序号之后这一行有四个孩子。✅ 现在整行是 `display: flex`,和稿子
  `.queue .q` 同一套排版模型,行高也回到 34。

> ⚠️ 这一段**每次修完都要跟着改**。上一次它整整过期了一轮:三条早就修好,页面和 README
> 还在照旧印,给验收的人看的是三个不存在的缺陷。同理还有测试文件里那些硬编码注记 ——
> 页面重跑照样把旧话印出来,它们不会自己过期。

## 这把尺子自己的两条守卫

页面是**挑着内联**样式的(`pick()`),而漏挑一族的后果不是「少了点样式」,是那一格的元素
退回浏览器默认值 —— 逐格比对会把整条规则的每个属性都报成「实现没对上」,长得和真差异一模一样。
第 38 格那条分界的五个值就这么被当成实现缺陷读了很久。所以:

1. **漏内联对账**:生成页面时逐格核对「这一格里真的有元素命中、却没被内联进来的选择器」,
   有就**明写在那一格的注记里**(`⚠️ 这一格有 N 条规则没内联进来,读数不可信`),
   同时在生成日志里喊一声;`mirror-gallery.test.tsx` 还有一条断言钉住它必须为空。
2. **重写产品逻辑的地方立了清单**:静态页没有 React,画球那段是把 `Orb.tsx` 的 effect
   重写了一遍 —— 它曾经把 DOM 上的 `data-orb-box` 丢了,壳头那颗 24px 的球被画成 20,
   于是壳头高度 36 → 32,报成「壳头比稿子矮」。这类地方现在逐条列在页面脚本的开头,
   加第五处之前先想清楚能不能不加。

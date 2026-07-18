import type { DeepPartial, CommunityCopy } from '../community-i18n';

const zh: DeepPartial<CommunityCopy> = {
  hub: {
    title: '社区 — Open Design',
    desc: 'Open Design 社区：在公开场合交付作品的贡献者、在本地主理工坊的大使，以及让 Discord 始终热络的版主。',
    heroTitle: '开放的设计，<em>在你交付时</em><br/>才真正成形。',
    heroLead:
      'Open Design 由人构建，在公开场合完成。Skills、DESIGN.md 系统、插件、文档：每一次提交都是一笔。选下面的一扇门，找到属于你的房间。',
    cardMetaH: '首次合并时自动铸造',
    cardMetaS: 'PNG · 分享到 X',
    cardHeroAlt:
      'Open Design 贡献者荣誉卡 — @dev-kp-eloper，前 99.9%，Giotto 级',
    cards: [
      {
        ord: 'I',
        title: '贡献者',
        sub: '<em>交付</em>作品的那双手。',
        body: '维护者、每周榜单、历史总榜，以及你今天就能认领的开放 issue。还有一条零代码路径，让不写代码的人也能把第一件作品送进注册表。',
      },
      {
        ord: 'II',
        title: '大使',
        sub: 'Open Design 在你城市里的<em>声音</em>。',
        body: '开设一间本地工坊。召集聚会、演示、深夜评图。我们以预算、物料，以及一条直通核心团队的私密通道作为后盾。',
      },
      {
        ord: 'III',
        title: '版主',
        sub: '<em>贡献者</em>聚在一起的那间屋子。',
        body: 'agent 设计时代的最前线。Discord 是全世界最敏锐的 AI 原生设计师聚集之地。来认识让这间屋子始终温暖的守护者。',
      },
    ],
  },
  contributors: {
    title: '贡献者 — Open Design',
    desc: '为 Open Design 做贡献：维护者、每周与历史贡献者榜单、good first issue，以及一条交付第一件作品的零代码路径。',
    heroTitle: '<em>交付</em>作品的那双手。',
    heroLead:
      'Open Design 由人构建，在公开场合完成。Skills、DESIGN.md 系统、插件、文档：每一次提交都是一笔。挑一个 issue，发一个 PR，合并的那一刻，就赢得一张独一无二的荣誉卡。',
    showcase: {
      kicker: '万物皆可插件',
      h2: 'Open Design 是舞台。<em>你的作品</em>是演出。',
      intro:
        '这间工坊也是一座画廊。帮你把作品做出来只是一半；让这间屋子里的人来看，才是另一半。你交付的每一件作品，落脚的不是保险柜，而是一面墙，让全世界都能找到它。',
      tenets: [
        {
          h3: '任何东西<em>都能成为插件</em>。',
          body: '工作室里产出的一切（内容、成品、模板、Skill、工作流）都能折回成一个插件。注册表接纳任何形态；这扇门不设守门人。',
        },
        {
          h3: '你的处女作，就是你的<em>入会礼</em>。',
          body: '你的第一件作品落入注册表的那天，你的名字就加入了这面墙。不是一枚访客徽章，而是贡献者名单上一行永久的记录，与所有先你而来的人并列。',
        },
        {
          h3: '一旦进来，<em>它就会远行</em>。',
          body: '位于 <a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">open-design.ai/plugins</a> 的注册表只是门槛。从那里出发，最出色的作品会被向外带出：带到 X，带到 Discord 的 <span class="num">#showcase</span>，带到 newsletter，带到视频合集。每一次传递都让这间屋子更大；全世界与你的手相遇。',
        },
        {
          h3: '需要<em>第一笔</em>吗？',
          body: '去逛逛<a href="https://open-design.ai/plugins/" target="_blank" rel="noopener">插件注册表</a>。挂在那里的作品，是你自己作品的火种。借来那点火花，再做一件只有你的手才能做出的作品。',
        },
      ],
      pane: {
        kicker: '这个 skill',
        h3: '让 <em>agent</em> 替你交付。',
        lede: '献给那些不愿碰代码的创作者。整个贡献过程都住在一个 skill 里，用大白话说出来。落笔的事，交给 agent。',
        copy: '复制',
        copied: '已复制',
        steps: [
          {
            h4: '把这行交给 agent',
            body: '把上面这条命令粘贴进 Open Design 里的 agent，或粘进你手边惯用的那个：Claude Code、Codex、Cursor。它会自行安装。',
          },
          {
            h4: '唤醒这个 skill',
            body: '输入 <code>/od-contribute</code>，或者直接让 agent 运行你刚装好的东西。任一句话都能打开这扇门。',
          },
          {
            h4: '半分钟直达画廊',
            body: '剩下的路由 agent 走完。你的作品大约三十秒后就会被送往开源仓库；我们会尽快审阅，落地的那一刻，这间屋子便与你的手相遇。',
          },
        ],
      },
    },
    maintainers: {
      kicker: '掌舵',
      h2: '这些<em>维护者</em>。',
      intro:
        '维护者守护 Open Design 的方向与质量：他们审阅贡献，让标准保持一致，并为更多贡献者腾出空间、赢得自己在项目里的位置。',
      role: '维护者',
      bios: {
        'Nagendhra-web':
          'Nagendhra 带着数据工程师对生产真相的本能：找到故障、量化边界情况、把它彻底修好。在 Open Design 里，这体现为部署预检工作、资产打包的加固，以及那些让贡献者交付时对项目更放心的 Windows 修复。',
        'Sid-Qin':
          'Sid 是一位有着设计师般细节眼光的全能工程师：既会注意到断掉的 CLI 路径，也会留意到歪掉的交互细节。在 Open Design 里，Sid 让导出流程、插件动作、Windows 垫片、MIME 处理和 agent 管道保持足够锋利，让一整个社区可以在其上构建。',
      },
    },
    allTime: {
      kicker: '历史信号',
      h2: '扎根<em>最深</em>的贡献者。',
      intro:
        '一份长期累积的记录，记下那些不断把想法、修复与匠心，化为 Open Design 共享标准的杰出贡献者。',
      rankLabel: '历史贡献者',
      week: '仓库历史',
      quote:
        '长尾至关重要：设计系统、文档修复、示例和小修补，正是一门开放设计语言变得可靠的方式。',
      handleSuffix: '· 深度贡献信号',
      statCommits: '提交',
      statExternalRank: '外部排名',
      headContributor: '贡献者',
      headCommits: '提交',
      headRank: '排名',
    },
    weekly: {
      kicker: '本周信号',
      h2: '<em>本周</em>领跑的十位贡献者。',
      intro:
        '一份快照，记录那些敏锐的贡献者：他们合入 PR、改进产品，让 Open Design 充满生气。',
      rankLabel: '本周领跑者',
      week: '最近 7 天',
      handleSuffix: '· 本周领跑',
      blurbTemplate:
        '{name} 本周以 {prs} 个已合并的 PR 定下节奏，那份稳定的匠心让 Open Design 持续向前。',
      statRank: '排名',
      statPrs: 'PR · 7 天',
      headContributor: '贡献者',
      headPrs: 'PR',
      headRank: '排名',
    },
    issues: {
      kicker: '挑选你的第一次贡献',
      h2: '开放的 issue，<em>为你标记</em>。',
      intro:
        '实时来自 Open Design 仓库上 <span class="num">label:&ldquo;good first issue&rdquo;</span> 的标签。在某个 issue 下留言即可认领，维护者会在一天内把它分配给你。',
      loading: 'good first issue',
      foot: '显示前 <span class="num" id="issue-count">—</span> 个开放的 good-first-issue',
      seeAll: '在 GitHub 上查看全部',
      empty: '目前没有开放的 good-first-issue。明天再来看看，或者你自己开一个',
      rateLimited:
        '预览中已触及 GitHub 速率限制。请在 GitHub 上打开实时的 good-first-issue 搜索。',
    },
    onboard: {
      kicker: '四步 · 不限水平',
      h2: '一个下午，从零到<em>合并</em>。',
      intro:
        '无论你是设计师、写作者、工程师，还是只是刚好发现了一个拼写错误的人，总有一种适合你的贡献形态。这就是那条路。',
      steps: [
        {
          n: '步骤 01',
          h3: '找到一个<em>火花</em>。',
          body: '浏览上面的 good-first-issue 列表，或者开一个新 issue，描述你想改进的东西。设计师：DESIGN.md 系统是最容易的入口。',
        },
        {
          n: '步骤 02',
          h3: '开一个<em>草稿</em> PR。',
          body: 'Fork、开分支、push。标为草稿，表示你想早点得到反馈。写清它关闭的是哪个 issue。CI 很快；bot-cards 留在它自己的分支上。',
        },
        {
          n: '步骤 03',
          h3: '与<em>真人</em>一起审阅。',
          body: '维护者会在 24 小时内审阅。我们友善、具体，从不当守门人。如果你卡住了，把 PR 链接丢进 Discord 的 #help。',
        },
        {
          n: '步骤 04',
          h3: '合并 → <em>卡片</em>。',
          body: '合并的那一刻，bot 会为你铸造荣誉卡，并推送到 bot-cards 分支。带上 #OpenDesign 分享到 X，我们会转发其中最出色的。',
        },
      ],
      cta: '阅读贡献指南',
    },
  },
  ambassadors: {
    title: '大使 — Open Design',
    desc: '成为 Open Design 大使：开设一间本地工坊，主持聚会与评图，并获得预算、物料，以及一条直通核心团队的私密通道。',
    heroTitle: '成为 Open Design 在你城市里的<em>声音</em>。',
    heroLead:
      '开设一间本地工坊。召集聚会、演示、深夜评图。我们以预算、物料，以及一条直通核心团队的私密通道作为你的后盾。',
    program: {
      kicker: '这个项目',
      h2: '志业、<em>赞助</em>、契约。',
      applyCta: '通过 Google 表单申请',
      applyNote:
        '大使让 Open Design 从一个仓库，变成贡献者能在同一间屋子里相遇的东西——桌上有墨，咖啡已凉。',
      cols: [
        {
          n: 'I · 志业',
          h3: '<em>本地场景</em>的绘制者。',
          lede: '设计师、开发者、组织者：那种本就能把别人聚起来的人。我们给这场聚集一面旗。',
          items: [
            '<b>本地工坊主理人：</b>你让一场经常性的聚会、学习小组或深夜黑客活动持续下去。',
            '<b>线上社区负责人：</b>Discord、微信、Telegram、X spaces。',
            '<b>在实践中的贡献者或布道者：</b>已经在交付作品、发布匠心、引领新人。',
            '<b>能自在地扛起这个名字：</b>受行为准则约束，用心维护品牌。',
          ],
        },
        {
          n: 'II · 赞助',
          h3: '<em>工坊</em>所给予的。',
          lede: '不是一枚志愿者徽章。是一份实实在在的联结，带着预算、身份与访问权限。',
          items: [
            '<b>站点上的一个页面：</b>肖像、城市、简介、社交账号，以及你活动的编年史。',
            '<b>先睹为快：</b>Beta 功能、内部路线图预览、抢在队列前面的发布。',
            '<b>工坊套件：</b>海报、幻灯片、演示作品、周边；一笔用于场地、饮品和摄影的经费。',
            '<b>一条通往工作室的线：</b>私密通道、每月同步，以及一条专属于你反馈的通路。',
            '<b>一条向前的路：</b>荣誉卡与等级，以及通往区域负责人、讲者或带薪社区岗位的路径。',
          ],
        },
        {
          n: 'III · 契约',
          h3: '工作室的<em>纪律</em>。',
          lede: '一份不重、却有约束力的承诺。长期缺席将并入荣休状态；这个圈子保持小而认真。',
          items: [
            '<b>召集</b>每月或每季度至少一场活动，线下或线上皆可。',
            '<b>欢迎新手。</b>引领新人完成他们的第一次贡献。',
            '<b>用心倾听。</b>从用户、设计师、开发者、团队那里收集真诚的反馈。',
            '<b>留下记录。</b>每场聚会后发布一份回顾：出席、照片、链接、线索。',
            '<b>好好扛起这个名字。</b>恪守行为准则；不滥用标识，不以工作室名义签署任何协议。',
          ],
        },
      ],
    },
    roster: {
      kicker: '在一线',
      h2: '认识这些<em>大使</em>。',
      intro:
        '本地组织者、创作者和社区建设者，帮助 Open Design 触及更多设计师与团队。',
      places: [
        '澳大利亚，阳光海岸',
        '马来西亚，吉隆坡',
        '日本',
        '中国',
      ],
    },
  },
  moderators: {
    title: '版主 — Open Design',
    desc: '认识 Open Design 的 Discord 版主，加入这间屋子——AI 原生设计师在这里交付作品、开放插件、试破 Beta，并把彼此从卡点里拉出来。',
    heroTitle: '<em>贡献者</em>聚在一起的那间屋子。',
    heroLead:
      'agent 设计时代的最前线在这里展开。Discord 是全世界最敏锐的 AI 原生设计师聚集之地。来认识让这间屋子始终温暖的守护者。',
    discord: {
      kicker: '贡献者聚在一起的地方',
      h2: '和那些将<em>审阅你 PR</em> 的人聊聊。',
      body: 'agent 设计时代的最前线在这里展开。我们的 Discord 是全世界最敏锐的 AI 原生设计师聚集之地：交付作品、开放插件、试破 Beta、把彼此从卡点里拉出来。走进来。带上你正在做的东西。',
      joinCta: '加入 Discord',
      discussionsCta: 'GitHub Discussions',
      cards: [
        {
          role: '来自工作室',
          bio: '来自 Open Design 创始团队。希望 Discord 一直是个待着舒服的地方。任何时候、任何问题，尽管打招呼。',
        },
        {
          role: '这间屋子的守护者',
          bio: '一位在 Discord 和社区照料上经验老到的人。让屋子温暖、门常开、对话流动。对 Open Design 充满热情。',
        },
      ],
      channelNotes: ['已交付的作品', '构建者', '早期反馈', '解开卡点'],
    },
  },
};

export default zh;

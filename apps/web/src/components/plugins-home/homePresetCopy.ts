interface HomePresetCopy {
  title: string;
  prompt: string;
}

// Home recommendations describe the user's intended result. Template details
// keep their original names and technical descriptions from the manifest.
const HOME_PRESET_COPY: Record<string, Partial<Record<string, HomePresetCopy>>> = {
  'example-pm-spec': {
    'zh-CN': {
      title: '产品规格文档',
      prompt: '为一款帮助远程团队安排跨时区会议的工具撰写产品规格文档，包含用户需求、核心功能、使用流程和验收标准。',
    },
    'zh-TW': {
      title: '產品規格文件',
      prompt: '為一款協助遠端團隊安排跨時區會議的工具撰寫產品規格文件，包含使用者需求、核心功能、使用流程和驗收標準。',
    },
    en: {
      title: 'Product Specification',
      prompt: 'Write a product specification for a tool that helps remote teams schedule meetings across time zones, covering user needs, core features, user flows, and acceptance criteria.',
    },
  },
  'example-finance-report': {
    'zh-CN': {
      title: '财务报告',
      prompt: '制作一家虚构咖啡品牌的季度财务报告，用合理的示例数据展示收入、成本、利润和现金流，并分析经营表现。注明数据仅供示例。',
    },
    'zh-TW': {
      title: '財務報告',
      prompt: '製作一家虛構咖啡品牌的季度財務報告，用合理的範例數據呈現收入、成本、利潤和現金流，並分析經營表現。註明數據僅供示例。',
    },
    en: {
      title: 'Financial Report',
      prompt: 'Create a quarterly financial report for a fictional coffee brand, using plausible sample data to show revenue, costs, profit, and cash flow and analyze business performance. Label the data as illustrative.',
    },
  },
  'example-clinical-case-report': {
    'zh-CN': {
      title: '临床病例报告',
      prompt: '编写一份用于教学的虚构社区获得性肺炎病例报告，包含主诉、病史、检查结果、诊断依据、诊疗经过和随访情况。注明为虚构教学病例。',
    },
    'zh-TW': {
      title: '臨床病例報告',
      prompt: '編寫一份用於教學的虛構社區型肺炎病例報告，包含主訴、病史、檢查結果、診斷依據、診療經過和追蹤情況。註明為虛構教學病例。',
    },
    en: {
      title: 'Clinical Case Report',
      prompt: 'Write a fictional case report about community-acquired pneumonia for teaching, including the chief complaint, medical history, examination findings, diagnostic reasoning, clinical course, and follow-up. Label it as a fictional teaching case.',
    },
  },
  'example-resume-modern': {
    'zh-CN': {
      title: '极简简历',
      prompt: '为一位有三年工作经验的虚构产品设计师制作一页式极简简历，包含个人简介、专业技能、工作经历和代表项目。使用完整的虚构信息，并注明为示例简历。',
    },
    'zh-TW': {
      title: '極簡履歷',
      prompt: '為一位有三年工作經驗的虛構產品設計師製作一頁式極簡履歷，包含個人簡介、專業技能、工作經歷和代表專案。使用完整的虛構資訊，並註明為範例履歷。',
    },
    en: {
      title: 'Minimal Resume',
      prompt: 'Create a minimal one-page resume for a fictional product designer with three years of experience, including a profile, skills, work history, and selected projects. Fill in all details with fictional information and label it as a sample resume.',
    },
  },
  'example-invoice': {
    'zh-CN': {
      title: '发票',
      prompt: '为一家虚构设计工作室制作品牌设计服务发票，填入完整的示例客户信息、服务项目、费用明细和付款说明。注明为示例发票。',
    },
    'zh-TW': {
      title: '發票',
      prompt: '為一家虛構設計工作室製作品牌設計服務發票，填入完整的範例客戶資訊、服務項目、費用明細和付款說明。註明為範例發票。',
    },
    en: {
      title: 'Invoice',
      prompt: 'Create an invoice for branding services from a fictional design studio, filling in complete sample client details, services, itemized fees, and payment instructions. Label it as a sample invoice.',
    },
  },
  'image-template-vr-headset-exploded-view-poster': {
    'zh-CN': {
      title: 'VR 头显拆解海报',
      prompt: '为一款名为 NOVA VR 的概念头显制作拆解海报，用悬浮分层展示外壳、镜片、显示屏和传感器，并配上组件标注与简短的产品文案。',
    },
    'zh-TW': {
      title: 'VR 頭戴裝置拆解海報',
      prompt: '為一款名為 NOVA VR 的概念頭戴裝置製作拆解海報，用懸浮分層呈現外殼、鏡片、顯示螢幕和感測器，並配上組件標註與簡短的產品文案。',
    },
    en: {
      title: 'VR Headset Exploded View Poster',
      prompt: 'Create an exploded-view poster for a concept headset called NOVA VR, showing the shell, lenses, displays, and sensors in floating layers with component labels and short product copy.',
    },
  },
  'image-template-social-media-post-psg-transfer-announcement-poster': {
    'zh-CN': {
      title: '球员转会官宣海报',
      prompt: '设计一张虚构球员 Lucas Moreau 加盟巴黎圣日耳曼的概念转会海报，使用红蓝配色、球员肖像和醒目的 WELCOME LUCAS 标题，并在角落标注球迷概念设计。',
    },
    'zh-TW': {
      title: '球員轉會官宣海報',
      prompt: '設計一張虛構球員 Lucas Moreau 加盟巴黎聖日耳曼的概念轉會海報，使用紅藍配色、球員肖像和醒目的 WELCOME LUCAS 標題，並在角落標註球迷概念設計。',
    },
    en: {
      title: 'Player Transfer Announcement',
      prompt: 'Design a concept transfer poster for fictional player Lucas Moreau joining Paris Saint-Germain, with red and blue colors, a player portrait, and a bold WELCOME LUCAS headline. Add a small fan concept label in a corner.',
    },
  },
  'image-template-social-media-post-vintage-sign-painter-sketch': {
    'zh-CN': {
      title: '复古手绘字海报',
      prompt: '把 SLOW MORNINGS 设计成复古咖啡馆招牌风的手绘字海报，搭配咖啡杯小插画，保留奶油色纸张纹理、铅笔底稿和马克笔笔触。',
    },
    'zh-TW': {
      title: '復古手繪字海報',
      prompt: '把 SLOW MORNINGS 設計成復古咖啡館招牌風的手繪字海報，搭配咖啡杯小插畫，保留奶油色紙張紋理、鉛筆底稿和麥克筆筆觸。',
    },
    en: {
      title: 'Vintage Hand-Lettered Poster',
      prompt: 'Turn SLOW MORNINGS into a hand-lettered poster inspired by vintage cafe signs, with a small coffee cup illustration, cream paper texture, pencil guidelines, and visible marker strokes.',
    },
  },
  'image-template-profile-avatar-cyberpunk-anime-portrait-with-neon-face-text': {
    'zh-CN': {
      title: '赛博朋克动漫头像',
      prompt: '创作一张银色短发、佩戴耳机的原创动漫角色头像，用蓝紫霓虹光照亮面部，将 DREAM IN NEON 字样融入脸部光影，背景是虚化的未来城市夜景。',
    },
    'zh-TW': {
      title: '賽博龐克動漫頭像',
      prompt: '創作一張銀色短髮、佩戴耳機的原創動漫角色頭像，用藍紫霓虹光照亮面部，將 DREAM IN NEON 字樣融入臉部光影，背景是虛化的未來城市夜景。',
    },
    en: {
      title: 'Cyberpunk Anime Avatar',
      prompt: 'Create an avatar of an original anime character with short silver hair and headphones, using blue and violet neon light across the face. Blend DREAM IN NEON lettering into the facial lighting against a blurred futuristic city at night.',
    },
  },
  'image-template-profile-avatar-monochrome-studio-portrait': {
    'zh-CN': {
      title: '黑白棚拍肖像',
      prompt: '生成一张虚构年轻创意工作者的黑白棚拍肖像，人物穿黑色高领上衣、神态自然，以深浅分割背景和侧面柔光突出面部轮廓，保留真实皮肤质感。',
    },
    'zh-TW': {
      title: '黑白棚拍肖像',
      prompt: '生成一張虛構年輕創意工作者的黑白棚拍肖像，人物穿黑色高領上衣、神態自然，以深淺分割背景和側面柔光突出面部輪廓，保留真實皮膚質感。',
    },
    en: {
      title: 'Black and White Studio Portrait',
      prompt: 'Generate a black and white studio portrait of a fictional young creative professional in a black turtleneck with a relaxed expression. Use a split light-and-dark background and soft side lighting to define the face, preserving natural skin texture.',
    },
  },
  'example-fs-creative-voltage': {
    'zh-CN': {
      title: '种子轮融资路演',
      prompt: '为我的创业项目制作一份融资路演，讲清市场机会、产品优势、业务进展和融资计划。',
    },
    'zh-TW': {
      title: '種子輪融資簡報',
      prompt: '為我的創業專案製作一份融資簡報，講清市場機會、產品優勢、業務進展和融資計畫。',
    },
    en: {
      title: 'Seed Funding Pitch',
      prompt: 'Create a pitch deck for my startup that explains the market opportunity, product advantages, business traction, and fundraising plan.',
    },
  },
  'example-fs-electric-studio': {
    'zh-CN': {
      title: 'B2B 销售提案',
      prompt: '为企业客户制作一份销售提案，围绕客户痛点介绍解决方案、预期收益和实施计划。',
    },
    'zh-TW': {
      title: 'B2B 銷售提案',
      prompt: '為企業客戶製作一份銷售提案，圍繞客戶痛點介紹解決方案、預期效益和實施計畫。',
    },
    en: {
      title: 'B2B Sales Proposal',
      prompt: 'Create a sales proposal for an enterprise customer, addressing their pain points with a solution, expected benefits, and an implementation plan.',
    },
  },
  'example-html-ppt-zhangzara-block-frame': {
    'zh-CN': {
      title: '董事会汇报',
      prompt: '帮我把现有演示文稿打磨成适合董事会汇报的版本，理清叙事、突出关键证据，并统一视觉风格。',
    },
    'zh-TW': {
      title: '董事會簡報',
      prompt: '幫我把現有簡報打磨成適合董事會報告的版本，理清敘事、突出關鍵證據，並統一視覺風格。',
    },
    en: {
      title: 'Board Presentation',
      prompt: 'Refine my existing presentation for a board meeting by clarifying the narrative, highlighting key evidence, and creating a consistent visual style.',
    },
  },
  'example-fs-notebook-tabs': {
    'zh-CN': {
      title: '毕业设计答辩',
      prompt: '为我的毕业设计制作答辩演示，清楚呈现研究问题、解决方法、成果验证和创新点。',
    },
    'zh-TW': {
      title: '畢業專題口試',
      prompt: '為我的畢業專題製作口試簡報，清楚呈現研究問題、解決方法、成果驗證和創新之處。',
    },
    en: {
      title: 'Capstone Defense',
      prompt: 'Create a defense presentation for my capstone project, clearly presenting the research problem, approach, validation results, and original contributions.',
    },
  },
  'example-guizang-ppt': {
    'zh-CN': {
      title: '品牌增长方案',
      prompt: '制作一份品牌增长方案，讲清目标人群、品牌定位、营销行动和衡量效果的指标。',
    },
    'zh-TW': {
      title: '品牌成長方案',
      prompt: '製作一份品牌成長方案，講清目標受眾、品牌定位、行銷行動和衡量成效的指標。',
    },
    en: {
      title: 'Brand Growth Plan',
      prompt: 'Create a brand growth plan that defines the target audience, brand positioning, marketing actions, and metrics for measuring results.',
    },
  },
  'example-velar-luxury-real-estate': {
    'zh-CN': {
      title: '高端地产展示页',
      prompt: '为一个高端住宅项目设计展示页，用大幅建筑摄影和流畅的滚动动效呈现项目特色。',
    },
    'zh-TW': {
      title: '高端地產展示頁',
      prompt: '為一個高端住宅專案設計展示頁，用大幅建築攝影和流暢的捲動動畫呈現專案特色。',
    },
    en: {
      title: 'Luxury Property Website',
      prompt: 'Design a website for a luxury residential development, showcasing its character through large architectural photos and smooth scroll animations.',
    },
  },
  'example-hr-onboarding': {
    'zh-CN': {
      title: '新员工入职指南',
      prompt: '制作一份新员工入职指南，包含第一周日程、团队介绍、学习任务和设备清单。',
    },
    'zh-TW': {
      title: '新員工入職指南',
      prompt: '製作一份新員工入職指南，包含第一週日程、團隊介紹、學習任務和設備清單。',
    },
    en: {
      title: 'New Hire Onboarding Guide',
      prompt: 'Create a new hire onboarding guide with a first-week schedule, team introductions, learning tasks, and an equipment checklist.',
    },
  },
  'example-pricing-page': {
    'zh-CN': {
      title: '产品定价页',
      prompt: '设计一个产品定价页，清楚对比各套餐的价格与功能，并解答常见购买问题。',
    },
    'zh-TW': {
      title: '產品定價頁',
      prompt: '設計一個產品定價頁，清楚比較各方案的價格與功能，並解答常見購買問題。',
    },
    en: {
      title: 'Product Pricing Page',
      prompt: 'Design a product pricing page that clearly compares plan prices and features and answers common purchase questions.',
    },
  },
  'example-gamified-app': {
    'zh-CN': {
      title: '游戏化习惯应用',
      prompt: '设计一款把每日习惯变成闯关任务的手机应用，用经验值、等级和连续打卡记录成长。',
    },
    'zh-TW': {
      title: '遊戲化習慣應用',
      prompt: '設計一款把每日習慣變成闖關任務的手機應用，用經驗值、等級和連續打卡記錄成長。',
    },
    en: {
      title: 'Gamified Habit App',
      prompt: 'Design a mobile app that turns daily habits into quests, tracking progress with experience points, levels, and daily streaks.',
    },
  },
  'example-open-design-landing': {
    'zh-CN': {
      title: '拼贴风品牌官网',
      prompt: '为我的品牌设计一个杂志拼贴风官网，用醒目的标题、图片拼贴和滚动动效介绍产品。',
    },
    'zh-TW': {
      title: '拼貼風品牌官網',
      prompt: '為我的品牌設計一個雜誌拼貼風官網，用醒目的標題、圖片拼貼和捲動動畫介紹產品。',
    },
    en: {
      title: 'Editorial Collage Brand Website',
      prompt: 'Design a magazine-inspired website for my brand, introducing the product with bold headlines, image collages, and scroll animations.',
    },
  },
};

export function homePresetCopy(pluginId: string, locale: string): HomePresetCopy | undefined {
  return HOME_PRESET_COPY[pluginId]?.[locale];
}

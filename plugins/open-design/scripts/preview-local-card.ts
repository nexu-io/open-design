#!/usr/bin/env node

import { createServer } from 'node:http';

const ARTIFACT_TYPES = [
  'website',
  'product-prototype',
  'presentation',
  'design-system',
  'image',
  'video',
  'audio',
  'document',
] as const;
type ArtifactType = (typeof ARTIFACT_TYPES)[number];
type BriefCase = 'sparse' | 'rich';
type BriefQuestionType = 'radio' | 'checkbox' | 'select' | 'switch' | 'direction-cards';

interface BriefOption {
  label: string;
  value: string;
  description?: string;
}

interface BriefQuestion {
  id: string;
  label: string;
  type: BriefQuestionType;
  options: BriefOption[];
  required: boolean;
  defaultValue: string | string[];
  allowCustom: false;
  maxSelections?: number;
}

interface BriefPreview {
  projectTitle: string;
  knownAnswers: Record<string, string | string[]>;
  questionForm: {
    id: string;
    title: string;
    description: string;
    lang: string;
    submitLabel: string;
    questions: BriefQuestion[];
  };
}

const ARTIFACT_LABELS: Record<ArtifactType, string> = {
  website: 'Website',
  'product-prototype': 'Product prototype',
  presentation: 'Presentation',
  'design-system': 'Design system',
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  document: 'Document',
};

const WIDGET_URI = 'ui://open-design/artifact-card-v10.html';

interface JsonRpcResponse {
  error?: { message?: string };
  result?: Record<string, unknown>;
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value) throw new Error(`${name} requires a value`);
  return value;
}

function isArtifactType(value: string): value is ArtifactType {
  return ARTIFACT_TYPES.some((artifactType) => artifactType === value);
}

function artifactTypeOption(name: string, fallback: ArtifactType): ArtifactType {
  const value = option(name, fallback);
  if (!isArtifactType(value)) throw new Error(`${name} must be one of: ${ARTIFACT_TYPES.join(', ')}`);
  return value;
}

function question(
  id: string,
  label: string,
  choices: Array<[value: string, label: string, description?: string]>,
  type: BriefQuestionType = 'radio',
): BriefQuestion {
  const options = choices.map(([value, optionLabel, description]) => ({
    value,
    label: optionLabel,
    ...(description ? { description } : {}),
  }));
  return {
    id,
    label,
    type,
    options,
    required: true,
    defaultValue: type === 'checkbox' ? [options[0].value] : options[0].value,
    allowCustom: false,
    ...(type === 'checkbox' ? { maxSelections: Math.min(2, options.length) } : {}),
  };
}

function dynamicBriefPreview(artifactType: ArtifactType, briefCase: BriefCase): BriefPreview {
  const label = ARTIFACT_LABELS[artifactType];
  const sparseQuestions: Record<ArtifactType, BriefQuestion[]> = {
    website: [
      question('websiteGoal', '这个网站最需要完成什么？', [['convert', '促进转化'], ['explain', '讲清产品'], ['launch', '支持发布']]),
      question('audience', '首要说服哪类访客？', [['buyers', '潜在客户'], ['developers', '开发者'], ['investors', '投资人']]),
      question('primaryCta', '主要行动应该是什么？', [['start', '立即开始'], ['demo', '预约演示'], ['contact', '联系我们']]),
    ],
    'product-prototype': [
      question('primaryUser', '原型的主要用户是谁？', [['consumer', '普通用户'], ['operator', '运营人员'], ['admin', '管理员']]),
      question('coreFlow', '最需要跑通哪条流程？', [['onboarding', '注册与引导'], ['create', '创建与编辑'], ['checkout', '下单与支付']]),
      question('fidelity', '原型要做到什么精度？', [['concept', '概念验证'], ['testable', '可用性测试'], ['handoff', '接近开发交付']]),
    ],
    presentation: [
      question('audience', '演示文稿的核心受众是谁？', [['investors', '投资人'], ['customers', '客户'], ['leadership', '管理层']]),
      question('narrative', '整份演示需要怎样的故事线？', [['problem-solution', '问题到解法'], ['vision-proof', '愿景到证据'], ['status-decision', '进展到决策']]),
      question('slideCount', '希望保持多长？', [['short', '6–8 页'], ['standard', '10–12 页'], ['deep', '15–20 页']]),
    ],
    'design-system': [
      question('productSurface', '设计系统首先服务哪个产品面？', [['web', 'Web 应用'], ['mobile', '移动应用'], ['cross-platform', '跨端产品']]),
      question('brandPersonality', '品牌个性更接近哪个方向？', [['precise', '精准克制'], ['friendly', '友好亲和'], ['bold', '大胆前卫']]),
      question('componentScope', '第一版要覆盖多深？', [['foundations', '只做基础规则'], ['core', '基础 + 核心组件'], ['full', '完整应用组件']]),
    ],
    image: [
      question('imageUse', '图像将用在哪里？', [['hero', '网站首屏'], ['social', '社交媒体'], ['campaign', '广告活动']]),
      question('heroSubject', '画面的主体应该是什么？', [['product', '产品特写'], ['people', '人物场景'], ['abstract', '抽象概念']]),
      question('visualStyle', '希望哪种视觉语气？', [['editorial', '编辑感'], ['cinematic', '电影感'], ['minimal', '极简感']]),
    ],
    video: [
      question('videoAudience', '视频主要说给谁看？', [['prospects', '潜在客户'], ['users', '现有用户'], ['community', '社区受众']]),
      question('sceneArc', '视频的主线应该是什么？', [['demo', '产品演示'], ['story', '品牌故事'], ['launch', '发布预告']]),
      question('duration', '希望视频多长？', [['short', '15 秒'], ['medium', '30 秒'], ['long', '60 秒']]),
    ],
    audio: [
      question('audioUse', '音频主要服务什么场景？', [['brand', '品牌片'], ['podcast', '播客片头'], ['product', '产品界面']]),
      question('mood', '核心情绪是什么？', [['uplifting', '明亮向上'], ['focused', '专注理性'], ['atmospheric', '氛围沉浸']]),
      question('audioDuration', '需要多长的成片？', [['sting', '10 秒'], ['short', '30 秒'], ['full', '60 秒']]),
    ],
    document: [
      question('documentAudience', '文档主要给谁阅读？', [['team', '项目团队'], ['leadership', '管理层'], ['external', '外部客户']]),
      question('documentPurpose', '文档最需要完成什么？', [['align', '对齐共识'], ['decide', '支持决策'], ['explain', '对外说明']]),
      question('documentDepth', '内容要保持多深？', [['summary', '一页摘要'], ['standard', '标准报告'], ['deep', '深度分析']]),
    ],
  };
  const richQuestions: Record<ArtifactType, BriefQuestion[]> = {
    website: [
      question('proof', '最应该强调哪类信任证据？', [['logos', '客户 Logo'], ['metrics', '量化数据'], ['stories', '客户案例']], 'checkbox'),
      question('visualDirection', '视觉方向更接近哪一种？', [['editorial', '编辑感'], ['technical', '技术感'], ['playful', '轻松感']]),
    ],
    'product-prototype': [
      question('edgeStates', '本轮最需要补哪类状态？', [['empty', '空状态'], ['errors', '错误与恢复'], ['permissions', '权限差异']], 'checkbox'),
      question('handoffMode', '验证后如何交付？', [['review', '团队评审'], ['usability', '用户测试'], ['engineering', '开发交付']]),
    ],
    presentation: [
      question('evidence', '哪类证据最能支撑这次演示？', [['metrics', '增长指标'], ['customers', '客户案例'], ['product', '产品演示']], 'checkbox'),
      question('closingDecision', '结尾希望听众做出什么决定？', [['fund', '支持融资'], ['approve', '批准方案'], ['pilot', '开启试点']]),
    ],
    'design-system': [
      question('governance', '新规则将如何治理？', [['central', '中心团队管理'], ['federated', '多团队共建'], ['lightweight', '轻量审核']]),
      question('accessibility', '可访问性优先级是什么？', [['baseline', 'WCAG AA 基线'], ['strict', '高对比严格模式'], ['product-led', '按核心场景逐步覆盖']]),
    ],
    image: [
      question('composition', '主体应该如何构图？', [['center', '中心聚焦'], ['asymmetric', '非对称留白'], ['closeup', '质感特写']]),
      question('copyPolicy', '画面需要保留文案空间吗？', [['none', '不放文字'], ['headline', '预留标题区'], ['cta', '预留标题和 CTA']]),
    ],
    video: [
      question('audioTreatment', '声音应该如何处理？', [['music', '音乐为主'], ['voiceover', '旁白为主'], ['silent', '静音也可理解']]),
      question('endingCta', '结尾要引导观众做什么？', [['visit', '访问网站'], ['try', '立即试用'], ['follow', '关注后续']]),
    ],
    audio: [
      question('voiceStyle', '如果包含人声，更适合哪种风格？', [['none', '纯音乐'], ['warm', '温暖叙述'], ['crisp', '清晰理性']]),
      question('mixFocus', '混音时最应该强调什么？', [['melody', '旋律'], ['rhythm', '节奏'], ['texture', '空间质感']]),
    ],
    document: [
      question('evidence', '文档优先纳入哪类证据？', [['data', '数据指标'], ['research', '用户研究'], ['examples', '实际案例']], 'checkbox'),
      question('recommendation', '结论应该给出多明确的建议？', [['options', '列出选项'], ['preferred', '推荐一个方案'], ['plan', '直接给出行动计划']]),
    ],
  };
  const knownAnswers = briefCase === 'rich'
    ? {
        audience: '用户已在详细需求中说明',
        intent: `用户已说明 ${label} 的目标和核心内容`,
        output: `用户已指定 ${label} 交付形式`,
      }
    : { artifactType: label };
  return {
    projectTitle: `${briefCase === 'rich' ? 'Detailed' : 'New'} ${label}`,
    knownAnswers,
    questionForm: {
      id: `${artifactType}-${briefCase}-brief`,
      title: briefCase === 'rich' ? '只确认剩余决策' : `补充 ${label} 需求`,
      description: briefCase === 'rich'
        ? '已知信息不再重复提问，只收集会改变交付结果的决策。'
        : '根据当前输入生成的精简选择题。',
      lang: 'zh-CN',
      submitLabel: '确认并继续',
      questions: briefCase === 'rich' ? richQuestions[artifactType] : sparseQuestions[artifactType],
    },
  };
}

function entryFileFor(artifactType: ArtifactType): string {
  const entries: Record<ArtifactType, string> = {
    website: 'index.html',
    'product-prototype': 'index.html',
    presentation: 'index.html',
    'design-system': 'DESIGN.md',
    image: 'open-design-image.png',
    video: 'open-design-video.mp4',
    audio: 'open-design-audio.mp3',
    document: 'index.html',
  };
  return entries[artifactType];
}

function parseMcpBody(text: string, contentType: string): JsonRpcResponse {
  if (contentType.includes('application/json')) return JSON.parse(text) as JsonRpcResponse;
  const messages = text
    .split(/\r?\n/u)
    .filter((line) => line.startsWith('data:'))
    .map((line) => JSON.parse(line.slice(5).trim()) as JsonRpcResponse);
  const response = messages.find((message) => message.result || message.error);
  if (!response) throw new Error('MCP response did not contain a JSON-RPC result');
  return response;
}

async function readWidget(endpoint: string): Promise<string> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'resources/read',
      params: { uri: WIDGET_URI },
    }),
  });
  const body = parseMcpBody(await response.text(), response.headers.get('content-type') ?? '');
  if (!response.ok || body.error) throw new Error(body.error?.message || `MCP returned HTTP ${response.status}`);
  const contents = body.result?.contents as Array<Record<string, unknown>> | undefined;
  const html = contents?.find((content) => content.uri === WIDGET_URI)?.text;
  if (typeof html !== 'string') throw new Error(`MCP resource ${WIDGET_URI} is missing`);
  return html;
}

function stateOutput(state: string, origin: string, artifactType: ArtifactType, briefCase: BriefCase = 'sparse'): Record<string, unknown> {
  const artifactLabel = ARTIFACT_LABELS[artifactType];
  if (state === 'brief') {
    return {
      view: 'brief-form',
      artifactType,
      ...dynamicBriefPreview(artifactType, briefCase),
    };
  }
  if (state === 'account') {
    return {
      loggedIn: false,
      balanceStatus: 'signed_out',
      canUseCloud: null,
      nextAction: 'sign_in',
    };
  }
  if (state === 'authorized') {
    return {
      loggedIn: true,
      user: { name: 'Sun Qingyu', email: 'sunqingyu@example.com' },
      balanceUsd: '18.40',
      balanceStatus: 'available',
      canUseCloud: true,
      nextAction: 'generate',
    };
  }
  if (state === 'running') {
    return {
      id: 'run-local-001',
      runId: 'run-local-001',
      projectId: 'local-card-gallery',
      projectName: `Local ${artifactLabel}`,
      artifactType,
      briefConfirmed: true,
      stage: 'generating',
      status: 'running',
      hint: `Open Design is producing the confirmed ${artifactLabel.toLowerCase()} deliverable.`,
    };
  }
  if (state === 'recharge') {
    return {
      loggedIn: true,
      user: { name: 'Sun Qingyu', email: 'sunqingyu@example.com' },
      balanceUsd: '0.00',
      balanceStatus: 'empty',
      canUseCloud: false,
      nextAction: 'recharge',
      rechargeUrl: 'https://open-design.ai/amr/wallet',
      hint: 'Your Open Design Cloud balance is empty. Recharge first, or continue in Open Design with a local Code Agent or BYOK.',
    };
  }
  return {
    id: 'run-local-001',
    runId: 'run-local-001',
    projectId: 'local-card-gallery',
    projectName: `Local ${artifactLabel}`,
    artifactType,
    briefConfirmed: true,
    stage: 'ready',
    status: 'succeeded',
    entryFile: entryFileFor(artifactType),
    previewUrl: `${origin}/artifact?artifactType=${encodeURIComponent(artifactType)}`,
    studioUrl: `${origin}/studio`,
    hint: 'Review the result here, then continue detailed editing, versions, and export in Open Design.',
  };
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

function mcpAppsHostScript(output: Record<string, unknown>, origin: string, widget: string, artifactType: ArtifactType): string {
  const complete = stateOutput('complete', origin, artifactType);
  return `<script>
    (() => {
      const frame = document.getElementById('artifact-card');
      const status = document.getElementById('local-host-status');
      const initialOutput = ${scriptJson(output)};
      const completeOutput = ${scriptJson(complete)};
      const widgetSource = ${scriptJson(widget)};
      const initializeDelayMs = 1500;
      let initialized = false;
      let lastHeight = null;

      const setStatus = (message) => {
        if (status) status.textContent = message;
      };
      const send = (message) => {
        frame?.contentWindow?.postMessage(message, '*');
      };
      const asToolResult = (structuredContent) => ({
        content: [{ type: 'text', text: JSON.stringify(structuredContent) }],
        structuredContent,
      });
      const toolResult = (name) => {
        if (name === 'get_run') return asToolResult(completeOutput);
        if (name === 'list_versions') return asToolResult({
          projectId: 'local-card-gallery', path: 'index.html', versions: [
            { id: 'v1', version: 1, label: 'Initial direction' },
            { id: 'v2', version: 2, label: 'Refined hero', current: true }
          ]
        });
        if (name === 'restore_version') return asToolResult({ ok: true });
        if (name === 'export_project') return asToolResult({
          ok: true, projectId: 'local-card-gallery', fileName: 'local-card-gallery.zip', bytes: 4096
        });
        return asToolResult({});
      };
      const sendInitialToolResult = () => {
        send({
          jsonrpc: '2.0',
          method: 'ui/notifications/tool-result',
          params: {
            content: [{ type: 'text', text: JSON.stringify(initialOutput) }],
            structuredContent: initialOutput,
          },
        });
      };

      window.addEventListener('message', (event) => {
        if (event.source !== frame?.contentWindow) return;
        const message = event.data;
        if (!message || message.jsonrpc !== '2.0') return;

        if (message.method === 'ui/initialize' && message.id !== undefined) {
          setStatus('MCP Apps · negotiating host connection…');
          window.setTimeout(() => {
            send({
              jsonrpc: '2.0',
              id: message.id,
              result: {
                protocolVersion: message.params?.protocolVersion || '2026-01-26',
                hostInfo: { name: 'open-design-local-card-gallery', version: '1.0.0' },
                hostCapabilities: {
                  openLinks: {},
                  serverTools: {},
                },
                hostContext: {
                  theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
                  displayMode: 'inline',
                  availableDisplayModes: ['inline'],
                  locale: navigator.language,
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  platform: 'desktop',
                  containerDimensions: {
                    maxWidth: frame?.clientWidth || 760,
                    maxHeight: frame?.clientHeight || 570,
                  },
                  safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 },
                },
              },
            });
          }, initializeDelayMs);
          return;
        }

        if (message.method === 'ui/notifications/initialized') {
          if (initialized) return;
          initialized = true;
          setStatus('MCP Apps · connected; initial tool result delivered');
          sendInitialToolResult();
          return;
        }

        if (message.method === 'tools/call' && message.id !== undefined) {
          const name = String(message.params?.name || '');
          const result = toolResult(name);
          send({ jsonrpc: '2.0', id: message.id, result });
          setStatus('MCP Apps · handled tools/call: ' + (name || 'unknown'));
          return;
        }

        if (message.method === 'ui/open-link' && message.id !== undefined) {
          send({ jsonrpc: '2.0', id: message.id, result: {} });
          setStatus('MCP Apps · open-link: ' + String(message.params?.url || ''));
          return;
        }

        if (message.method === 'ui/update-model-context' && message.id !== undefined) {
          send({ jsonrpc: '2.0', id: message.id, result: {} });
          setStatus('MCP Apps · brief added to model context');
          return;
        }

        if (message.method === 'ui/message' && message.id !== undefined) {
          send({ jsonrpc: '2.0', id: message.id, result: {} });
          const content = Array.isArray(message.params?.content) ? message.params.content : [];
          const submitted = String(content.find((item) => item?.type === 'text')?.text || '').split('\\n')[0];
          setStatus('MCP Apps · message submitted: ' + submitted);
          return;
        }

        if (message.method === 'ui/notifications/size-changed') {
          const nextHeight = Number(message.params?.height);
          if (Number.isFinite(nextHeight) && nextHeight > 0 && frame) {
            lastHeight = Math.max(120, Math.min(900, Math.ceil(nextHeight)));
            frame.style.height = lastHeight + 'px';
          }
          setStatus('MCP Apps · connected' + (lastHeight ? ' · widget height ' + lastHeight + 'px' : ''));
        }
      });

      setStatus('MCP Apps · waiting for ui/initialize (1.5s simulated host delay)');
      if (frame) frame.srcdoc = widgetSource;
    })();
  </script>`;
}

function galleryHtml(widget: string, state: string, origin: string, artifactType: ArtifactType, briefCase: BriefCase): string {
  const output = stateOutput(state, origin, artifactType, briefCase);
  const stateLinks = ['brief', 'account', 'authorized', 'running', 'recharge', 'complete']
    .map((item) => `<a href="/?state=${item}&amp;artifactType=${encodeURIComponent(artifactType)}&amp;briefCase=${briefCase}" aria-current="${item === state}">${item}</a>`)
    .join('');
  const artifactLinks = ARTIFACT_TYPES
    .map((item) => `<a href="/?state=brief&amp;artifactType=${encodeURIComponent(item)}&amp;briefCase=${briefCase}" aria-current="${state === 'brief' && item === artifactType}">${ARTIFACT_LABELS[item]}</a>`)
    .join('');
  const briefCaseLinks = (['sparse', 'rich'] as const)
    .map((item) => `<a href="/?state=brief&amp;artifactType=${encodeURIComponent(artifactType)}&amp;briefCase=${item}" aria-current="${state === 'brief' && item === briefCase}">${item} input</a>`)
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Open Design · Local Card Gallery</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; background: #f3f1ec; color: #171717; }
      body { margin: 0; padding: 32px; }
      header { max-width: 760px; margin: 0 auto 20px; }
      h1 { margin: 0 0 6px; font-size: 24px; letter-spacing: -.03em; }
      p { margin: 0; color: #666; font-size: 13px; }
      nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
      nav a { color: #222; text-decoration: none; padding: 7px 11px; border-radius: 999px; background: #fff; border: 1px solid #ddd8ce; font-size: 12px; font-weight: 700; }
      nav a[aria-current=true] { color: #fff; background: #111; border-color: #111; }
      .artifact-types { margin-top: 10px; }
      .artifact-types a { font-weight: 600; }
      iframe { display: block; width: min(760px, 100%); height: 570px; margin: 0 auto; border: 0; transition: height 200ms cubic-bezier(.23, 1, .32, 1); }
      #local-host-status { max-width: 720px; margin: 12px auto 0; min-height: 18px; color: #666; font-size: 12px; }
    </style></head><body>
    <header><h1>Open Design Artifact Card v10</h1><p>Dynamic QuestionForm preview. Same artifact, different user context: ${briefCase} input.</p>
      <nav>${stateLinks}</nav>
      <nav class="artifact-types" aria-label="Brief artifact type">${artifactLinks}</nav>
      <nav class="artifact-types" aria-label="Brief input context">${briefCaseLinks}</nav>
    </header>
    <iframe id="artifact-card" title="Open Design Artifact Card"></iframe>
    <div id="local-host-status"></div>
    ${mcpAppsHostScript(output, origin, widget, artifactType)}
  </body></html>`;
}

const endpoint = option('--endpoint', 'http://127.0.0.1:17456/mcp');
const port = Number(option('--port', '17640'));
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('--port must be between 1 and 65535');
const defaultArtifactType = artifactTypeOption('--artifact-type', 'website');
const widget = await readWidget(endpoint);
const origin = `http://127.0.0.1:${port}`;
const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', origin);
  if (url.pathname === '/artifact') {
    const requestedArtifactType = url.searchParams.get('artifactType') ?? defaultArtifactType;
    const artifactType = isArtifactType(requestedArtifactType) ? requestedArtifactType : defaultArtifactType;
    const label = ARTIFACT_LABELS[artifactType];
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><html><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:linear-gradient(135deg,#15171c,#414b6d);color:white;font-family:system-ui}.hero{text-align:center}.pill{display:inline-block;padding:6px 10px;border:1px solid #ffffff44;border-radius:999px;font-size:12px}h1{font-size:36px;margin:14px 0 8px}p{margin:0;color:#d9def0}</style><body><div class="hero"><span class="pill">OPEN DESIGN</span><h1>${label}</h1><p>A generated ${label.toLowerCase()} preview inside the host card.</p></div></body></html>`);
    return;
  }
  if (url.pathname === '/studio') {
    response.statusCode = 302;
    response.setHeader('location', 'http://127.0.0.1:17574/');
    response.end();
    return;
  }
  const state = ['brief', 'account', 'authorized', 'running', 'recharge', 'complete'].includes(url.searchParams.get('state') ?? '')
    ? String(url.searchParams.get('state'))
    : 'complete';
  const requestedArtifactType = url.searchParams.get('artifactType') ?? defaultArtifactType;
  if (!isArtifactType(requestedArtifactType)) {
    response.statusCode = 400;
    response.setHeader('content-type', 'text/plain; charset=utf-8');
    response.end(`artifactType must be one of: ${ARTIFACT_TYPES.join(', ')}`);
    return;
  }
  const briefCase = url.searchParams.get('briefCase') === 'rich' ? 'rich' : 'sparse';
  response.setHeader('content-type', 'text/html; charset=utf-8');
  response.end(galleryHtml(widget, state, origin, requestedArtifactType, briefCase));
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`Open Design local card gallery: ${origin}/?state=brief&artifactType=${defaultArtifactType}&briefCase=sparse\n`);
  process.stdout.write('Compare the same artifact with &briefCase=rich to verify adaptive questions.\n');
  process.stdout.write(`Brief artifact types: ${ARTIFACT_TYPES.join(', ')}\n`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

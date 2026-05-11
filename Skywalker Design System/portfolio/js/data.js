/* ============================================================
   Skywalker Portfolio — Mock Data
   All portfolio content, project data, tools, and navigation
   ============================================================ */

const DATA = {
  /* ---- Navigation ---- */
  nav: {
    groups: [
      {
        label: 'Workspace', items: [
          { key: 'landing',    label: 'Home',          icon: 'zap' },
          { key: 'dashboard',  label: 'Dashboard',     icon: 'grid' },
          { key: 'collection', label: 'Selected Work', icon: 'layers' },
          { key: 'casestudy',  label: 'Case Study',    icon: 'doc' },
          { key: 'prototype',  label: 'Presentations', icon: 'link' },
        ]
      },
      {
        label: 'AI · Web3', items: [
          { key: 'assistant', label: 'Assistant', icon: 'sparkle' },
          { key: 'mcp',      label: 'MCP Apps',  icon: 'plug' },
          { key: 'wallet',   label: 'Wallet',    icon: 'wallet' },
        ]
      }
    ]
  },

  /* ---- Projects ---- */
  projects: [
    { id: '023', title: 'Skywalker MCP Suite',        tags: ['mcp','ai-workflow','design-system'], cover: 'gradient-1', price: '0.42', chain: 'arbitrum', year: '2026', status: 'live',     category: 'AI Automation' },
    { id: '022', title: 'On-chain Portfolio Ledger',   tags: ['web3','product'],                   cover: 'gradient-2', price: '0.21', chain: 'base',     year: '2025', status: 'live',     category: 'Web3 UI' },
    { id: '021', title: 'Composer for Claude',         tags: ['ai-workflow','tooling'],             cover: 'gradient-3', price: '0.18', chain: 'arbitrum', year: '2025', status: 'beta',     category: 'AI Automation' },
    { id: '020', title: 'Wallet Identity Kit',         tags: ['web3','design-system'],              cover: 'gradient-4', price: '0.12', chain: 'base',     year: '2025', status: 'live',     category: 'Design System' },
    { id: '019', title: 'Tool-call Visualizer',        tags: ['ai-workflow','observability'],        cover: 'gradient-5', price: '0.09', chain: 'arbitrum', year: '2024', status: 'archived', category: 'AI Automation' },
    { id: '018', title: 'NFT Index Dashboard',         tags: ['web3','data-viz'],                   cover: 'gradient-6', price: '0.30', chain: 'base',     year: '2024', status: 'live',     category: 'Web3 UI' },
  ],

  coverGradients: {
    'gradient-1': 'radial-gradient(circle at 30% 30%, rgba(86,214,255,0.45) 0%, rgba(5,0,255,0.4) 45%, #07070a 100%)',
    'gradient-2': 'linear-gradient(135deg, rgba(5,0,255,0.55) 0%, #0a0d18 60%, rgba(86,214,255,0.25) 100%)',
    'gradient-3': 'radial-gradient(circle at 70% 25%, rgba(86,214,255,0.4) 0%, rgba(5,0,255,0.3) 45%, #07070a 100%)',
    'gradient-4': 'linear-gradient(150deg, rgba(86,214,255,0.3), rgba(5,0,255,0.4) 60%, #07070a)',
    'gradient-5': 'linear-gradient(180deg, rgba(86,214,255,0.18) 0%, #07070a 90%)',
    'gradient-6': 'radial-gradient(circle at 30% 80%, rgba(5,0,255,0.5), #07070a 70%)',
  },

  /* ---- Dashboard stats ---- */
  dashStats: [
    { label: 'Lifetime volume', value: '4.82 Ξ', sub: '+0.12 this week', color: 'var(--c-cyan)' },
    { label: 'Live tools',      value: '3',       sub: '· figma, claude, ledger' },
    { label: 'Case studies',    value: '12',      sub: '+1 in draft' },
    { label: 'MCP calls 24h',  value: '1,284',   sub: '+18% vs yesterday' },
  ],

  /* ---- Dashboard activity ---- */
  activity: [
    { dot: '#56D6FF', text: 'figma_export · ok',        sub: '12m · 1.2s · skywalker mcp' },
    { dot: '#1fa463', text: 'deploy → arbitrum',         sub: '34m · 0.42 ETH gas' },
    { dot: '#7147FF', text: 'claude.complete',           sub: '1h · sonnet-4.5 · 814 tok' },
    { dot: '#f5a524', text: 'wallet.connect',            sub: '2h · 0xa3f9…b21c' },
    { dot: '#56D6FF', text: 'ledger.mint case-022',      sub: '5h · 0.21 ETH' },
  ],

  /* ---- Chart data ---- */
  chartPoints: [12,14,11,18,22,20,24,28,26,32,30,38,42,40,44,42,48,50,46,52,58,62,60,68,72,70,76,82,78,84],

  /* ---- MCP apps ---- */
  mcpApps: [
    { name: 'Figma exporter',     desc: '3 tools · last call 12m', initial: 'F', grad: 'linear-gradient(135deg,#a259ff,#f24e1e)', enabled: true,  calls: 248,  status: 'live',   latency: '0.4s' },
    { name: 'Claude composer',    desc: '7 tools · last call 1m',  initial: 'C', grad: 'linear-gradient(135deg,#d97757,#5e00ff)', enabled: true,  calls: 1284, status: 'live',   latency: '0.8s' },
    { name: 'On-chain ledger',    desc: '4 tools · last call 5m',  initial: 'L', grad: 'linear-gradient(135deg,#0500FF,#56D6FF)', enabled: true,  calls: 96,   status: 'live',   latency: '1.2s' },
    { name: 'Skywalker CLI',      desc: '12 tools · last call 12s',initial: 'S', grad: 'linear-gradient(135deg,#7147FF,#FF7EAB)', enabled: true,  calls: 422,  status: 'live',   latency: '0.2s' },
    { name: 'GitHub commit feed', desc: '2 tools · last call 2h',  initial: 'G', grad: 'linear-gradient(135deg,#222,#444)',       enabled: false, calls: 18,   status: 'paused', latency: '—' },
    { name: 'Linear sync',        desc: '5 tools · not connected', initial: 'L', grad: 'linear-gradient(135deg,#5E6AD2,#8B92F0)', enabled: false, calls: 0,    status: 'beta',   latency: '—' },
  ],

  mcpStats: [
    { label: 'active servers', value: '4 / 6' },
    { label: 'tools available', value: '33' },
    { label: 'calls 24h', value: '1,284' },
    { label: 'errors', value: '0.3%' },
  ],

  consoleLog: [
    { time: '12:42:17', cmd: '→ figma.export',     args: 'frame:hero@2x',    result: 'ok',      extra: '1.2s' },
    { time: '12:42:14', cmd: '→ ledger.read',       args: 'case-study/023',   result: 'ok',      extra: '0.2s' },
    { time: '12:42:09', cmd: '→ search.projects',   args: 'chain:arbitrum',   result: 'ok',      extra: '0.4s' },
    { time: '12:41:55', cmd: '→ claude.complete',   args: 'sonnet-4.5',       result: '814 tok', extra: '2.4s' },
    { time: '12:41:30', cmd: '↻ wallet.connect',    args: '0xa3f9…b21c',      result: 'ok',      extra: '',    warn: true },
  ],

  /* ---- Assistant tools ---- */
  assistantTools: [
    { name: 'figma.export',     status: 'idle',      icon: 'figma' },
    { name: 'ledger.read',      status: 'last 12s',  icon: 'layers' },
    { name: 'search.projects',  status: 'last 0.4s', icon: 'search' },
    { name: 'wallet.read',      status: 'idle',      icon: 'wallet' },
    { name: 'claude.complete',  status: 'streaming', icon: 'sparkle' },
  ],

  assistantSuggestions: [
    'What was your hardest design tradeoff in 2025?',
    'Show me your most-used color tokens.',
    'Pull recent commits from skywalker-mcp.',
    'Compare Composer vs Tool Visualizer scopes.',
  ],

  /* ---- Wallet ---- */
  walletTokens: [
    { symbol: 'ETH',  chain: 'arbitrum', balance: '0.31', usd: '$948.10' },
    { symbol: 'ETH',  chain: 'base',     balance: '0.08', usd: '$245.20' },
    { symbol: 'USDC', chain: 'arbitrum', balance: '91.62', usd: '$91.62' },
  ],

  walletSettings: [
    { key: 'Default chain',    value: 'arbitrum-mainnet',          action: 'change' },
    { key: 'Notifications',   value: 'on-chain events only',      action: 'configure' },
    { key: 'Assistant model',  value: 'claude-sonnet-4.5',         action: 'swap' },
    { key: 'Display name',    value: 'Christian Wu',               action: 'edit' },
    { key: 'Two-factor',      value: 'hardware key + passkey',     action: 'manage' },
  ],

  /* ---- Case study content ---- */
  caseStudySections: [
    { eyebrow: '01', title: 'Problem', body: 'Every agent I build re-implements the same five tools: read a Figma frame, pull a commit, complete with Claude, mint to chain, query the ledger. Each integration is bespoke — different auth, different error shapes, different observability. The cost is invisible until you try to add a sixth.' },
    { eyebrow: '02', title: 'Approach', body: 'I exposed every tool through the Model Context Protocol so the contract is identical across surfaces. The CLI, the assistant, and any third-party agent all see the same JSON schema. I treated the tool catalog itself as a product: typed inputs, predictable error envelopes, latency budgets.' },
    { eyebrow: '03', title: 'Outcome', body: 'Total integration time for a new tool: 22 minutes. Mean tool-call latency: 0.4s. The Skywalker assistant now resolves 78% of incoming questions without human intervention, and every answer is reproducible because every tool call is on-chain.' },
  ],

  caseStudyMetrics: [
    { value: '1,284', label: 'tool calls / 24h' },
    { value: '0.4s',  label: 'p50 latency' },
    { value: '78%',   label: 'auto-resolution rate' },
  ],

  /* ---- Collection filters ---- */
  filters: ['all', 'web3', 'ai-workflow', 'design-system', 'tooling'],

  /* ---- Hero stats ---- */
  heroStats: [
    { num: '12',       label: 'case studies' },
    { num: '3',        label: 'production tools' },
    { num: '2.4k',     label: 'commits this year' },
    { num: 'arbitrum', label: 'primary chain' },
  ],

  // Workflows / Presentation Prototypes
  workflows: [
    {
      id: 'agent-os',
      title: 'Agent OS Interface',
      description: 'End-to-end user flow for a Web3 autonomous agent mobile application.',
      frames: [
        {
          title: 'Initialization',
          node: 'Flow / 01_Init',
          content: `
            <div style="padding: 40px 24px; height: 100%; display: flex; flex-direction: column;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 40px;">
                <div style="font-weight:600; font-size:18px;">Agent OS</div>
                <div style="width:32px; height:32px; border-radius:999px; background:linear-gradient(135deg, var(--c-primary), var(--c-accent))"></div>
              </div>
              <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center;">
                <div class="sw-hero-glow" style="width: 120px; height: 120px; border-radius: 50%; margin-bottom: 32px;"></div>
                <h3 style="font-size: 24px; margin-bottom: 12px; font-weight: 500;">Ready to Deploy</h3>
                <p style="color: var(--fg-muted); font-size: 15px; line-height: 1.5;">Connect your wallet to initialize your autonomous agent.</p>
              </div>
              <button class="sw-btn sw-btn--primary" style="width:100%; justify-content:center; padding: 16px; margin-bottom: 24px;">Connect Wallet</button>
            </div>
          `
        },
        {
          title: 'Dashboard',
          node: 'Flow / 02_Home',
          content: `
            <div style="padding: 40px 20px; background: #050507; min-height: 100%;">
              <div style="margin-bottom: 32px;">
                <div style="font-family: var(--font-mono); color: var(--fg-muted); font-size: 12px; margin-bottom: 8px;">TOTAL BALANCE</div>
                <div style="font-size: 32px; font-weight: 700; font-family: var(--font-mono);">$14,204.50</div>
                <div style="color: var(--c-accent); font-size: 14px; margin-top: 8px;">+2.4% today</div>
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 32px;">
                <div style="background: var(--bg-surface); padding: 16px; border-radius: 16px; border: 1px solid var(--border-light);">
                  <div class="sw-icon" style="color:var(--c-primary); margin-bottom:8px;">${icons.terminal || '<svg></svg>'}</div>
                  <div style="font-size: 14px; font-weight: 500;">Yield Agent</div>
                  <div style="font-size: 12px; color: var(--c-primary); margin-top:4px;">Active</div>
                </div>
                <div style="background: var(--bg-surface); padding: 16px; border-radius: 16px; border: 1px solid var(--border-light);">
                  <div class="sw-icon" style="color:var(--c-accent); margin-bottom:8px;">${icons.grid || '<svg></svg>'}</div>
                  <div style="font-size: 14px; font-weight: 500;">Sniper Bot</div>
                  <div style="font-size: 12px; color: var(--fg-muted); margin-top:4px;">Idle</div>
                </div>
              </div>
              <div style="font-size: 16px; font-weight: 500; margin-bottom: 16px;">Recent Activity</div>
              <div style="display:flex; flex-direction:column; gap: 12px;">
                <div style="display:flex; justify-content:space-between; padding: 12px; background: var(--bg-surface); border-radius: 12px;">
                  <div><div style="font-size:14px;font-weight:500;">Auto-compounded</div><div style="font-size:12px;color:var(--fg-muted);">ETH/USDC</div></div>
                  <div style="font-family:var(--font-mono);font-size:13px;color:var(--c-accent);">+$42.10</div>
                </div>
                <div style="display:flex; justify-content:space-between; padding: 12px; background: var(--bg-surface); border-radius: 12px;">
                  <div><div style="font-size:14px;font-weight:500;">Rebalanced</div><div style="font-size:12px;color:var(--fg-muted);">Portfolio</div></div>
                  <div style="font-family:var(--font-mono);font-size:13px;">Done</div>
                </div>
              </div>
            </div>
          `
        },
        {
          title: 'Agent Chat',
          node: 'Flow / 03_Chat',
          content: `
            <div style="display: flex; flex-direction: column; height: 100%;">
              <div style="padding: 24px 20px 16px; border-bottom: 1px solid var(--border-light); display:flex; align-items:center; gap: 12px; position: sticky; top: 0; background: var(--bg-surface); z-index: 10;">
                <div style="width:8px; height:8px; border-radius:50%; background:var(--c-accent); box-shadow: 0 0 8px var(--c-accent);"></div>
                <div style="font-weight: 500;">Yield Agent</div>
              </div>
              <div style="flex: 1; padding: 20px; display: flex; flex-direction: column; gap: 16px; overflow-y: auto;">
                <div style="align-self: flex-end; background: var(--c-primary); color: #000; padding: 12px 16px; border-radius: 16px 16px 4px 16px; max-width: 80%; font-size: 14px;">Find the best yield for my 10 ETH on Arbitrum.</div>
                <div style="align-self: flex-start; background: #1a1a1c; border: 1px solid var(--border-light); padding: 12px 16px; border-radius: 16px 16px 16px 4px; max-width: 85%; font-size: 14px; line-height: 1.5;">
                  Scanning protocols on Arbitrum...<br><br>
                  Found an optimal route:<br>
                  1. Supply to Aave V3 (3.2% APY)<br>
                  2. Farm Camelot GLP (12.4% APY)<br>
                  <br>
                  Estimated blended APY: <strong>15.6%</strong>
                  <button class="sw-btn" style="width:100%; margin-top: 12px; justify-content:center; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">Execute Strategy</button>
                </div>
              </div>
              <div style="padding: 16px; border-top: 1px solid var(--border-light); background: var(--bg-surface); padding-bottom: 32px;">
                <div style="display:flex; background: #050507; border: 1px solid var(--border-light); border-radius: 999px; padding: 4px 4px 4px 16px; align-items: center;">
                  <input type="text" placeholder="Type a command..." style="flex:1; background:transparent; border:none; color:#fff; font-family:var(--font-sans); outline:none; font-size:14px;">
                  <div style="width: 24px; height: 24px; background: var(--c-primary); border-radius: 50%; display:flex; justify-content:center; align-items:center; margin-right:4px;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
                  </div>
                </div>
              </div>
            </div>
          `
        }
      ]
    }
  ]
};

import { chromium } from 'playwright';
const out = '/private/tmp/claude-501/-Users-joey/dd1afb13-4608-427f-a230-aa890561374a/scratchpad/shots/';
const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const p = await (await b.newContext({ viewport: { width: 1600, height: 900 }, locale: 'zh-CN' })).newPage();
await p.goto('https://pr-6881.open-design-landing-staging.pages.dev/zh/', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{});
await p.waitForTimeout(1500);
await p.screenshot({ path: out + 'ref6881-zh.png', animations: 'disabled', timeout: 20000, clip: {x:0,y:0,width:1600,height:700} });
await b.close(); console.log('ok');

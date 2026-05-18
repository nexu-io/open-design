
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 强制指向 skill 目录下的 node_modules
module.paths.push('/Users/ligerui/.gemini/antigravity/skills/phantom-motion/node_modules');

(async () => {
    const url = process.argv[2];
    const duration = parseFloat(process.argv[3]);
    const outputDir = process.argv[4];
    const fps = 30;
    const totalFrames = Math.ceil(duration * fps);

    console.log(`🚀 物理采集启动: ${totalFrames} 帧`);
    const browser = await puppeteer.launch({
        headless: 'new', // 强制可见窗口以获得全显卡加速
        args: ['--window-size=1920,1080', '--enable-webgl', '--ignore-gpu-blocklist']
    });
    
    const page = await browser.newPage();
    await page.setViewport({width: 1920, height: 1080});
    
    // 实时监控浏览器内部报错
    page.on('console', msg => console.log('   [Browser]', msg.text()));
    page.on('pageerror', err => console.error('   [Browser Error]', err.message));
    page.on('requestfailed', request => {
        console.log(`   [Network Error] 404/Fail: ${request.url()} - ${request.failure()?.errorText || 'Unknown'}`);
    });

    await page.goto(url);
    
    // 极致视觉预热：等待所有 3D 资源（纹理、模型）加载完毕
    console.log("⏳ 正在预热 3D 环境，请稍候（约 10 秒）...");
    await new Promise(r => setTimeout(r, 10000));

    // 强制触发一次 UI 隐藏
    await page.evaluate(() => {
        const s = document.getElementById('phantom-starter');
        if(s) s.style.display = 'none';
    });

    for (let i = 0; i < totalFrames; i++) {
        const currentTime = i / fps;
        await page.evaluate((t) => {
            if (window.__timelines) {
                if (Array.isArray(window.__timelines)) {
                    window.__timelines.forEach(tl => {
                        if (tl && tl.time) tl.time(t);
                    });
                } else {
                    Object.values(window.__timelines).forEach(tl => {
                        if (tl && tl.time) tl.time(t);
                    });
                }
            } else if (window.renderFrame) {
                window.renderFrame(t);
            }
        }, currentTime);
        
        const framePath = path.join(outputDir, `frame_${String(i).padStart(5, '0')}.png`);
        await page.screenshot({path: framePath});
        
        if (i % 100 === 0) console.log(`   采集进度: ${i}/${totalFrames}`);
    }

    console.log("✅ 采集完成，正在关闭浏览器...");
    await browser.close();
    process.exit(0);
})();

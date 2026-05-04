#!/usr/bin/env python3
import argparse, os, subprocess, json, threading, socket, http.server
from pathlib import Path
import time

def find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        return s.getsockname()[1]

def main():
    p = argparse.ArgumentParser(description="幻象 3D 物理级录制引擎 (v4.0)")
    p.add_argument("--html", required=True, help="要录制的 HTML 文件路径")
    p.add_argument("--output", default="./phantom-output/universe_3d.mp4", help="最终视频输出路径")
    a = p.parse_args()

    html_path = os.path.abspath(a.html)
    output_path = os.path.abspath(a.output)
    temp_dir = Path(output_path).parent / "frames"
    if temp_dir.exists():
        subprocess.run(["rm", "-rf", str(temp_dir)])
    temp_dir.mkdir(exist_ok=True)
    
    # 1. 启动本地代理 (确保根目录能覆盖到 HTML 与 node_modules 资源)
    port = find_free_port()
    skill_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    project_root = skill_dir
    html_rel_path = os.path.relpath(html_path, project_root)
    
    os.chdir(project_root)
    server = http.server.HTTPServer(('127.0.0.1', port), http.server.SimpleHTTPRequestHandler)
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()
    
    root_dir = os.path.dirname(html_path)
    target_url = f"http://127.0.0.1:{port}/{html_rel_path}?render=true"
    
    # 2. 探测时长
    timings_path = Path(root_dir) / "audio" / "timings.json"
    duration = 105.0
    if timings_path.exists():
        with open(timings_path, "r") as f:
            data = json.load(f)
            duration = data.get("total_animation_duration", 105.0)

    print(f"🎬 启动 3D 物理级录制引擎 (v4.0)...")

    # 3. 准备 Node 脚本
    recorder_js = Path(skill_dir) / "scripts" / "record.js"
    
    js_content = """
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// 强制指向 skill 目录下的 node_modules
module.paths.push('SKILL_DIR/node_modules');

(async () => {
    const url = process.argv[2];
    const duration = parseFloat(process.argv[3]);
    const outputDir = process.argv[4];
    const fps = 30;
    const totalFrames = Math.ceil(duration * fps);

    console.log(`🚀 物理采集启动: ${totalFrames} 帧`);
    const browser = await puppeteer.launch({
        headless: false, // 强制可见窗口以获得全显卡加速
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
            if (window.renderOneFrame) window.renderOneFrame(t);
        }, currentTime);
        
        const framePath = path.join(outputDir, `frame_${String(i).padStart(5, '0')}.png`);
        await page.screenshot({path: framePath});
        
        if (i % 100 === 0) console.log(`   采集进度: ${i}/${totalFrames}`);
    }

    console.log("✅ 采集完成，正在关闭浏览器...");
    await browser.close();
    process.exit(0);
})();
""".replace("SKILL_DIR", skill_dir)

    with open(recorder_js, "w") as f:
        f.write(js_content)

    # 4. 执行 Node 采集
    try:
        subprocess.run(["node", str(recorder_js), target_url, str(duration), str(temp_dir)], check=True)
        
        # 5. FFmpeg 合成
        print(f"🚀 正在进行音画合成...")
        tts_path = Path(root_dir) / "audio" / "merged_tts.wav"
        bgm_path = Path(root_dir) / "audio" / "bgm.mp3"
        
        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-framerate", "30",
            "-i", str(temp_dir / "frame_%05d.png"),
            "-i", str(tts_path),
            "-i", str(bgm_path),
            "-filter_complex", "[1:a]volume=1.0[v1]; [2:a]volume=0.4[v2]; [v1][v2]amix=inputs=2:duration=first[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18",
            "-shortest",
            output_path
        ]
        subprocess.run(ffmpeg_cmd, check=True)
        print(f"\n✅ 最终视频已成功导出: {output_path}")
        
    finally:
        server.shutdown()

if __name__ == "__main__":
    main()

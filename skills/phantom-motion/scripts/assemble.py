#!/usr/bin/env python3
"""
幻象 MotionGraphic — 最终 HTML 合成器

将 HTML 动画骨架 + TTS 旁白 + 背景音乐 + 字幕时长映射合成为
可独立运行的单一 HTML 文件。

时长公式：前3秒淡入 + TTS总时长 + 后3秒淡出 = 总动画帧时长

用法：
  python3 assemble.py \
    --html animation.html \
    --tts ./phantom-output/audio/merged_tts.wav \
    --bgm ./phantom-output/audio/bgm.mp3 \
    --timings ./phantom-output/audio/timings.json \
    --output ./phantom-output/final.html
"""

import argparse, base64, json, os, sys, re
from pathlib import Path


def file_to_data_uri(filepath: str) -> str:
    ext = Path(filepath).suffix.lower()
    mime = {"wav": "audio/wav", "mp3": "audio/mpeg", "ogg": "audio/ogg"}.get(ext.lstrip("."), "audio/wav")
    with open(filepath, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


PLAYER_JS = """
<style id="phantom-play-control">
  /* 核心同步锁定 */
  .container:not(.playing) *, .container:not(.playing) {
    animation-play-state: paused !important;
  }
  
  #phantom-starter {
    position: fixed; inset: 0; z-index: 10000;
    background: #000;
    display: flex; flex-direction: column; justify-content: center; align-items: center;
    cursor: pointer; transition: opacity 2s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;
    overflow: hidden;
  }
  #phantom-starter.hidden { opacity: 0; pointer-events: none; transform: scale(1.1); }

  /* 极致巨幕背景字：融入虚空 */
  .epic-bg-text {
    position: absolute; width: 100%; text-align: center;
    font-size: 35vw; font-weight: 900;
    background: linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.05) 50%, transparent 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    letter-spacing: -3vw; filter: blur(2px);
    text-transform: uppercase; white-space: nowrap; pointer-events: none;
    animation: text-breathe 20s ease-in-out infinite alternate;
  }
  @keyframes text-breathe { 0% { opacity: 0.3; transform: scale(1); } 100% { opacity: 0.6; transform: scale(1.05); } }

  .epic-title-wrap {
    text-align: center; z-index: 5;
  }
  .epic-main-title {
    font-size: 16vw; font-weight: 900; color: #fff;
    letter-spacing: -0.8vw; text-transform: uppercase; line-height: 0.9;
    background: linear-gradient(180deg, #fff 0%, #ffde00 100%);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 30px rgba(255,222,0,0.3));
    animation: title-reveal-ultra 2.5s cubic-bezier(0.1, 0, 0.1, 1) forwards;
  }
  .epic-sub-title {
    font-size: 1.8vw; font-weight: 100; color: rgba(255,222,0,0.7);
    letter-spacing: 2vw; text-transform: uppercase; margin-top: 10px;
  }

  /* 璀璨星际粒子 */
  .starter-particles { position: absolute; inset: 0; pointer-events: none; z-index: 2; }
  .s-part { 
    position: absolute; background: #fff; border-radius: 50%; 
    box-shadow: 0 0 10px #fff, 0 0 20px #ffde00;
    opacity: 0.8; animation: space-drift linear infinite; 
  }
  @keyframes space-drift { from { transform: translateY(110vh) scale(0.5); } to { transform: translateY(-10vh) scale(1.5); } }

  /* 极致 Liner 播放按钮 */
  .liner-play-btn {
    position: relative; width: 120px; height: 120px; z-index: 10;
    margin-top: 6vh; display: flex; justify-content: center; align-items: center;
    transition: all 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .liner-play-btn:hover { transform: scale(1.2); }
  .btn-circle { position: absolute; inset: 0; border: 1px solid rgba(255,255,255,0.4); border-radius: 50%; }
  .btn-ripple {
    position: absolute; inset: 0; border: 1px solid #ffde00; border-radius: 50%;
    animation: ripple-out 2s linear infinite;
  }
  .play-svg { width: 35px; height: 35px; fill: #fff; filter: drop-shadow(0 0 10px #ffde00); }

  @keyframes title-reveal-ultra {
    0% { opacity: 0; transform: translateY(100px); filter: blur(30px); }
    100% { opacity: 1; transform: translateY(0); filter: blur(0); }
  }
  @keyframes ripple-out { 0% { transform: scale(1); opacity: 0.5; } 100% { transform: scale(1.8); opacity: 0; } }
</style>

<div id="phantom-starter">
  <div class="epic-bg-text">ORIGIN</div>
  <div class="starter-particles" id="starter-particles"></div>
  <div class="epic-title-wrap">
    <div class="epic-main-title">宇宙演变史</div>
    <div class="epic-sub-title">BEYOND THE HORIZON</div>
  </div>
  <div class="liner-play-btn">
    <div class="btn-circle"></div>
    <div class="btn-ripple"></div>
    <svg class="play-svg" viewBox="0 0 24 24"><path d="M7 4l12 8-12 8V4z"/></svg>
  </div>
</div>

<script id="phantom-player">
(function() {
  var TIMINGS = __TIMINGS_JSON__;
  var entries = TIMINGS.entries || [];
  var isStarted = false;
  window.__PHANTOM_TIMINGS__ = TIMINGS;

  // 检测渲染模式
  var urlParams = new URLSearchParams(window.location.search);
  var isRender = urlParams.get('render') === 'true';

  // 强化粒子生成
  var pContainer = document.getElementById('starter-particles');
  for(var i=0; i<120; i++) {
    var p = document.createElement('div');
    p.className = 's-part';
    var s = Math.random() * 3 + 1;
    p.style.width = s+'px'; p.style.height = s+'px';
    p.style.left = Math.random() * 100 + '%';
    p.style.top = Math.random() * 100 + '%';
    p.style.animationDuration = (Math.random() * 10 + 5) + 's';
    p.style.animationDelay = (Math.random() * -10) + 's';
    pContainer.appendChild(p);
  }

    function start() {
    if (isStarted) return;
    isStarted = true;

    var starter = document.getElementById('phantom-starter');
    var container = document.querySelector('.container');
    var tts = document.getElementById('phantom-tts');
    var bgm = document.getElementById('phantom-bgm');
    var cnEl = document.querySelector('.subtitle-cn');
    var enEl = document.querySelector('.subtitle-en');

    starter.classList.add('hidden');
    
    setTimeout(function() {
        if (container) container.classList.add('playing');
        if (isRender) return;
        if (bgm) { 
            bgm.volume = 0.4; 
            bgm.play().catch(function(){}); 
        }
        if (tts) {
          tts.volume = 1.0;
          tts.play().then(function() {

            tts.addEventListener('timeupdate', function() {
              var t = tts.currentTime + 3;
              for (var i = entries.length - 1; i >= 0; i--) {
                if (t >= entries[i].start) {
                  if (cnEl) cnEl.textContent = entries[i].text_cn || '';
                  if (enEl) enEl.textContent = entries[i].text_en || '';
                  break;
                }
              }
            });
          }).catch(function(e){ console.error("Play error", e); });
          
          tts.addEventListener('ended', function() {
            if (container) {
              container.style.transition = 'opacity 3s ease-out';
              container.style.opacity = '0';
            }
            setTimeout(function() { if (bgm) bgm.pause(); }, 3000);
          });
        }
    }, 100);
  }

  // 渲染模式自动启动：瞬间跳过所有 UI 遮挡
  if (isRender) {
      var s = document.getElementById('phantom-starter');
      if(s) s.style.display = 'none';
      start();
  }

  document.getElementById('phantom-starter').addEventListener('click', start);
  document.addEventListener('keydown', function(e) { if(e.code === 'Space' || e.code === 'Enter') start(); });

})();
</script>
"""


def main():
    p = argparse.ArgumentParser(description="幻象 HTML 合成器")
    p.add_argument("--html", required=True, help="HTML 动画骨架文件")
    p.add_argument("--tts", required=True, help="合并后 TTS WAV 文件")
    p.add_argument("--bgm", required=True, help="BGM 音频文件")
    p.add_argument("--timings", required=True, help="时长映射 JSON")
    p.add_argument("--output", default="./phantom-output/final.html", help="输出文件")
    a = p.parse_args()

    # 读取输入
    with open(a.html, "r", encoding="utf-8") as f:
        html = f.read()
    with open(a.timings, "r", encoding="utf-8") as f:
        timings = json.load(f)

    print("🔧 幻象 HTML 合成器")
    print(f"   HTML: {a.html}")
    print(f"   TTS:  {a.tts}")
    print(f"   BGM:  {a.bgm}")
    print(f"   总时长: {timings['total_animation_duration']}s")

    # 生成 data URI
    tts_uri = file_to_data_uri(a.tts)
    bgm_uri = file_to_data_uri(a.bgm)
    print(f"   TTS Base64: {len(tts_uri)//1024}KB")
    print(f"   BGM Base64: {len(bgm_uri)//1024}KB")

    # 构建音频标签
    audio_tags = (
        f'\n<audio id="phantom-tts" preload="auto" src="{tts_uri}"></audio>\n'
        f'<audio id="phantom-bgm" preload="auto" loop src="{bgm_uri}"></audio>\n'
    )

    # 构建播放器脚本
    player = PLAYER_JS.replace("__TIMINGS_JSON__", json.dumps(timings, ensure_ascii=False))

    # 注入到 HTML
    if "</body>" in html:
        html = html.replace("</body>", f"{audio_tags}\n{player}\n</body>")
    else:
        html += f"\n{audio_tags}\n{player}"

    # 写入输出
    out_path = Path(a.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(str(out_path), "w", encoding="utf-8") as f:
        f.write(html)

    size_kb = os.path.getsize(str(out_path)) / 1024
    print(f"\n✅ 最终 HTML: {out_path} ({size_kb:.0f}KB)")
    print(f"   → 在浏览器中打开即可自动播放动画 + 旁白 + 背景音乐")


if __name__ == "__main__":
    main()

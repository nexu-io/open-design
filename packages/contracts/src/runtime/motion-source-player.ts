import { findRealTagOffset, HTML_TAG_PATTERNS, prependAfterDoctype } from './html-injection-points';

export const MOTION_PLAYER_MARKER = 'data-od-motion-source-player';

// Shared by URL previews, srcdoc previews and the persisted editable source.
// The renderer installs its flag before author scripts; it never sees chrome,
// layout scaling, poster seeking, or wall-clock playback from this runtime.
const PLAYER = `<script data-od-motion-source-player>
(function () {
  function boot() {
    if (window.__odMotionRender || window.__odMotionSourcePlayer) return;
    var root = document.querySelector('[data-composition-id][data-duration][data-width][data-height]');
    var mode = document.querySelector('meta[name="od-motion-output"]');
    if (!root || (mode && mode.content === 'interactive')) return;
    window.__odMotionSourcePlayer = true;
    var width = Number(root.dataset.width), height = Number(root.dataset.height);
    if (!(width > 0 && height > 0)) return;
    var host = document.createElement('div');
    host.setAttribute('data-od-motion-controls', '');
    host.style.cssText = 'position:fixed;inset:auto 0 0;z-index:2147483647;height:52px;display:block';
    var shadow = host.attachShadow({mode:'open'});
    shadow.innerHTML = '<style>:host{color-scheme:dark}*{box-sizing:border-box}.bar{height:52px;display:flex;align-items:center;gap:10px;padding:8px 12px;background:#17191d;color:#fff;font:13px system-ui}button{border:1px solid #626772;border-radius:6px;background:#252932;color:white;padding:6px 10px;cursor:pointer}button:focus-visible,input:focus-visible{outline:2px solid #8bb8ff}input{min-width:40px;flex:1;accent-color:#2f6feb}output{white-space:nowrap}</style><div class="bar"><button id="play" disabled>播放</button><button id="replay" disabled>重播</button><input aria-label="播放进度" type="range" min="0" max="1" step="0.01" value="0" disabled><output role="status">正在加载动效…</output></div>';
    document.body.appendChild(host);
    var play = shadow.getElementById('play'), replay = shadow.getElementById('replay');
    var slider = shadow.querySelector('input'), status = shadow.querySelector('output');
    var fitStyle = document.createElement('style');
    fitStyle.textContent = 'html,body{width:100% !important;height:100% !important;margin:0 !important;overflow:hidden !important}';
    document.head.appendChild(fitStyle);
    // Fit via a wrapper so authored transforms on the stage remain untouched.
    var stage = document.createElement('div');
    root.parentNode.insertBefore(stage, root); stage.appendChild(root);
    function fit() {
      var scale = Math.min(innerWidth / width, Math.max(1, innerHeight - 52) / height);
      stage.style.cssText = 'position:fixed;width:' + width + 'px;height:' + height + 'px;left:' + ((innerWidth-width*scale)/2) + 'px;top:' + ((innerHeight-52-height*scale)/2) + 'px;transform-origin:0 0;transform:scale(' + scale + ')';
    }
    fit(); window.addEventListener('resize', fit);
    var started = Date.now();
    function connect() {
      var tl = window.__timelines && window.__timelines[root.dataset.compositionId];
      if (!tl || typeof tl.seek !== 'function' || typeof tl.play !== 'function' || !(tl.duration() > 0)) {
        if (Date.now()-started < 15000) { setTimeout(connect, 100); return; }
        status.textContent = '动效未就绪，请检查时间轴或依赖文件'; return;
      }
      var duration = tl.duration();
      play.disabled = replay.disabled = slider.disabled = false;
      slider.max = String(duration);
      // Render a useful still without overriding authored onUpdate callbacks.
      tl.pause(); tl.seek(Math.min(0.5, duration / 10), false);
      play.onclick = function () { if (tl.paused() || tl.time() >= duration) { if (tl.time() >= duration) tl.seek(0, false); tl.play(); } else tl.pause(); };
      replay.onclick = function () { tl.pause(); tl.seek(0, false); tl.play(); };
      slider.oninput = function () { tl.pause(); tl.seek(Number(slider.value), false); };
      function update() {
        if (!host.isConnected) return;
        var time = tl.time(); slider.value = String(time);
        play.textContent = tl.paused() || time >= duration ? '播放' : '暂停';
        status.textContent = time.toFixed(1) + ' / ' + duration.toFixed(1) + ' s';
        setTimeout(update, tl.paused() || time >= duration ? 200 : 33);
      }
      update();
    }
    connect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
})();
</script>`;

export function injectMotionSourcePlayer(html: string): string {
  // Runtime checks the actual DOM too; these prefilters avoid adding code to
  // ordinary prototypes/decks and do not mistake JS samples for HTML tags.
  if (findRealTagOffset(html, /<[^/!][^>]*\bdata-composition-id\s*=/i) < 0
    || findRealTagOffset(html, /<script\b[^>]*\bdata-od-motion-source-player\b/i) >= 0) return html;
  const end = findRealTagOffset(html, HTML_TAG_PATTERNS.bodyClose);
  return end < 0 ? html + PLAYER : html.slice(0, end) + PLAYER + html.slice(end);
}

export function markMotionFrameRender(html: string): string {
  return prependAfterDoctype(html, '<script>window.__odMotionRender=true;</script>');
}

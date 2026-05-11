/* html-ppt :: runtime.js
 * Keyboard-driven deck runtime. Zero dependencies.
 *
 * Features:
 *   ← → / space / PgUp PgDn / Home End  navigation
 *   F  fullscreen
 *   S  presenter mode (opens a NEW WINDOW with current/next slide preview + notes + timer)
 *       The original window stays as audience view, synced via BroadcastChannel.
 *       Slide previews use CSS transform:scale() at design resolution for pixel-perfect layout.
 *   N  quick notes overlay (bottom drawer)
 *   O  slide overview grid
 *   T  cycle themes (reads data-themes on <html> or <body>)
 *   A  cycle demo animation on current slide
 *   URL hash #/N  deep-link to slide N (1-based)
 *   Progress bar auto-managed
 */
(function () {
  'use strict';

  const ANIMS = ['fade-up','fade-down','fade-left','fade-right','rise-in','drop-in',
    'zoom-pop','blur-in','glitch-in','typewriter','neon-glow','shimmer-sweep',
    'gradient-flow','stagger-list','counter-up','path-draw','parallax-tilt',
    'card-flip-3d','cube-rotate-3d','page-turn-3d','perspective-zoom',
    'marquee-scroll','kenburns','confetti-burst','spotlight','morph-shape','ripple-reveal'];

  function ready(fn){ if(document.readyState!='loading')fn(); else document.addEventListener('DOMContentLoaded',fn);}

  /* ========== Parse URL for preview-only mode ==========
   * When loaded as iframe.src = "index.html?preview=3", runtime enters a
   * locked single-slide mode: only slide N is visible, no chrome, no keys,
   * no hash updates. This is how the presenter window shows pixel-perfect
   * previews — by loading the actual deck file in an iframe and telling it
   * to display only a specific slide.
   */
  function getPreviewIdx() {
    const m = /[?&]preview=(\d+)/.exec(location.search || '');
    return m ? parseInt(m[1], 10) - 1 : -1;
  }

  ready(function () {
    const deck = document.querySelector('.deck');
    if (!deck) return;
    const slides = Array.from(deck.querySelectorAll('.slide'));
    if (!slides.length) return;

    const previewOnlyIdx = getPreviewIdx();
    const isPreviewMode = previewOnlyIdx >= 0 && previewOnlyIdx < slides.length;

    /* ===== Preview-only mode: show one slide, hide everything else ===== */
    if (isPreviewMode) {
      function showSlide(i) {
        slides.forEach((s, j) => {
          const active = (j === i);
          s.classList.toggle('is-active', active);
          s.style.display = active ? '' : 'none';
          if (active) {
            s.style.opacity = '1';
            s.style.transform = 'none';
            s.style.pointerEvents = 'auto';
          }
        });
      }
      showSlide(previewOnlyIdx);
      /* Hide chrome that the presenter shouldn't see in preview */
      const hideSel = '.progress-bar, .notes-overlay, .overview, .notes, aside.notes, .speaker-notes';
      document.querySelectorAll(hideSel).forEach(el => { el.style.display = 'none'; });
      document.documentElement.setAttribute('data-preview', '1');
      document.body.setAttribute('data-preview', '1');
      /* Auto-detect theme base path for theme switching in preview mode */
      function getPreviewThemeBase() {
        const base = document.documentElement.getAttribute('data-theme-base');
        if (base) return base;
        const tl = document.getElementById('theme-link');
        if (tl) {
          const raw = tl.getAttribute('href') || '';
          const ls = raw.lastIndexOf('/');
          if (ls >= 0) return raw.substring(0, ls + 1);
        }
        return 'assets/themes/';
      }
      const previewThemeBase = getPreviewThemeBase();

      /* Listen for postMessage from parent presenter window:
       *  - preview-goto: switch visible slide WITHOUT reloading
       *  - preview-theme: switch theme CSS link to match audience window */
      window.addEventListener('message', function(e) {
        if (!e.data) return;
        if (e.data.type === 'preview-goto') {
          const n = parseInt(e.data.idx, 10);
          if (n >= 0 && n < slides.length) showSlide(n);
        } else if (e.data.type === 'preview-theme' && e.data.name) {
          let link = document.getElementById('theme-link');
          if (!link) {
            link = document.createElement('link');
            link.rel = 'stylesheet';
            link.id = 'theme-link';
            document.head.appendChild(link);
          }
          link.href = previewThemeBase + e.data.name + '.css';
          document.documentElement.setAttribute('data-theme', e.data.name);
        }
      });
      /* Signal to parent that preview iframe is ready */
      try { window.parent && window.parent.postMessage({ type: 'preview-ready' }, '*'); } catch(e) {}
      return;
    }

    let idx = 0;
    const total = slides.length;

    /* ===== BroadcastChannel for presenter sync ===== */
    const CHANNEL_NAME = 'html-ppt-presenter-' + location.pathname;
    let bc;
    try { bc = new BroadcastChannel(CHANNEL_NAME); } catch(e) { bc = null; }

    // Are we running inside the presenter popup? (legacy flag, now unused)
    const isPresenterWindow = false;

    /* ===== progress bar ===== */
    let bar = document.querySelector('.progress-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'progress-bar';
      bar.innerHTML = '<span></span>';
      document.body.appendChild(bar);
    }
    const barFill = bar.querySelector('span');

    /* ===== notes overlay (N key) ===== */
    let notes = document.querySelector('.notes-overlay');
    if (!notes) {
      notes = document.createElement('div');
      notes.className = 'notes-overlay';
      document.body.appendChild(notes);
    }

    /* ===== overview grid (O key) ===== */
    let overview = document.querySelector('.overview');
    if (!overview) {
      overview = document.createElement('div');
      overview.className = 'overview';
      slides.forEach((s, i) => {
        const t = document.createElement('div');
        t.className = 'thumb';
        // Force 16:9 aspect ratio robustly
        t.style.padding = '0 0 56.25% 0';
        t.style.height = '0';
        t.style.position = 'relative';
        t.style.overflow = 'hidden';

        const title = s.getAttribute('data-title') ||
          (s.querySelector('h1,h2,h3')||{}).textContent || ('Slide '+(i+1));
        
        // Create a container for the mini-slide
        const mini = document.createElement('div');
        mini.className = 'mini-slide';
        mini.style.position = 'absolute';
        mini.style.top = '0';
        mini.style.left = '0';
        mini.style.width = '1920px';
        mini.style.height = '1080px';
        mini.style.transformOrigin = 'top left';
        mini.style.pointerEvents = 'none';
        mini.style.background = 'var(--bg)';
        
        // Clone the slide content
        const clone = s.cloneNode(true);
        clone.className = 'slide is-active'; // force active styles
        clone.style.position = 'absolute';
        clone.style.inset = '0';
        clone.style.transform = 'none';
        clone.style.opacity = '1';
        clone.style.padding = '72px 96px'; // ensure padding is kept
        
        mini.appendChild(clone);
        t.appendChild(mini);

        // Add the number and title overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.inset = '0';
        overlay.style.background = 'linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 40%, transparent 60%, rgba(0,0,0,0.8) 100%)';
        overlay.style.color = '#fff';
        overlay.style.zIndex = '10';
        overlay.style.pointerEvents = 'none';
        
        const n = document.createElement('div');
        n.className = 'n';
        n.textContent = i + 1;
        n.style.position = 'absolute';
        n.style.top = '12px';
        n.style.left = '16px';
        n.style.fontWeight = '700';
        n.style.fontSize = '16px';
        n.style.color = '#fff';
        n.style.textShadow = '0 1px 4px rgba(0,0,0,0.8)';
        
        const text = document.createElement('div');
        text.className = 't';
        text.textContent = title.trim().slice(0,80);
        text.style.position = 'absolute';
        text.style.bottom = '12px';
        text.style.left = '16px';
        text.style.right = '16px';
        text.style.fontWeight = '600';
        text.style.fontSize = '14px';
        text.style.color = '#fff';
        text.style.textShadow = '0 1px 4px rgba(0,0,0,0.8)';
        
        overlay.appendChild(n);
        overlay.appendChild(text);
        t.appendChild(overlay);

        t.addEventListener('click', () => { go(i); toggleOverview(false); });
        overview.appendChild(t);
      });
      document.body.appendChild(overview);
    }

    /* ===== navigation ===== */
    function go(n, fromRemote){
      n = Math.max(0, Math.min(total-1, n));
      slides.forEach((s,i) => {
        s.classList.toggle('is-active', i===n);
        s.classList.toggle('is-prev', i<n);
      });
      idx = n;
      barFill.style.width = ((n+1)/total*100)+'%';
      const numEl = document.querySelector('.slide-number');
      if (numEl) { numEl.setAttribute('data-current', n+1); numEl.setAttribute('data-total', total); }

      // notes (bottom overlay)
      const note = slides[n].querySelector('.notes, aside.notes, .speaker-notes');
      notes.innerHTML = note ? note.innerHTML : '';

      // hash
      const hashTarget = '#/'+(n+1);
      if (location.hash !== hashTarget && !isPresenterWindow) {
        history.replaceState(null,'', hashTarget);
      }

      // re-trigger entry animations
      slides[n].querySelectorAll('[data-anim]').forEach(el => {
        const a = el.getAttribute('data-anim');
        el.classList.remove('anim-'+a);
        void el.offsetWidth;
        el.classList.add('anim-'+a);
      });

      // counter-up
      slides[n].querySelectorAll('.counter').forEach(el => {
        const target = parseFloat(el.getAttribute('data-to')||el.textContent);
        const dur = parseInt(el.getAttribute('data-dur')||'1200',10);
        const start = performance.now();
        const from = 0;
        function tick(now){
          const t = Math.min(1,(now-start)/dur);
          const v = from + (target-from)*(1-Math.pow(1-t,3));
          el.textContent = (target % 1 === 0) ? Math.round(v) : v.toFixed(1);
          if (t<1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });

      // Broadcast to other window (audience ↔ presenter)
      if (!fromRemote && bc) {
        bc.postMessage({ type: 'go', idx: n });
      }
    }

    /* ===== listen for remote navigation / theme changes ===== */
    if (bc) {
      bc.onmessage = function(e) {
        if (!e.data) return;
        if (e.data.type === 'go' && typeof e.data.idx === 'number') {
          go(e.data.idx, true);
        } else if (e.data.type === 'theme' && e.data.name) {
          /* Sync theme across windows */
          const i = themes.indexOf(e.data.name);
          if (i >= 0) themeIdx = i;
          applyTheme(e.data.name);
        }
      };
    }

    function toggleNotes(force){ notes.classList.toggle('open', force!==undefined?force:!notes.classList.contains('open')); }
    function toggleOverview(force){
      const isOpen = force!==undefined ? force : !overview.classList.contains('open');
      overview.classList.toggle('open', isOpen);
      if (isOpen) {
        requestAnimationFrame(() => {
          const thumbs = overview.querySelectorAll('.thumb');
          if (thumbs.length) {
            const scale = thumbs[0].clientWidth / 1920;
            overview.querySelectorAll('.mini-slide').forEach(m => {
              m.style.transform = 'scale(' + scale + ')';
            });
          }
        });
      }
    }

    /* ========== PRESENTER MODE — Magnetic-card popup window ========== */
    /* Opens a new window with 4 draggable, resizable cards:
     *   CURRENT  — iframe(?preview=N)   pixel-perfect preview of current slide
     *   NEXT     — iframe(?preview=N+1) pixel-perfect preview of next slide
     *   SCRIPT   — large speaker notes (逐字稿)
     *   TIMER    — elapsed timer + page counter + controls
     * Cards remember position/size in localStorage.
     * Two windows sync via BroadcastChannel.
     */
    let presenterWin = null;

    function openPresenterWindow() {
      if (presenterWin && !presenterWin.closed) {
        presenterWin.focus();
        return;
      }

      // Build absolute URL of THIS deck file (without hash/query)
      const deckUrl = location.protocol + '//' + location.host + location.pathname;

      // Collect slide titles + notes (HTML strings)
      const slideMeta = slides.map((s, i) => {
        const note = s.querySelector('.notes, aside.notes, .speaker-notes');
        return {
          title: s.getAttribute('data-title') ||
            (s.querySelector('h1,h2,h3')||{}).textContent || ('Slide '+(i+1)),
          notes: note ? note.innerHTML : ''
        };
      });

      /* Capture current theme so presenter previews match the audience */
      const currentTheme = root.getAttribute('data-theme') || (themes[themeIdx] || '');
      const presenterHTML = buildPresenterHTML(deckUrl, slideMeta, total, idx, CHANNEL_NAME, currentTheme);

      presenterWin = window.open('', 'html-ppt-presenter', 'width=1280,height=820,menubar=no,toolbar=no');
      if (!presenterWin) {
        alert('请允许弹出窗口以使用演讲者视图');
        return;
      }
      presenterWin.document.open();
      presenterWin.document.write(presenterHTML);
      presenterWin.document.close();
    }

    function buildPresenterHTML(deckUrl, slideMeta, total, startIdx, channelName, currentTheme) {
      const metaJSON = JSON.stringify(slideMeta);
      const deckUrlJSON = JSON.stringify(deckUrl);
      const channelJSON = JSON.stringify(channelName);
      const themeJSON = JSON.stringify(currentTheme || '');
      const storageKey = 'html-ppt-presenter:' + location.pathname;

      // Build the document as a single template string for clarity
      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Presenter View</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body {
    width: 100%; height: 100%; overflow: hidden;
    background: #1a1d24;
    background-image:
      radial-gradient(circle at 20% 30%, rgba(88,166,255,.04), transparent 50%),
      radial-gradient(circle at 80% 70%, rgba(188,140,255,.04), transparent 50%);
    color: #e6edf3;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
  }
  /* Stage: positioned area where cards live */
  #stage { position: absolute; inset: 0; overflow: hidden; }

  /* Magnetic card */
  .pcard {
    position: absolute;
    background: #0d1117;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0,0,0,.45), 0 0 0 1px rgba(255,255,255,.02);
    display: flex; flex-direction: column;
    overflow: hidden;
    min-width: 180px; min-height: 100px;
    transition: box-shadow .2s, border-color .2s;
  }
  .pcard.dragging { box-shadow: 0 16px 48px rgba(0,0,0,.6), 0 0 0 2px rgba(88,166,255,.5); border-color: #58a6ff; transition: none; z-index: 9999; }
  .pcard.resizing { box-shadow: 0 16px 48px rgba(0,0,0,.6), 0 0 0 2px rgba(63,185,80,.5); border-color: #3fb950; transition: none; z-index: 9999; }
  .pcard:hover { border-color: rgba(88,166,255,.3); }

  /* Card header (drag handle) */
  .pcard-head {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 12px;
    background: rgba(255,255,255,.04);
    border-bottom: 1px solid rgba(255,255,255,.06);
    cursor: move;
    user-select: none;
    flex-shrink: 0;
  }
  .pcard-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--dot-color, #58a6ff); flex-shrink: 0; }
  .pcard-title {
    font-size: 11px; letter-spacing: .15em; text-transform: uppercase;
    font-weight: 700; color: #8b949e; flex: 1;
  }
  .pcard-meta { font-size: 11px; color: #6e7681; }

  /* Card body */
  .pcard-body { flex: 1; position: relative; overflow: hidden; min-height: 0; }

  /* Preview cards (CURRENT/NEXT) — iframe-based pixel-perfect render */
  .pcard-preview .pcard-body { background: #000; }
  .pcard-preview iframe {
    position: absolute; top: 0; left: 0;
    width: 1920px; height: 1080px;
    border: none;
    transform-origin: top left;
    pointer-events: none;
    background: transparent;
  }
  .pcard-preview .preview-end {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    color: #484f58; font-size: 14px; letter-spacing: .12em;
  }

  /* Notes card */
  .pcard-notes .pcard-body {
    padding: 14px 18px;
    overflow-y: auto;
    font-size: 18px; line-height: 1.75;
    color: #d0d7de;
    font-family: "Noto Sans SC", -apple-system, sans-serif;
  }
  .pcard-notes .pcard-body p { margin: 0 0 .7em 0; }
  .pcard-notes .pcard-body strong { color: #f0883e; }
  .pcard-notes .pcard-body em { color: #58a6ff; font-style: normal; }
  .pcard-notes .pcard-body code {
    font-family: "SF Mono", monospace; font-size: .9em;
    background: rgba(255,255,255,.08); padding: 1px 6px; border-radius: 4px;
  }
  .pcard-notes .empty { color: #484f58; font-style: italic; }

  /* Timer card */
  .pcard-timer .pcard-body {
    display: flex; flex-direction: column; gap: 14px;
    padding: 18px 20px; justify-content: center;
  }
  .timer-display {
    font-family: "SF Mono", "JetBrains Mono", monospace;
    font-size: 42px; font-weight: 700;
    color: #3fb950;
    letter-spacing: .04em;
    line-height: 1;
  }
  .timer-row {
    display: flex; align-items: center; gap: 12px;
    font-size: 14px; color: #8b949e;
  }
  .timer-row .label { font-size: 10px; letter-spacing: .15em; text-transform: uppercase; color: #6e7681; }
  .timer-row .val { color: #e6edf3; font-weight: 600; font-family: "SF Mono", monospace; }
  .timer-controls { display: flex; gap: 8px; flex-wrap: wrap; }
  .timer-btn {
    background: rgba(255,255,255,.06);
    border: 1px solid rgba(255,255,255,.1);
    color: #e6edf3;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
  }
  .timer-btn:hover { background: rgba(88,166,255,.15); border-color: #58a6ff; }
  .timer-btn:active { transform: translateY(1px); }

  /* Resize handle */
  .pcard-resize {
    position: absolute; right: 0; bottom: 0;
    width: 18px; height: 18px;
    cursor: nwse-resize;
    background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,.25) 50%, rgba(255,255,255,.25) 60%, transparent 60%, transparent 70%, rgba(255,255,255,.25) 70%, rgba(255,255,255,.25) 80%, transparent 80%);
    z-index: 5;
  }
  .pcard-resize:hover { background: linear-gradient(135deg, transparent 50%, #58a6ff 50%, #58a6ff 60%, transparent 60%, transparent 70%, #58a6ff 70%, #58a6ff 80%, transparent 80%); }

  /* Bottom hint bar */
  .hint-bar {
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(0,0,0,.6);
    backdrop-filter: blur(10px);
    border-top: 1px solid rgba(255,255,255,.08);
    padding: 6px 16px;
    font-size: 11px; color: #8b949e;
    display: flex; gap: 18px; align-items: center;
    z-index: 1000;
  }
  .hint-bar kbd {
    background: rgba(255,255,255,.08);
    padding: 1px 6px; border-radius: 3px;
    font-family: "SF Mono", monospace;
    font-size: 10px;
    border: 1px solid rgba(255,255,255,.1);
    color: #e6edf3;
  }
  .hint-bar .reset-layout {
    margin-left: auto;
    background: transparent; border: 1px solid rgba(255,255,255,.15);
    color: #8b949e; padding: 3px 10px; border-radius: 4px;
    font-size: 11px; cursor: pointer; font-family: inherit;
  }
  .hint-bar .reset-layout:hover { background: rgba(248,81,73,.15); border-color: #f85149; color: #f85149; }

  body.is-dragging-card * { user-select: none !important; }
  body.is-dragging-card iframe { pointer-events: none !important; }
</style>
</head>
<body>

<div id="stage">
  <div class="pcard pcard-preview" id="card-cur" style="--dot-color:#58a6ff">
    <div class="pcard-head" data-drag>
      <span class="pcard-dot"></span>
      <span class="pcard-title">CURRENT</span>
      <span class="pcard-meta" id="cur-meta">—</span>
    </div>
    <div class="pcard-body"><iframe id="iframe-cur"></iframe></div>
    <div class="pcard-resize" data-resize></div>
  </div>

  <div class="pcard pcard-preview" id="card-nxt" style="--dot-color:#bc8cff">
    <div class="pcard-head" data-drag>
      <span class="pcard-dot"></span>
      <span class="pcard-title">NEXT</span>
      <span class="pcard-meta" id="nxt-meta">—</span>
    </div>
    <div class="pcard-body"><iframe id="iframe-nxt"></iframe></div>
    <div class="pcard-resize" data-resize></div>
  </div>

  <div class="pcard pcard-notes" id="card-notes" style="--dot-color:#f0883e">
    <div class="pcard-head" data-drag>
      <span class="pcard-dot"></span>
      <span class="pcard-title">SPEAKER SCRIPT · 逐字稿</span>
    </div>
    <div class="pcard-body" id="notes-body"></div>
    <div class="pcard-resize" data-resize></div>
  </div>

  <div class="pcard pcard-timer" id="card-timer" style="--dot-color:#3fb950">
    <div class="pcard-head" data-drag>
      <span class="pcard-dot"></span>
      <span class="pcard-title">TIMER</span>
    </div>
    <div class="pcard-body">
      <div class="timer-display" id="timer-display">00:00</div>
      <div class="timer-row">
        <span class="label">Slide</span>
        <span class="val" id="timer-count">1 / ${total}</span>
      </div>
      <div class="timer-controls">
        <button class="timer-btn" id="btn-prev">← Prev</button>
        <button class="timer-btn" id="btn-next">Next →</button>
        <button class="timer-btn" id="btn-reset">⏱ Reset</button>
      </div>
    </div>
    <div class="pcard-resize" data-resize></div>
  </div>
</div>

<div class="hint-bar">
  <span><kbd>← →</kbd> 翻页</span>
  <span><kbd>R</kbd> 重置计时</span>
  <span><kbd>Esc</kbd> 关闭</span>
  <span style="color:#6e7681">拖动卡片头部移动 · 拖动右下角调整大小</span>
  <button class="reset-layout" id="reset-layout">重置布局</button>
</div>

<script>
(function(){
  var slideMeta = ${metaJSON};
  var total = ${total};
  var idx = ${startIdx};
  var deckUrl = ${deckUrlJSON};
  var STORAGE_KEY = ${JSON.stringify(storageKey)};
  var bc;
  try { bc = new BroadcastChannel(${channelJSON}); } catch(e) {}

  var iframeCur = document.getElementById('iframe-cur');
  var iframeNxt = document.getElementById('iframe-nxt');
  var notesBody = document.getElementById('notes-body');
  var curMeta = document.getElementById('cur-meta');
  var nxtMeta = document.getElementById('nxt-meta');
  var timerDisplay = document.getElementById('timer-display');
  var timerCount = document.getElementById('timer-count');

  /* ===== Default card layout ===== */
  function defaultLayout() {
    var w = window.innerWidth;
    var h = window.innerHeight - 36; /* leave room for hint bar */
    return {
      'card-cur':   { x: 16,        y: 16,            w: Math.round(w*0.55) - 24, h: Math.round(h*0.62) - 16 },
      'card-nxt':   { x: Math.round(w*0.55) + 8, y: 16, w: w - Math.round(w*0.55) - 24, h: Math.round(h*0.42) - 16 },
      'card-notes': { x: Math.round(w*0.55) + 8, y: Math.round(h*0.42) + 8, w: w - Math.round(w*0.55) - 24, h: h - Math.round(h*0.42) - 16 },
      'card-timer': { x: 16,        y: Math.round(h*0.62) + 8, w: Math.round(w*0.55) - 24, h: h - Math.round(h*0.62) - 16 }
    };
  }

  /* ===== Apply / save / restore layout ===== */
  function applyLayout(layout) {
    Object.keys(layout).forEach(function(id){
      var el = document.getElementById(id);
      var l = layout[id];
      if (el && l) {
        el.style.left = l.x + 'px';
        el.style.top = l.y + 'px';
        el.style.width = l.w + 'px';
        el.style.height = l.h + 'px';
      }
    });
    rescaleAll();
  }
  function readLayout() {
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return defaultLayout();
  }
  function saveLayout() {
    var layout = {};
    ['card-cur','card-nxt','card-notes','card-timer'].forEach(function(id){
      var el = document.getElementById(id);
      if (el) {
        layout[id] = {
          x: parseInt(el.style.left,10) || 0,
          y: parseInt(el.style.top,10) || 0,
          w: parseInt(el.style.width,10) || 300,
          h: parseInt(el.style.height,10) || 200
        };
      }
    });
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(layout)); } catch(e) {}
  }

  /* ===== iframe rescale to fit card body ===== */
  function rescaleIframe(iframe) {
    if (!iframe || iframe.style.display === 'none') return;
    var body = iframe.parentElement;
    var cw = body.clientWidth, ch = body.clientHeight;
    if (!cw || !ch) return;
    var s = Math.min(cw / 1920, ch / 1080);
    iframe.style.transform = 'scale(' + s + ')';
    /* Center the scaled iframe in the body */
    var sw = 1920 * s, sh = 1080 * s;
    iframe.style.left = Math.max(0, (cw - sw) / 2) + 'px';
    iframe.style.top = Math.max(0, (ch - sh) / 2) + 'px';
  }
  function rescaleAll() {
    rescaleIframe(iframeCur);
    rescaleIframe(iframeNxt);
  }
  window.addEventListener('resize', rescaleAll);

  /* ===== Drag (move card by header) ===== */
  document.querySelectorAll('[data-drag]').forEach(function(handle){
    handle.addEventListener('mousedown', function(e){
      if (e.button !== 0) return;
      var card = handle.closest('.pcard');
      if (!card) return;
      e.preventDefault();
      card.classList.add('dragging');
      document.body.classList.add('is-dragging-card');
      var startX = e.clientX, startY = e.clientY;
      var startL = parseInt(card.style.left,10) || 0;
      var startT = parseInt(card.style.top,10)  || 0;
      function onMove(ev){
        var nx = Math.max(0, Math.min(window.innerWidth - 100, startL + ev.clientX - startX));
        var ny = Math.max(0, Math.min(window.innerHeight - 50, startT + ev.clientY - startY));
        card.style.left = nx + 'px';
        card.style.top = ny + 'px';
      }
      function onUp(){
        card.classList.remove('dragging');
        document.body.classList.remove('is-dragging-card');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveLayout();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  /* ===== Resize (drag bottom-right corner) ===== */
  document.querySelectorAll('[data-resize]').forEach(function(handle){
    handle.addEventListener('mousedown', function(e){
      if (e.button !== 0) return;
      var card = handle.closest('.pcard');
      if (!card) return;
      e.preventDefault(); e.stopPropagation();
      card.classList.add('resizing');
      document.body.classList.add('is-dragging-card');
      var startX = e.clientX, startY = e.clientY;
      var startW = parseInt(card.style.width,10)  || card.offsetWidth;
      var startH = parseInt(card.style.height,10) || card.offsetHeight;
      function onMove(ev){
        var nw = Math.max(180, startW + ev.clientX - startX);
        var nh = Math.max(100, startH + ev.clientY - startY);
        card.style.width = nw + 'px';
        card.style.height = nh + 'px';
        if (card.querySelector('iframe')) rescaleIframe(card.querySelector('iframe'));
      }
      function onUp(){
        card.classList.remove('resizing');
        document.body.classList.remove('is-dragging-card');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        rescaleAll();
        saveLayout();
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  /* ===== Preview iframe ready tracking =====
   * Each iframe loads the deck ONCE with ?preview=1 on init. Subsequent
   * slide changes are sent via postMessage('preview-goto') so the iframe
   * just toggles visibility of a different .slide — no reload, no flicker.
   */
  var iframeReady = { cur: false, nxt: false };
  var currentTheme = ${themeJSON};
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'preview-ready') return;
    var iframe = null;
    if (e.source === iframeCur.contentWindow) {
      iframeReady.cur = true;
      iframe = iframeCur;
      postPreviewGoto(iframeCur, idx);
    } else if (e.source === iframeNxt.contentWindow) {
      iframeReady.nxt = true;
      iframe = iframeNxt;
      postPreviewGoto(iframeNxt, idx + 1 < total ? idx + 1 : idx);
    }
    /* Sync current theme to the iframe */
    if (iframe && currentTheme) {
      try { iframe.contentWindow.postMessage({ type: 'preview-theme', name: currentTheme }, '*'); } catch(err) {}
    }
    if (iframe) rescaleIframe(iframe);
  });

  function postPreviewGoto(iframe, n) {
    try {
      iframe.contentWindow.postMessage({ type: 'preview-goto', idx: n }, '*');
    } catch(e) {}
  }

  /* ===== Update content =====
   * Smooth (no-reload) navigation: send postMessage to iframes instead of
   * resetting src. Iframes stay loaded, just switch visible .slide.
   */
  function update(n) {
    n = Math.max(0, Math.min(total - 1, n));
    idx = n;

    /* Current preview — postMessage (smooth) */
    if (iframeReady.cur) postPreviewGoto(iframeCur, n);
    curMeta.textContent = (n + 1) + '/' + total;

    /* Next preview */
    if (n + 1 < total) {
      iframeNxt.style.display = '';
      var endEl = document.querySelector('#card-nxt .preview-end');
      if (endEl) endEl.remove();
      if (iframeReady.nxt) postPreviewGoto(iframeNxt, n + 1);
      nxtMeta.textContent = (n + 2) + '/' + total;
    } else {
      iframeNxt.style.display = 'none';
      var body = document.querySelector('#card-nxt .pcard-body');
      if (body && !body.querySelector('.preview-end')) {
        var end = document.createElement('div');
        end.className = 'preview-end';
        end.textContent = '— END OF DECK —';
        body.appendChild(end);
      }
      nxtMeta.textContent = 'END';
    }

    /* Notes */
    var note = slideMeta[n].notes;
    notesBody.innerHTML = note || '<span class="empty">（这一页还没有逐字稿）</span>';

    /* Timer count */
    timerCount.textContent = (n + 1) + ' / ' + total;
  }

  /* ===== Timer ===== */
  var tStart = Date.now();
  setInterval(function(){
    var s = Math.floor((Date.now() - tStart) / 1000);
    var mm = String(Math.floor(s/60)).padStart(2,'0');
    var ss = String(s%60).padStart(2,'0');
    timerDisplay.textContent = mm + ':' + ss;
  }, 1000);
  function resetTimer(){ tStart = Date.now(); timerDisplay.textContent = '00:00'; }

  /* ===== BroadcastChannel sync ===== */
  if (bc) {
    bc.onmessage = function(e){
      if (!e.data) return;
      if (e.data.type === 'go') update(e.data.idx);
      else if (e.data.type === 'theme' && e.data.name) {
        currentTheme = e.data.name;
        /* Forward theme change to preview iframes */
        [iframeCur, iframeNxt].forEach(function(iframe){
          try {
            iframe.contentWindow.postMessage({ type: 'preview-theme', name: e.data.name }, '*');
          } catch(err) {}
        });
      }
    };
  }
  function go(n) {
    update(n);
    if (bc) bc.postMessage({ type: 'go', idx: idx });
  }

  /* ===== Buttons ===== */
  document.getElementById('btn-prev').addEventListener('click', function(){ go(idx - 1); });
  document.getElementById('btn-next').addEventListener('click', function(){ go(idx + 1); });
  document.getElementById('btn-reset').addEventListener('click', resetTimer);
  document.getElementById('reset-layout').addEventListener('click', function(){
    if (confirm('恢复默认卡片布局？')) {
      try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
      applyLayout(defaultLayout());
    }
  });

  /* ===== Keyboard ===== */
  document.addEventListener('keydown', function(e){
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch(e.key) {
      case 'ArrowRight': case ' ': case 'PageDown': go(idx + 1); e.preventDefault(); break;
      case 'ArrowLeft':  case 'PageUp':   go(idx - 1); e.preventDefault(); break;
      case 'Home': go(0); break;
      case 'End':  go(total - 1); break;
      case 'r': case 'R': resetTimer(); break;
      case 'Escape': window.close(); break;
    }
  });

  /* ===== Iframe load → rescale (catches initial size) ===== */
  iframeCur.addEventListener('load', function(){ rescaleIframe(iframeCur); });
  iframeNxt.addEventListener('load', function(){ rescaleIframe(iframeNxt); });

  /* ===== Init =====
   * Load each iframe ONCE with the deck file. After they post
   * 'preview-ready', all subsequent navigation is via postMessage
   * (smooth, no reload, no flicker).
   */
  applyLayout(readLayout());
  iframeCur.src = deckUrl + '?preview=' + (idx + 1);
  if (idx + 1 < total) iframeNxt.src = deckUrl + '?preview=' + (idx + 2);
  /* Initialize notes/timer/count without touching iframes */
  notesBody.innerHTML = slideMeta[idx].notes || '<span class="empty">（这一页还没有逐字稿）</span>';
  curMeta.textContent = (idx + 1) + '/' + total;
  nxtMeta.textContent = (idx + 2) + '/' + total;
  timerCount.textContent = (idx + 1) + ' / ' + total;
})();
</` + `script>
</body></html>`;
    }

    function fullscreen(){ const el=document.documentElement;
      if (!document.fullscreenElement) el.requestFullscreen&&el.requestFullscreen();
      else document.exitFullscreen&&document.exitFullscreen();
    }

    // theme cycling
    const root = document.documentElement;
    const themesAttr = root.getAttribute('data-themes') || document.body.getAttribute('data-themes');
    const themes = themesAttr ? themesAttr.split(',').map(s=>s.trim()).filter(Boolean) : [];
    let themeIdx = 0;

    // Auto-detect theme base path from existing <link id="theme-link">
    let themeBase = root.getAttribute('data-theme-base');
    if (!themeBase) {
      const existingLink = document.getElementById('theme-link');
      if (existingLink) {
        // el.getAttribute('href') gives the raw relative path written in HTML
        const rawHref = existingLink.getAttribute('href') || '';
        const lastSlash = rawHref.lastIndexOf('/');
        themeBase = lastSlash >= 0 ? rawHref.substring(0, lastSlash + 1) : 'assets/themes/';
      } else {
        themeBase = 'assets/themes/';
      }
    }

    function applyTheme(name) {
      let link = document.getElementById('theme-link');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.id = 'theme-link';
        document.head.appendChild(link);
      }
      link.href = themeBase + name + '.css';
      root.setAttribute('data-theme', name);
      const ind = document.querySelector('.theme-indicator');
      if (ind) ind.textContent = name;
    }
    function cycleTheme(fromRemote){
      if (!themes.length) return;
      themeIdx = (themeIdx+1) % themes.length;
      const name = themes[themeIdx];
      applyTheme(name);
      /* Broadcast to other window (audience ↔ presenter) */
      if (!fromRemote && bc) bc.postMessage({ type: 'theme', name: name });
    }

    // animation cycling on current slide
    let animIdx = 0;
    function cycleAnim(){
      animIdx = (animIdx+1) % ANIMS.length;
      const a = ANIMS[animIdx];
      const target = slides[idx].querySelector('[data-anim-target]') || slides[idx];
      ANIMS.forEach(x => target.classList.remove('anim-'+x));
      void target.offsetWidth;
      target.classList.add('anim-'+a);
      target.setAttribute('data-anim', a);
      const ind = document.querySelector('.anim-indicator');
      if (ind) ind.textContent = a;
    }

    document.addEventListener('keydown', function (e) {
      if (e.metaKey||e.ctrlKey||e.altKey) return;
      switch (e.key) {
        case 'ArrowRight': case ' ': case 'PageDown': case 'Enter': go(idx+1); e.preventDefault(); break;
        case 'ArrowLeft': case 'PageUp': case 'Backspace': go(idx-1); e.preventDefault(); break;
        case 'Home': go(0); break;
        case 'End': go(total-1); break;
        case 'f': case 'F': fullscreen(); break;
        case 's': case 'S': openPresenterWindow(); break;
        case 'n': case 'N': toggleNotes(); break;
        case 'o': case 'O': toggleOverview(); break;
        case 't': case 'T': cycleTheme(); break;
        case 'a': case 'A': cycleAnim(); break;
        case 'Escape': toggleOverview(false); toggleNotes(false); break;
      }
    });

    // hash deep-link
    function fromHash(){
      const m = /^#\/(\d+)/.exec(location.hash||'');
      if (m) go(Math.max(0, parseInt(m[1],10)-1));
    }
    window.addEventListener('hashchange', fromHash);
    fromHash();
    go(idx);
  });
})();

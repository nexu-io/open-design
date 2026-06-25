// Open Design web clipper on-page UI.
//
// Three on-page surfaces, all isolated in their own Shadow DOM so page CSS
// can't bleed in (and the extension's own nodes are excluded from captures):
//
//   1. A floating launcher toolbar (page / design system / figma / shot / images / element),
//      led by the Open Design brand mark. HIDDEN by default — turned on from
//      the popup; the preference is remembered. A grip handle on its leading
//      edge drags it anywhere on the page, and the resting spot is remembered.
//   2. A DevTools-style element picker: hover to highlight, click to capture
//      that element as a cropped screenshot + its outerHTML + metadata.
//   3. An image multi-select overlay: pick exactly which page images to save,
//      instead of grabbing them all.
//
// A shared toast (its own host, independent of the toolbar's visibility) is the
// single feedback channel. Captures route through the service worker.

(function () {
  if (window.__odClipperInjected) return;
  const I18N = globalThis.OD_CLIPPER_I18N;
  const locale = I18N?.currentLocale ? I18N.currentLocale() : 'en';
  const t = (key, vars) => (I18N?.t ? I18N.t(key, vars, locale) : key);
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Trusted-Types-safe HTML insertion. Pages that send
  // `require-trusted-types-for 'script'` in their CSP (The Economist and many
  // publishers do) make a plain `el.innerHTML = string` THROW — even here in the
  // content script's isolated world, because we share the host page's DOM and
  // its CSP governs every DOM sink. That throw used to abort this whole script
  // right after the injection guard was set, leaving the page flagged but with
  // no message listener: the popup then reported "Open Design hasn't attached to
  // this page yet" and neither a reload nor the popup's "Refresh page" could
  // recover it. DOMParser is NOT a Trusted Types sink, so parse the markup in a
  // detached document and move the nodes in. `<style>` lands in <head> and the
  // visible nodes in <body>; re-homing both, head first, preserves order.
  function setHTML(root, html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    root.replaceChildren(...doc.head.childNodes, ...doc.body.childNodes);
  }

  // --- shared toast --------------------------------------------------------
  const toastHost = document.createElement('div');
  toastHost.id = 'od-clipper-toast';
  toastHost.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:64px;display:none;background:transparent;margin:0;padding:0;border:0;';
  const toastShadow = toastHost.attachShadow({ mode: 'open' });
  setHTML(toastShadow, `
    <style>
      .toast {
        background: #202020; color: #fff;
        font: 500 12px/1.4 -apple-system, system-ui, sans-serif;
        padding: 8px 13px; border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 8px 28px rgba(0,0,0,0.32);
        opacity: 0; transform: translateY(6px);
        transition: opacity 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1);
        white-space: nowrap;
      }
      .toast.show { opacity: 1; transform: translateY(0); }
      .toast.loading::before {
        content: ''; display: inline-block; vertical-align: -1px; margin-right: 7px;
        width: 11px; height: 11px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.28); border-top-color: #fff;
        animation: odToastSpin 0.7s linear infinite;
      }
      @keyframes odToastSpin { to { transform: rotate(360deg); } }
    </style>
    <div class="toast" id="t"></div>`);
  document.documentElement.appendChild(toastHost);
  const toastEl = toastShadow.getElementById('t');
  let toastTimer = null;
  // A loading toast (opts.loading) shows a spinner and STAYS until the next
  // toast() call replaces it with the success/failure result — so every
  // operation keeps a visible "working…" state through to its outcome.
  function toast(text, opts) {
    const loading = Boolean(opts && opts.loading);
    toastHost.style.display = '';
    toastEl.textContent = text;
    toastEl.classList.add('show');
    toastEl.classList.toggle('loading', loading);
    if (toastTimer) clearTimeout(toastTimer);
    if (!loading) {
      toastTimer = setTimeout(() => {
        toastEl.classList.remove('show');
        toastHost.style.display = 'none';
      }, 2800);
    }
  }

  // --- launcher toolbar ----------------------------------------------------
  const host = document.createElement('div');
  host.id = 'od-clipper-root';
  // Ships anchored TOP-CENTER with a gap from the edge (Figma-style) so the bar
  // reads as a deliberate, prominent surface rather than a corner afterthought.
  // `left:50%` + `translateX(-50%)` keeps it centered through window resizes; the
  // first drag swaps to explicit left/top px and clears the transform (see
  // applyPosition).
  host.style.cssText = 'position:fixed;z-index:2147483646;top:24px;left:50%;transform:translateX(-50%);display:none;background:transparent;margin:0;padding:0;border:0;';
  const shadow = host.attachShadow({ mode: 'open' });
  const ICON = {
    page: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/><path d="M8 13h8"/><path d="M8 17h5"/>',
    system: '<path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M8 8h8"/><path d="M8 12h3"/><path d="M13 12h3"/><path d="M8 16h8"/>',
    figma: '<line x1="22" y1="6" x2="2" y2="6"/><line x1="22" y1="18" x2="2" y2="18"/><line x1="6" y1="2" x2="6" y2="22"/><line x1="18" y1="2" x2="18" y2="22"/>',
    shot: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    region: '<path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/>',
    imgs: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.5-3.5a2 2 0 0 0-2.8 0L5 21"/>',
    element: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2v3.5"/><path d="M12 18.5V22"/><path d="M2 12h3.5"/><path d="M18.5 12H22"/>',
    close: '<path d="M18 6 6 18"/><path d="M6 6l12 12"/>',
  };
  // `data-tip` drives the custom on-hover tooltip below; `aria-label` keeps the
  // control named for assistive tech. We deliberately drop the native `title`
  // so there's no slow, duplicate OS tooltip stacked on ours.
  const btn = (act, title) =>
    `<button data-act="${act}" data-tip="${esc(title)}" aria-label="${esc(title)}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICON[act]}</svg></button>`;
  setHTML(shadow, `
    <style>
      .bar {
        /* Pointer across the whole pill (inherited) so the bar reads as one
           interactive surface — no arrow/hand flicker over the padding, the 2px
           gaps, or the separators. The grip keeps its own grab/grabbing and the
           busy veil resets to default below. */
        cursor: pointer;
        position: relative; /* containing block + isolated stacking context */
        display: flex; align-items: center; gap: 2px; padding: 6px 8px;
        background: rgba(32,32,32,0.94);
        -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
        border: 1px solid rgba(255,255,255,0.08); border-radius: 999px;
        box-shadow: 0 10px 32px rgba(0,0,0,0.34), inset 0 1px 0 rgba(255,255,255,0.06);
        font-family: -apple-system, system-ui, sans-serif;
        animation: odBarIn 280ms cubic-bezier(0.23,1,0.32,1);
      }
      @keyframes odBarIn {
        from { opacity: 0; transform: translateY(12px) scale(0.94); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .brand {
        all: unset; flex: none; width: 30px; height: 30px;
        display: grid; place-items: center; border-radius: 999px; cursor: pointer;
        transition: background 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1);
      }
      .brand svg { width: 22px; height: 22px; display: block; transition: transform 200ms cubic-bezier(0.23,1,0.32,1); }
      .brand:hover { background: rgba(255,255,255,0.12); }
      .brand:hover svg { transform: rotate(-8deg) scale(1.08); }
      .brand:active { transform: scale(0.92); }
      .bar button {
        all: unset; cursor: pointer; width: 34px; height: 34px;
        display: grid; place-items: center; border-radius: 999px;
        color: rgba(255,255,255,0.86);
        transition: background 140ms cubic-bezier(0.23,1,0.32,1), color 140ms cubic-bezier(0.23,1,0.32,1), transform 140ms cubic-bezier(0.23,1,0.32,1);
      }
      .bar button svg { width: 19px; height: 19px; display: block; }
      .bar button:hover { background: rgba(255,255,255,0.14); color: #fff; transform: translateY(-1px); }
      .bar button:active { background: rgba(255,255,255,0.2); transform: translateY(0); }
      .bar .close { width: 28px; height: 28px; color: rgba(255,255,255,0.55); }
      .bar .close svg { width: 16px; height: 16px; }
      .bar .close:hover { color: #fff; background: rgba(255,255,255,0.12); }
      .sep { width: 1px; height: 20px; background: rgba(255,255,255,0.16); margin: 0 4px; }
      /* Drag handle: a grip of dots at the leading edge. Dimmed at rest so it
         stays quiet, brightening on hover to advertise "grab me". The whole bar
         flips to the grabbing cursor while a drag is in flight. */
      .grip {
        all: unset; flex: none; width: 18px; height: 30px;
        display: grid; place-items: center; cursor: grab; touch-action: none;
        color: rgba(255,255,255,0.32); border-radius: 8px;
        transition: background 140ms cubic-bezier(0.23,1,0.32,1), color 140ms cubic-bezier(0.23,1,0.32,1);
      }
      .grip svg { width: 10px; height: 16px; display: block; pointer-events: none; }
      .grip:hover { background: rgba(255,255,255,0.10); color: rgba(255,255,255,0.92); }
      .bar.dragging, .bar.dragging .grip { cursor: grabbing; }
      .bar.dragging .grip { background: rgba(255,255,255,0.16); color: #fff; }
      /* Hover tooltips: a dark pill naming each control, since the icons alone
         don't say what they do. The bar rests at the TOP of the page, so tips
         drop DOWNWARD and never clip off-screen. A short reveal delay keeps them
         from flickering as the pointer sweeps across the row; the bar hides them
         outright mid-drag. These rules sit last so 'position: relative' wins over
         each control's 'all: unset' reset. */
      [data-tip] { position: relative; }
      [data-tip]::after {
        content: attr(data-tip);
        position: absolute; top: calc(100% + 9px); left: 50%;
        transform: translateX(-50%) translateY(-4px);
        padding: 5px 9px; border-radius: 7px;
        background: #202020; color: #fff;
        font: 600 11px/1.3 -apple-system, system-ui, sans-serif;
        letter-spacing: 0.01em; white-space: nowrap;
        border: 1px solid rgba(255,255,255,0.10);
        box-shadow: 0 6px 20px rgba(0,0,0,0.34);
        opacity: 0; pointer-events: none; z-index: 20;
        transition: opacity 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1);
      }
      [data-tip]:hover::after {
        opacity: 1; transform: translateX(-50%) translateY(0); transition-delay: 240ms;
      }
      .bar.dragging [data-tip]::after { opacity: 0; transition-delay: 0ms; }
      /* Busy strip: while a capture is being saved the action buttons are
         swapped IN PLACE for a spinner + a localized, step-by-step progress
         readout (what's happening, which step, roughly how long). The bar stays
         put as a steady reference point instead of vanishing, and — unlike the
         old full-cover veil — the grip and close button stay live, so the bar
         can still be repositioned or dismissed while the capture runs. */
      .actions { display: flex; align-items: center; gap: 2px; }
      .busy {
        display: none; align-items: center; gap: 9px;
        padding: 0 8px 0 6px; max-width: 280px; min-width: 0;
        animation: odBusyIn 200ms cubic-bezier(0.23,1,0.32,1);
      }
      @keyframes odBusyIn { from { opacity: 0; transform: translateX(-4px); } to { opacity: 1; transform: none; } }
      .bar.busy .actions { display: none; }
      .bar.busy .busy { display: flex; }
      .busy-text { display: flex; flex-direction: column; min-width: 0; }
      .busy-title {
        color: #fff; font: 600 12px/1.3 -apple-system, system-ui, sans-serif;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .busy-sub {
        color: rgba(255,255,255,0.54); font: 500 10.5px/1.3 -apple-system, system-ui, sans-serif;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        transition: color 200ms cubic-bezier(0.23,1,0.32,1);
      }
      /* Past the expected wait the sub-line warms to amber + a soft pulse, so the
         "still working, hang tight" reassurance reads as a deliberate state. */
      .bar.busy-slow .busy-sub { color: rgba(255,206,120,0.95); animation: odBusyPulse 1.6s ease-in-out infinite; }
      @keyframes odBusyPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.62; } }
      .spinner {
        flex: none; width: 16px; height: 16px; border-radius: 50%;
        border: 2px solid rgba(255,255,255,0.22); border-top-color: #fff;
        animation: odSpin 640ms linear infinite;
      }
      @keyframes odSpin { to { transform: rotate(360deg); } }
    </style>
    <div class="bar">
      <div class="grip" data-tip="${esc(t('toolbarDrag'))}" aria-label="${esc(t('toolbarDragLabel'))}">
        <svg viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
          <circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/>
          <circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/>
          <circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/>
        </svg>
      </div>
      <a class="brand" href="https://open-design.ai" target="_blank" rel="noopener noreferrer" data-tip="${esc(t('toolbarHomeTip'))}" aria-label="${esc(t('toolbarHomeLabel'))}">
        <svg viewBox="0 0 93 93" fill="#fff" xmlns="http://www.w3.org/2000/svg">
          <path fill-rule="evenodd" clip-rule="evenodd" d="M46.38 17.5c15.85 0 28.7 12.85 28.7 28.7 0 15.85-12.85 28.7-28.7 28.7H21.5a3.82 3.82 0 0 1-3.82-3.82V46.19c0-15.85 12.85-28.7 28.7-28.7Zm0 5.74c-12.68 0-22.96 10.28-22.96 22.96 0 12.68 10.28 22.96 22.96 22.96 12.68 0 22.96-10.28 22.96-22.96 0-12.68-10.28-22.96-22.96-22.96Z"/>
          <path d="M44.59 59.66 35.84 36.64a.94.94 0 0 1 1.18-1.19l23.04 8.91c.95.37.69 1.78-.33 1.78H46.36v13.19c0 1.03-1.41 1.29-1.77.33Z"/>
        </svg>
      </a>
      <span class="sep"></span>
      <div class="actions">
        ${btn('page', t('toolbarCapturePage'))}
        ${btn('system', t('toolbarExtractDesignSystem'))}
        ${btn('figma', t('toolbarDownloadFigma'))}
        ${btn('shot', t('toolbarCaptureScreenshot'))}
        ${btn('region', t('toolbarCaptureRegion'))}
        ${btn('imgs', t('toolbarPickImages'))}
        ${btn('element', t('toolbarPickElement'))}
      </div>
      <div class="busy" role="status" aria-live="polite">
        <span class="spinner"></span>
        <span class="busy-text">
          <span class="busy-title"></span>
          <span class="busy-sub"></span>
        </span>
      </div>
      <span class="sep"></span>
      <button class="close" data-act="close" data-tip="${esc(t('toolbarHide'))}" aria-label="${esc(t('toolbarHide'))}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON.close}</svg></button>
    </div>`);
  document.documentElement.appendChild(host);

  let toolbarVisible = false;
  let imageHoverEnabled = true; // default-on per-image hover capture badge
  let hiddenForCapture = false;
  let savedPos = null; // {left, top} in px, set once the user drags the bar

  function applyVisibility() {
    const show = toolbarVisible && !hiddenForCapture;
    host.style.display = show ? '' : 'none';
    // A position saved while the window was a different size (or while hidden,
    // when the bar had no measurable box) can land off-screen — re-clamp the
    // moment it becomes visible so it's always reachable.
    if (show && savedPos) applyPosition(clampToViewport(savedPos.left, savedPos.top));
  }
  function setVisible(visible, persist) {
    toolbarVisible = Boolean(visible);
    applyVisibility();
    if (persist) {
      try {
        chrome.storage.local.set({ toolbarVisible });
      } catch {
        // storage may be unavailable in some embeds; visibility still applies
      }
    }
  }

  try {
    chrome.storage.local.get(['toolbarVisible', 'imageHoverCapture', 'toolbarPos']).then(
      (s) => {
        if (s && typeof s.imageHoverCapture === 'boolean') imageHoverEnabled = s.imageHoverCapture;
        const p = s && s.toolbarPos;
        if (p && typeof p.left === 'number' && typeof p.top === 'number') {
          savedPos = p;
          applyPosition(p); // applyVisibility re-clamps to the live viewport on show
        }
        setVisible(Boolean(s && s.toolbarVisible), false);
      },
      () => {},
    );
  } catch {
    // ignore — stays hidden, hover capture stays on
  }

  // Delegated per-image hover affordance: one pair of document listeners, gated
  // by `imageHoverEnabled` inside the handler so toggling needs no re-binding.
  document.addEventListener('mouseover', onDocOver, true);
  document.addEventListener('scroll', onDocScroll, true);

  // Toolbar actions sent straight to the worker (no on-page UI of their own).
  const WORKER_ACTIONS = {
    shot: 'captureScreenshot',
    page: 'capturePageToLibrary',
    system: 'captureDesignSystemToLibrary',
    figma: 'downloadFigma',
  };

  shadow.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const act = btn.dataset.act;
      if (act === 'close') return setVisible(false, true);
      if (act === 'imgs') return void pickImages();
      if (act === 'element') return void startElementPick();
      if (act === 'region') return void startRegionPick();

      const type = WORKER_ACTIONS[act];
      if (!type) return;
      // The progress strip stays on the bar for the whole operation. page /
      // system / figma are DOM/IR snapshots that exclude our UI by id, so the
      // bar never leaves the screen; only `shot` (a pixel screenshot) is briefly
      // pulled out for the capture frame, then comes right back with the strip.
      // The result toast is the outcome.
      startBusy(act);
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type });
      } catch {
        stopBusy();
        toast(t('extensionErrorReload'));
        return;
      }
      stopBusy();
      if (!res || !res.ok) {
        toast(res && res.error === 'not running'
          ? t('openDesignStartApp')
          : t('failed', { error: (res && res.error) || t('unknown') }));
        return;
      }
      if (type === 'capturePageToLibrary') {
        if (res.deduped) toast(t('pageAlreadyInLibrary'));
        else {
          // Reduced-fidelity fallback for very large pages: note when some
          // images were left as live links so the save isn't misread as full.
          const base = res.hasFigma ? t('savedPageFigmaShort') : t('savedPageShort');
          toast(res.partialImages ? `${base} (${t('someImagesLeftLinks')})` : base);
        }
      } else if (type === 'captureDesignSystemToLibrary') {
        toast(res.deduped ? t('designSystemAlreadyInLibrary', { suffix: '' }) : t('savedDesignSystemShort'));
      } else if (type === 'downloadFigma') toast(t('figmaDownloaded'));
      else toast(res.deduped ? t('alreadyInLibrary') : t('savedScreenshot'));
    });
  });

  // --- drag-to-move --------------------------------------------------------
  // The bar ships anchored bottom-right (right/bottom). The grip handle lets the
  // user reposition it: on the first drag we flip to left/top anchoring, follow
  // the pointer (clamped inside the viewport), and persist the resting spot so
  // it survives reloads and navigations. A dedicated handle — rather than a
  // drag-anywhere bar — keeps every action button a plain click with no
  // move-vs-click threshold to get wrong.
  const grip = shadow.querySelector('.grip');
  const bar = shadow.querySelector('.bar');
  const busyTitleEl = shadow.querySelector('.busy-title');
  const busySubEl = shadow.querySelector('.busy-sub');
  let dragging = false;
  // Geometry is captured ONCE per drag (pointerdown) so pointermove never forces
  // a synchronous layout read; motion is a compositor-only transform flushed in
  // one rAF per frame, and the resting spot is committed to left/top on release.
  let pointerStartX = 0, pointerStartY = 0;
  let dragOriginLeft = 0, dragOriginTop = 0, dragMaxLeft = 0, dragMaxTop = 0;
  let dragDX = 0, dragDY = 0, dragRaf = 0;

  // --- busy / progress state ----------------------------------------------
  // A capture is a single round-trip to the worker, so we can't read true
  // progress — but a silent spinner breeds wait-anxiety. Instead each operation
  // ships a short, localized SCRIPT of steps with rough timings: the label
  // advances on a timer ("Reading styles…" → "Building asset…" → "Saving…"),
  // the sub-line shows the step counter and a rough ETA, and once the wait
  // crosses the expected budget the sub-line switches to a reassuring "still
  // working, hang tight" message (busy-slow). The grip + close stay live the
  // whole time so the bar can be moved or dismissed mid-capture.
  let busyTimers = [];
  const BUSY_PLANS = {
    page:    { eta: 8,  slowAt: 14000, steps: [
      { key: 'busyPageSnapshot', at: 0 },
      { key: 'busyPageInline',   at: 1800 },
      { key: 'busyPageSaving',   at: 6000 },
    ] },
    system:  { eta: 12, slowAt: 20000, steps: [
      { key: 'busySystemReading',  at: 0 },
      { key: 'busySystemExtract',  at: 2500 },
      { key: 'busySystemBuilding', at: 9000 },
      { key: 'busySystemSaving',   at: 15000 },
    ] },
    figma:   { eta: 10, slowAt: 16000, steps: [
      { key: 'busyFigmaReading',   at: 0 },
      { key: 'busyFigmaBuilding',  at: 2200 },
      { key: 'busyFigmaPreparing', at: 8000 },
    ] },
    shot:    { eta: 4,  slowAt: 8000,  steps: [
      { key: 'busyShotCapturing', at: 0 },
      { key: 'busyShotSaving',    at: 1600 },
    ] },
    region:  { eta: 4,  slowAt: 8000,  steps: [
      { key: 'busyRegionCapturing', at: 0 },
      { key: 'busyRegionSaving',    at: 1600 },
    ] },
    element: { eta: 5,  slowAt: 9000,  steps: [
      { key: 'busyElementCapturing', at: 0 },
      { key: 'busyElementSaving',    at: 1600 },
    ] },
    imgs:    { eta: 6,  slowAt: 11000, steps: [
      { key: 'busyImagesDownloading', at: 0 },
      { key: 'busyImagesSaving',      at: 3000 },
    ] },
  };

  function clearBusyTimers() {
    busyTimers.forEach((id) => clearTimeout(id));
    busyTimers = [];
  }

  // The busy strip widens the bar; if the user had dragged it near the right
  // edge, re-clamp so it can't grow off-screen (and tuck back on stop). The
  // widening is transient, so we preserve the user's chosen resting spot —
  // applyPosition mutates savedPos, so snapshot and restore it around the call.
  function reclampIfMoved() {
    if (!savedPos || host.style.display === 'none') return;
    const keep = savedPos;
    applyPosition(clampToViewport(savedPos.left, savedPos.top));
    savedPos = keep;
  }

  function paintBusyStep(plan, idx, vars) {
    busyTitleEl.textContent = t(plan.steps[idx].key, vars);
    busySubEl.textContent =
      t('busyStepOf', { step: idx + 1, total: plan.steps.length }) +
      ' · ' + t('busyAbout', { sec: plan.eta });
  }

  function startBusy(opKey, vars) {
    const plan = BUSY_PLANS[opKey] || BUSY_PLANS.shot;
    clearBusyTimers();
    bar.classList.remove('busy-slow');
    paintBusyStep(plan, 0, vars);
    bar.classList.add('busy');
    reclampIfMoved();
    // Popup-launched captures can run while the on-page bar is hidden, where the
    // in-bar strip is invisible — mirror the first step as a loading toast so
    // progress is never lost. The result toast replaces it on completion.
    if (!toolbarVisible) toast(t(plan.steps[0].key, vars), { loading: true });
    for (let i = 1; i < plan.steps.length; i++) {
      busyTimers.push(setTimeout(() => paintBusyStep(plan, i, vars), plan.steps[i].at));
    }
    busyTimers.push(setTimeout(() => {
      bar.classList.add('busy-slow');
      busySubEl.textContent = t('busyTakingLonger');
    }, plan.slowAt));
  }

  function stopBusy() {
    clearBusyTimers();
    bar.classList.remove('busy-slow', 'busy');
    reclampIfMoved();
  }

  // Does the bar's on-screen box intersect a capture rect (viewport coords)?
  // Cropped captures (element/region) only need the bar pulled out of frame when
  // it would actually land in the crop; otherwise it stays put with its spinner
  // and never blinks. Both rects are viewport-relative (getBoundingClientRect).
  function barOverlapsRect(r) {
    if (!toolbarVisible || hiddenForCapture) return false;
    const b = host.getBoundingClientRect();
    if (!b.width || !b.height) return false;
    return b.left < r.x + r.width && b.right > r.x && b.top < r.y + r.height && b.bottom > r.y;
  }

  function clampToViewport(left, top) {
    const rect = host.getBoundingClientRect();
    const maxLeft = Math.max(4, window.innerWidth - rect.width - 4);
    const maxTop = Math.max(4, window.innerHeight - rect.height - 4);
    return {
      left: Math.min(Math.max(4, left), maxLeft),
      top: Math.min(Math.max(4, top), maxTop),
    };
  }

  function applyPosition(pos) {
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    // Drop the top-center centering transform so left/top are honored literally.
    host.style.transform = 'none';
    host.style.left = `${pos.left}px`;
    host.style.top = `${pos.top}px`;
    savedPos = pos;
  }

  // One transform write per frame: pointermove only records the (already
  // clamped) delta and asks for a frame; the rAF callback is the sole place that
  // touches the DOM, so a burst of move events collapses into a single paint.
  function flushDrag() {
    dragRaf = 0;
    host.style.transform = `translate3d(${dragDX}px, ${dragDY}px, 0)`;
  }
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    // The one and only layout read of the drag: cache the bar's box and the
    // viewport clamp bounds so every subsequent move is pure arithmetic.
    const rect = host.getBoundingClientRect();
    dragOriginLeft = rect.left;
    dragOriginTop = rect.top;
    dragMaxLeft = Math.max(4, window.innerWidth - rect.width - 4);
    dragMaxTop = Math.max(4, window.innerHeight - rect.height - 4);
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    dragDX = 0;
    dragDY = 0;
    // Anchor to explicit left/top and promote the bar to its own layer; from
    // here the drag is a pure translate, so no layout runs per move.
    host.style.right = 'auto';
    host.style.bottom = 'auto';
    host.style.left = `${dragOriginLeft}px`;
    host.style.top = `${dragOriginTop}px`;
    host.style.transform = 'translate3d(0,0,0)';
    dragging = true;
    bar.classList.add('dragging');
    try { grip.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
  });
  grip.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const left = Math.min(Math.max(4, dragOriginLeft + (e.clientX - pointerStartX)), dragMaxLeft);
    const top = Math.min(Math.max(4, dragOriginTop + (e.clientY - pointerStartY)), dragMaxTop);
    dragDX = left - dragOriginLeft;
    dragDY = top - dragOriginTop;
    if (!dragRaf) dragRaf = requestAnimationFrame(flushDrag);
  });
  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    bar.classList.remove('dragging');
    if (dragRaf) { cancelAnimationFrame(dragRaf); dragRaf = 0; }
    try { grip.releasePointerCapture(e.pointerId); } catch { /* may already be released */ }
    // Bake the compositor transform back into a real left/top resting spot.
    applyPosition(clampToViewport(dragOriginLeft + dragDX, dragOriginTop + dragDY));
    if (savedPos) {
      try {
        chrome.storage.local.set({ toolbarPos: savedPos });
      } catch {
        // storage may be unavailable in some embeds; the move still applies
      }
    }
  }
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);

  // Keep a moved bar on-screen after the window shrinks.
  window.addEventListener('resize', () => {
    if (!savedPos || host.style.display === 'none') return;
    applyPosition(clampToViewport(savedPos.left, savedPos.top));
  });

  // --- element picker (Figma-style: hover highlight + Capture button) ------
  // A full-viewport BLOCKING surface (pointer-events:auto) sits above the page
  // and swallows every mouse event, so the page underneath never navigates or
  // reacts while picking — the previous pointer-events:none design let clicks
  // fall through, so links/cards activated instead of being captured. We
  // hit-test the element under the cursor with elementsFromPoint (skipping our
  // own UI) and draw a highlight box that glides to it, with a label and a
  // floating "Capture" pill. Clicking the element OR the pill captures it;
  // Esc / the ✕ cancels. Wheel is forwarded to the page so off-screen elements
  // stay reachable.
  let pickActive = false;
  let pickHost = null;
  let pickShadow = null;
  let pickSurface = null;
  let boxEl = null;
  let labelEl = null;
  let currentTarget = null;
  let lastPointerX = 0;
  let lastPointerY = 0;

  function buildPicker() {
    if (pickHost) return;
    pickHost = document.createElement('div');
    pickHost.id = 'od-clipper-picker';
    // `background:transparent` defends the full-viewport host against page CSS
    // (e.g. `div { background: … }`) bleeding a tint across the whole screen.
    // The host itself stays hit-testable (no pointer-events:none) so the inner
    // `.surface` can swallow the page's clicks.
    pickHost.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:transparent;margin:0;padding:0;border:0;';
    pickShadow = pickHost.attachShadow({ mode: 'open' });
    setHTML(pickShadow, `
      <style>
        /* Transparent full-viewport surface that intercepts all page pointer
           events so nothing underneath activates while picking. */
        .surface { position: fixed; inset: 0; cursor: crosshair; background: transparent; }
        .box {
          position: fixed; box-sizing: border-box; left: 0; top: 0; width: 0; height: 0;
          border: 2px solid #c96442; background: rgba(201,100,66,0.10); border-radius: 3px;
          box-shadow: 0 0 0 1px rgba(255,255,255,0.5); pointer-events: none; opacity: 0;
          transition: left 110ms cubic-bezier(0.23,1,0.32,1), top 110ms cubic-bezier(0.23,1,0.32,1),
            width 110ms cubic-bezier(0.23,1,0.32,1), height 110ms cubic-bezier(0.23,1,0.32,1),
            opacity 130ms cubic-bezier(0.23,1,0.32,1);
        }
        .box.show { opacity: 1; }
        .label {
          position: absolute; left: -2px; top: -25px; background: #c96442; color: #fff;
          font: 600 11px/1.85 -apple-system, system-ui, sans-serif;
          padding: 0 7px; border-radius: 5px; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.22);
        }
        .chip {
          all: unset; position: absolute; right: -2px; top: -42px; box-sizing: border-box;
          display: inline-flex; align-items: center; gap: 6px; background: #202020; color: #fff;
          font: 600 12px/1 -apple-system, system-ui, sans-serif; padding: 9px 13px; border-radius: 999px;
          cursor: pointer; pointer-events: auto; border: 1px solid rgba(255,255,255,0.12);
          box-shadow: 0 8px 24px rgba(0,0,0,0.32);
          transition: background 130ms cubic-bezier(0.23,1,0.32,1), transform 130ms cubic-bezier(0.23,1,0.32,1);
          white-space: nowrap;
        }
        .chip:hover { background: #c96442; transform: translateY(-1px) scale(1.03); }
        .chip:active { transform: translateY(0) scale(0.98); }
        .chip svg { width: 14px; height: 14px; }
        .hintbar {
          position: fixed; left: 50%; top: 18px; transform: translateX(-50%);
          display: inline-flex; align-items: center; gap: 9px; background: rgba(32,32,32,0.95);
          -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
          color: #fff; font: 500 12.5px/1 -apple-system, system-ui, sans-serif;
          padding: 9px 9px 9px 14px; border-radius: 999px; pointer-events: auto;
          border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 12px 36px rgba(0,0,0,0.36);
          animation: odHintIn 280ms cubic-bezier(0.23,1,0.32,1);
        }
        .hintbar b { font-weight: 700; }
        .hintbar .kbd {
          background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.12);
          border-radius: 5px; padding: 2px 7px; font-size: 11px; font-weight: 600;
        }
        .hintbar [data-act="cancel"] {
          all: unset; cursor: pointer; width: 24px; height: 24px; display: grid; place-items: center;
          border-radius: 999px; color: rgba(255,255,255,0.6); transition: background 130ms, color 130ms;
        }
        .hintbar [data-act="cancel"]:hover { background: rgba(255,255,255,0.14); color: #fff; }
        @keyframes odHintIn { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
      </style>
      <div class="surface" id="surface"></div>
      <div class="hintbar">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e8896a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.5"/><path d="M12 2v3.5"/><path d="M12 18.5V22"/><path d="M2 12h3.5"/><path d="M18.5 12H22"/></svg>
        <span><b>${esc(t('elementPickerTitle'))}</b> &nbsp;·&nbsp; ${esc(t('elementPickerHint'))}</span>
        <span class="kbd">Esc</span>
        <button data-act="cancel" type="button" aria-label="${esc(t('cancel'))}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>
      <div class="box" id="box">
        <div class="label" id="label"></div>
        <button class="chip" id="chip" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
          ${esc(t('capture'))}
        </button>
      </div>`);
    boxEl = pickShadow.getElementById('box');
    labelEl = pickShadow.getElementById('label');
    document.documentElement.appendChild(pickHost);
    // The surface owns the picking interaction. Listeners live on it (not the
    // page) so the page never sees these events; removing the host on teardown
    // takes the listeners with it.
    pickSurface = pickShadow.getElementById('surface');
    pickSurface.addEventListener('mousemove', onMove);
    pickSurface.addEventListener('mousedown', (e) => e.preventDefault()); // no caret/selection flash
    pickSurface.addEventListener('click', onClick);
    pickSurface.addEventListener('wheel', onWheel, { passive: false });
    pickShadow.getElementById('chip').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void commitCapture(currentTarget);
    });
    const cancel = pickShadow.querySelector('[data-act="cancel"]');
    if (cancel) cancel.addEventListener('click', () => endElementPick());
  }

  // Our blocking surface is the topmost element at the cursor, so a plain
  // elementFromPoint would always return our own UI. Walk the full hit stack and
  // return the first element that isn't ours (our shadow hosts surface as the
  // light-DOM host id `od-clipper-*`).
  function isOwnClipperNode(el) {
    if (el === pickHost) return true;
    if (typeof el.id === 'string' && el.id.startsWith('od-clipper-')) return true;
    return Boolean(el.closest && el.closest('[id^="od-clipper-"]'));
  }

  function targetAt(x, y) {
    const stack = typeof document.elementsFromPoint === 'function'
      ? document.elementsFromPoint(x, y)
      : [document.elementFromPoint(x, y)];
    for (const el of stack) {
      if (!el || isOwnClipperNode(el)) continue; // skip our own surface / overlays
      return el;
    }
    return null;
  }

  function positionBox(el) {
    const r = el.getBoundingClientRect();
    boxEl.classList.add('show');
    boxEl.style.left = `${r.left}px`;
    boxEl.style.top = `${r.top}px`;
    boxEl.style.width = `${Math.max(0, r.width)}px`;
    boxEl.style.height = `${Math.max(0, r.height)}px`;
    labelEl.textContent = `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''} · ${Math.round(r.width)}×${Math.round(r.height)}`;
  }

  // Re-aim the highlight at the last known cursor position. Used on hover and
  // after a scroll shifts what's under the (stationary) cursor.
  function refreshTarget() {
    const el = targetAt(lastPointerX, lastPointerY);
    if (!el) return; // over our own UI (chip / hintbar) or nothing → keep the lock
    currentTarget = el;
    if (boxEl) positionBox(el);
  }

  function onMove(e) {
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    refreshTarget();
  }

  function onClick(e) {
    // The surface already blocks the page; just resolve the target and capture.
    e.preventDefault();
    e.stopPropagation();
    const el = targetAt(e.clientX, e.clientY) || currentTarget;
    if (el) void commitCapture(el);
  }

  function onWheel(e) {
    // The surface eats native scroll, so forward it to the page; off-screen
    // elements stay reachable. onPickScroll re-aims the highlight afterwards.
    e.preventDefault();
    window.scrollBy(e.deltaX, e.deltaY);
  }

  function onPickScroll() {
    refreshTarget();
  }

  function onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      endElementPick();
      toast(t('elementPickCancelled'));
    }
  }

  function cssPath(el) {
    if (el.id) return `${el.tagName.toLowerCase()}#${el.id}`;
    let sel = el.tagName.toLowerCase();
    const cls = Array.from(el.classList)
      .filter((c) => !c.startsWith('od-clipper'))
      .slice(0, 2);
    if (cls.length) sel += `.${cls.join('.')}`;
    const parent = el.parentElement;
    if (parent) {
      const sibs = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
      if (sibs.length > 1) sel += `:nth-of-type(${sibs.indexOf(el) + 1})`;
    }
    return sel;
  }

  function describeElement(el, rect) {
    const meta = {
      tag: el.tagName.toLowerCase(),
      classes: Array.from(el.classList).filter((c) => !c.startsWith('od-clipper')).slice(0, 10),
      selector: cssPath(el),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      hasHtml: true,
    };
    if (el.id) meta.id = el.id;
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (text) meta.text = text;
    return meta;
  }

  // Capture the picked element as ONE self-contained HTML asset (styles + its
  // own images inlined) — no screenshot, no separate markup, so the saved card
  // is a single HTML file that opens and shares as the element. We mark the live
  // element so capture.js (run by the worker) can find and prune the page to it,
  // and ALWAYS clear the marker afterwards so we never leave a stray attribute
  // on the page. The bar keeps its progress strip through the save (capture.js
  // strips our own UI, so nothing needs to leave the frame).
  const ELEMENT_MARKER = 'data-od-clip-target';
  async function commitCapture(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      toast(t('elementNoVisibleSize'));
      return;
    }
    const meta = describeElement(el, rect);
    el.setAttribute(ELEMENT_MARKER, '');
    endElementPick();
    startBusy('element');
    let res;
    try {
      res = await chrome.runtime.sendMessage({
        type: 'captureElementHtml',
        meta,
        sourceUrl: location.href,
        sourceTitle: document.title,
      });
    } catch (err) {
      console.warn('[Open Design] element capture failed', err);
      stopBusy();
      toast(t('extensionErrorReload'));
      return;
    } finally {
      el.removeAttribute(ELEMENT_MARKER);
    }
    stopBusy();
    if (!res || !res.ok) {
      toast(res && res.error === 'not running'
        ? t('openDesignStartApp')
        : t('failed', { error: (res && res.error) || t('unknown') }));
      return;
    }
    toast(res.deduped ? t('elementAlreadyInLibrary') : t('elementSaved'));
  }

  function startElementPick() {
    if (pickActive) return;
    endRegionPick(); // on-page picking surfaces are mutually exclusive
    pickActive = true;
    currentTarget = null;
    buildPicker(); // wires mouse/wheel listeners on the surface
    // Esc to cancel; capture-phase scroll so the highlight tracks the page as it
    // moves under a stationary cursor.
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('scroll', onPickScroll, true);
  }

  function endElementPick() {
    pickActive = false;
    currentTarget = null;
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('scroll', onPickScroll, true);
    if (pickHost) {
      pickHost.remove(); // also drops the surface's mouse/wheel listeners
      pickHost = null;
      pickShadow = null;
      pickSurface = null;
      boxEl = null;
      labelEl = null;
    }
  }

  // --- image multi-select overlay ------------------------------------------
  // Collect every picture-worthy image on the page, keeping a reference to the
  // DOM element each one came from so the picker can scroll-to / highlight the
  // source ("where is this from?"). Two sources, since a picker that only walks
  // `document.images` silently misses everything painted as a CSS background
  // (hero banners, section art, avatars): <img> (which already resolves
  // <picture>/srcset via currentSrc) and computed background-image url()s.
  const MAX_PICKER_IMAGES = 300;
  function collectImagesInPage() {
    const out = [];
    const seen = new Set();
    const add = (rawSrc, alt, w, h, el) => {
      if (out.length >= MAX_PICKER_IMAGES) return;
      let src = rawSrc;
      try {
        src = new URL(rawSrc, location.href).href;
      } catch {
        return;
      }
      if (!src || seen.has(src) || !/^https?:/i.test(src)) return;
      seen.add(src);
      out.push({ src, alt: alt || '', w: w || 0, h: h || 0, el });
    };

    for (const el of document.images) {
      const src = el.currentSrc || el.src;
      if (!src) continue;
      // Prefer decoded natural size; fall back to the laid-out box so lazy
      // images that haven't decoded yet still pass the size gate and show.
      let w = el.naturalWidth || 0;
      let h = el.naturalHeight || 0;
      if (!w || !h) {
        const r = el.getBoundingClientRect();
        w = Math.round(r.width);
        h = Math.round(r.height);
      }
      if (Math.max(w, h) < 32) continue;
      add(src, el.alt, w, h, el);
    }

    // Background images. getComputedStyle is the costly call, so gate on the
    // (cheaper) box size first and stop once we've hit the cap.
    const all = document.body ? document.body.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length && out.length < MAX_PICKER_IMAGES; i += 1) {
      const el = all[i];
      if (el.id && el.id.startsWith('od-clipper-')) continue;
      const r = el.getBoundingClientRect();
      if (Math.max(r.width, r.height) < 64) continue; // skip sprite/icon chrome
      const bg = getComputedStyle(el).backgroundImage;
      if (!bg || bg === 'none' || bg.indexOf('url(') === -1) continue;
      const m = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(bg);
      if (m) add(m[1], el.getAttribute('aria-label') || '', Math.round(r.width), Math.round(r.height), el);
    }

    return out;
  }

  let imagePickerHost = null;
  let locateCleanup = null; // tears down an in-progress "find on page" highlight

  function clearLocate() {
    if (locateCleanup) {
      locateCleanup();
      locateCleanup = null;
    }
  }

  function closeImagePicker() {
    clearLocate();
    if (imagePickerHost) {
      imagePickerHost.remove();
      imagePickerHost = null;
    }
  }

  // Draw a page's already-decoded <img> into a small canvas for use as the grid
  // thumbnail. The browser holds the source bitmap once (it's on the page);
  // this keeps only a ~116px copy instead of a second full-res decode per cell —
  // the difference between ~24K and ~2M pixels for a 1920px hero image. Drawing
  // a cross-origin image taints the canvas, but we only ever *display* it (never
  // read pixels back), so that's fine.
  function drawThumbCanvas(srcEl, w, h) {
    try {
      const maxSide = 116 * Math.min(2, window.devicePixelRatio || 1);
      const scale = Math.min(1, maxSide / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(w * scale));
      canvas.height = Math.max(1, Math.round(h * scale));
      canvas.getContext('2d').drawImage(srcEl, 0, 0, canvas.width, canvas.height);
      return canvas;
    } catch {
      return null; // tainted-source draw failure → caller falls back to <img>
    }
  }

  // Build a cell's thumbnail node. Two cheap paths, no extra full-res decode:
  //   • The image is already a decoded <img> on the page → draw it once into a
  //     tiny canvas (instant, no network, ~116px of memory).
  //   • Otherwise (CSS background, not-yet-decoded <img>) → a real <img> with
  //     native loading="lazy", so off-screen cells defer their fetch and the
  //     browser cache usually serves it (the page already loaded it).
  // Returning the node directly (rather than mutating a cell via an observer)
  // keeps rendering synchronous and reliable — nothing can get stuck pending.
  function makeThumb(item) {
    const el = item.el;
    if (el && el.tagName === 'IMG' && el.complete && el.naturalWidth > 0) {
      const canvas = drawThumbCanvas(el, el.naturalWidth, el.naturalHeight);
      if (canvas) {
        canvas.className = 'thumb';
        return canvas;
      }
    }
    const img = document.createElement('img');
    img.className = 'thumb shim'; // shimmer until the bytes arrive
    img.decoding = 'async';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.addEventListener('load', () => img.classList.remove('shim'), { once: true });
    img.addEventListener('error', () => img.classList.remove('shim'), { once: true });
    img.src = item.src;
    return img;
  }

  // "Find on page": dim the picker, smooth-scroll the source element into view,
  // and track it with a pulsing spotlight ring through the scroll (rAF re-reads
  // the rect each frame so it stays glued to the element). Restores the picker
  // after a beat. Lets the user see exactly where a thumbnail came from.
  function locateImage(el) {
    if (!el || !el.isConnected) {
      toast('That image’s source is no longer on the page');
      return;
    }
    clearLocate();
    if (imagePickerHost) {
      imagePickerHost.style.transition = 'opacity 140ms cubic-bezier(0.23,1,0.32,1)';
      imagePickerHost.style.opacity = '0';
      imagePickerHost.style.pointerEvents = 'none';
    }
    const host = document.createElement('div');
    host.id = 'od-clipper-locate';
    host.style.cssText =
      'position:fixed;inset:0;z-index:2147483645;pointer-events:none;margin:0;padding:0;border:0;background:transparent;';
    const sh = host.attachShadow({ mode: 'open' });
    setHTML(
      sh,
      `<style>
        .ring {
          position: fixed; box-sizing: border-box; border: 2px solid #c96442; border-radius: 6px;
          box-shadow: 0 0 0 3px rgba(201,100,66,0.4), 0 0 0 100vmax rgba(13,12,10,0.45);
          animation: od-loc-pulse 1.1s ease-out infinite;
        }
        @keyframes od-loc-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(201,100,66,0.55), 0 0 0 100vmax rgba(13,12,10,0.45); }
          50% { box-shadow: 0 0 0 8px rgba(201,100,66,0.12), 0 0 0 100vmax rgba(13,12,10,0.45); }
        }
      </style><div class="ring" id="ring"></div>`,
    );
    document.documentElement.appendChild(host);
    const ring = sh.getElementById('ring');
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
    let raf = 0;
    const sync = () => {
      const r = el.getBoundingClientRect();
      ring.style.left = `${r.left}px`;
      ring.style.top = `${r.top}px`;
      ring.style.width = `${r.width}px`;
      ring.style.height = `${r.height}px`;
      raf = requestAnimationFrame(sync);
    };
    sync();
    const timer = setTimeout(() => clearLocate(), 1800);
    locateCleanup = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      host.remove();
      if (imagePickerHost) {
        imagePickerHost.style.opacity = '1';
        imagePickerHost.style.pointerEvents = '';
      }
    };
  }

  function pickImages() {
    closeImagePicker();
    const images = collectImagesInPage();
    if (!images.length) {
      toast(t('noImagesFound'));
      return;
    }
    imagePickerHost = document.createElement('div');
    imagePickerHost.id = 'od-clipper-imagepicker';
    imagePickerHost.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:transparent;margin:0;padding:0;border:0;';
    const sh = imagePickerHost.attachShadow({ mode: 'open' });
    setHTML(sh, `
      <style>
        * { box-sizing: border-box; }
        .overlay {
          position: fixed; inset: 0;
          background: rgba(26,25,23,0.5);
          -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);
          display: grid; place-items: center;
          font-family: -apple-system, system-ui, 'Segoe UI', sans-serif;
        }
        .panel {
          width: min(760px, 92vw); max-height: 84vh; display: flex; flex-direction: column;
          background: #fdfcfa; border: 1px solid #e1e5eb; border-radius: 14px; overflow: hidden;
          box-shadow: 0 24px 60px rgba(28,27,26,0.28), 0 8px 16px rgba(28,27,26,0.12);
        }
        .head {
          display: flex; align-items: center; gap: 10px; padding: 13px 16px;
          border-bottom: 1px solid #edf0f4;
        }
        .mark { flex: none; width: 26px; height: 26px; display: block; filter: drop-shadow(0 1px 3px rgba(28,27,26,0.18)); }
        .mark svg { width: 100%; height: 100%; display: block; }
        .title { font-size: 14px; font-weight: 700; letter-spacing: -0.01em; color: #0d0c0a; }
        .count { font-size: 12px; color: #74716b; margin-right: auto; }
        .head button {
          all: unset; cursor: pointer; font-size: 12px; font-weight: 600; color: #b45a3b;
          padding: 5px 8px; border-radius: 6px; transition: background 120ms cubic-bezier(0.23,1,0.32,1);
        }
        .head button:hover { background: #fbeee5; }
        .head .x { color: #989590; font-size: 15px; font-weight: 500; }
        .head .x:hover { background: #eef1f5; color: #1a1916; }
        .grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(116px, 1fr));
          /* Definite row height. Relying on the cell's aspect-ratio under the
             default align-items:stretch produced circular sizing — the auto row
             tried to size from img{height:100%}, which can't resolve against an
             indefinite row, so rows collapsed and thumbnails overlapped. A fixed
             track breaks the cycle and lays every row out cleanly. */
          grid-auto-rows: 116px; align-content: start;
          gap: 10px; padding: 14px 16px; overflow-y: auto; overflow-x: hidden;
          /* min-height:0 lets this flex child shrink below its content so it
             actually scrolls. Without it the default min-height:auto floors the
             grid at full content height: the panel sticks at max-height and
             clips the overflow rows instead of scrolling them. With it, the
             panel hugs the thumbnails when there are few and the grid scrolls
             when there are many. */
          min-height: 0;
        }
        .cell {
          position: relative; min-width: 0; display: block; border: 1px solid #e1e5eb; border-radius: 10px;
          overflow: hidden; cursor: pointer; background: #f4f5f7;
          transition: outline-color 120ms cubic-bezier(0.23,1,0.32,1), border-color 120ms cubic-bezier(0.23,1,0.32,1);
          outline: 2px solid transparent; outline-offset: -2px;
        }
        .cell:hover { border-color: #c9d0da; }
        .cell:has(input:checked) { outline-color: #c96442; border-color: #c96442; }
        .cell .thumb { width: 100%; height: 100%; object-fit: contain; display: block; }
        /* Lazy <img> thumbnails shimmer until their bytes land (canvas thumbs
           never get this class — they're drawn synchronously). */
        .thumb.shim {
          background: linear-gradient(100deg, #eef0f3 30%, #f7f8fa 50%, #eef0f3 70%) #eef0f3;
          background-size: 200% 100%; animation: od-shimmer 1.1s linear infinite;
        }
        @keyframes od-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
        .cell input { position: absolute; top: 8px; left: 8px; width: 18px; height: 18px; margin: 0; accent-color: #c96442; z-index: 2; }
        .loc {
          all: unset; position: absolute; top: 6px; right: 6px; z-index: 2;
          width: 22px; height: 22px; display: grid; place-items: center; cursor: pointer;
          border-radius: 6px; color: #fff; background: rgba(13,12,10,0.5);
          opacity: 0; transition: opacity 120ms cubic-bezier(0.23,1,0.32,1), background 120ms cubic-bezier(0.23,1,0.32,1);
        }
        .cell:hover .loc, .loc:focus-visible { opacity: 1; }
        .loc:hover { background: #c96442; }
        .loc svg { width: 13px; height: 13px; display: block; }
        .dim {
          position: absolute; bottom: 0; left: 0; right: 0; padding: 3px 6px;
          font-size: 10px; color: #fff; background: rgba(13,12,10,0.55); pointer-events: none;
        }
        .foot { display: flex; justify-content: flex-end; padding: 12px 16px; border-top: 1px solid #edf0f4; }
        .save {
          all: unset; cursor: pointer; background: #c96442; color: #fff; font-size: 13px; font-weight: 600;
          padding: 10px 18px; border-radius: 8px;
          box-shadow: 0 1px 2px rgba(28,27,26,0.06);
          transition: background 120ms cubic-bezier(0.23,1,0.32,1);
        }
        .save:hover { background: #b45a3b; }
        .save[disabled] { background: #e0b6a6; cursor: default; box-shadow: none; }
        @media (prefers-color-scheme: dark) {
          .overlay { background: rgba(0,0,0,0.55); }
          .panel { background: #222120; border-color: #333128; box-shadow: 0 24px 60px rgba(0,0,0,0.6); }
          .head { border-bottom-color: #2a2825; }
          .title { color: #f2ede4; }
          .count { color: #9a9690; }
          .head button { color: #e8896a; }
          .head button:hover { background: #2e1a12; }
          .head .x { color: #6e6b65; }
          .head .x:hover { background: #2e2c29; color: #e8e4dc; }
          .cell { background: #252321; border-color: #333128; }
          .cell:hover { border-color: #46433c; }
          .cell:has(input:checked) { outline-color: #d97a56; border-color: #d97a56; }
          .cell input { accent-color: #d97a56; }
          .thumb.shim { background: linear-gradient(100deg, #2a2825 30%, #332f2c 50%, #2a2825 70%) #2a2825; background-size: 200% 100%; }
          .loc { background: rgba(0,0,0,0.55); }
          .loc:hover { background: #d97a56; }
          .foot { border-top-color: #2a2825; }
          .save { background: #d97a56; }
          .save:hover { background: #e8896a; }
          .save[disabled] { background: #5a4036; }
        }
      </style>
      <div class="overlay" id="ov">
        <div class="panel" role="dialog" aria-label="${esc(t('selectImagesToSave'))}">
          <div class="head">
            <span class="mark" aria-hidden="true">
              <svg viewBox="0 0 93 93" xmlns="http://www.w3.org/2000/svg">
                <path d="M93 46.19c0 40.35-6.15 46.5-46.5 46.5C6.15 92.69 0 86.54 0 46.19 0 5.84 6.15-.31 46.5-.31 86.85-.31 93 5.84 93 46.19Z" fill="#202020"/>
                <path fill-rule="evenodd" clip-rule="evenodd" d="M46.38 17.5c15.85 0 28.7 12.85 28.7 28.7 0 15.85-12.85 28.7-28.7 28.7H21.5a3.82 3.82 0 0 1-3.82-3.82V46.19c0-15.85 12.85-28.7 28.7-28.7Zm0 5.74c-12.68 0-22.96 10.28-22.96 22.96 0 12.68 10.28 22.96 22.96 22.96 12.68 0 22.96-10.28 22.96-22.96 0-12.68-10.28-22.96-22.96-22.96Z" fill="#fff"/>
                <path d="M44.59 59.66 35.84 36.64a.94.94 0 0 1 1.18-1.19l23.04 8.91c.95.37.69 1.78-.33 1.78H46.36v13.19c0 1.03-1.41 1.29-1.77.33Z" fill="#fff"/>
              </svg>
            </span>
            <span class="title">${esc(t('selectImagesToSave'))}</span>
            <span class="count" id="count">${esc(t('selectedCount', { selected: 0, total: images.length }))}</span>
            <button data-a="all">${esc(t('selectAll'))}</button>
            <button data-a="none">${esc(t('clear'))}</button>
            <button class="x" data-a="close" aria-label="${esc(t('close'))}">✕</button>
          </div>
          <div class="grid" id="grid"></div>
          <div class="foot"><button class="save" id="save" disabled>${esc(t('saveNToLibrary', { count: 0 }))}</button></div>
        </div>
      </div>`);

    const grid = sh.getElementById('grid');
    // Crosshair "find on page" glyph, reused per cell.
    const LOC_SVG =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 1v3M12 20v3M1 12h3M20 12h3"/></svg>';
    // Build all cells in the detached shadow tree (no reflow until attach).
    // Thumbnails render synchronously: a canvas drawn from the page's decoded
    // <img> (cheap, bounded memory) or a native lazy <img> for URL-load cases.
    const checkboxes = [];
    images.forEach((img, i) => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.__odItem = img;
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.dataset.i = String(i);
      checkbox.setAttribute('aria-label', img.alt || t('imageLabel', { index: i + 1 }));
      const thumb = makeThumb(img);
      const loc = document.createElement('button');
      loc.type = 'button';
      loc.className = 'loc';
      loc.title = t('findOnPage');
      setHTML(loc, LOC_SVG);
      const dim = document.createElement('span');
      dim.className = 'dim';
      dim.textContent = img.w && img.h ? `${img.w}×${img.h}` : '';
      cell.append(checkbox, thumb, loc, dim);
      grid.appendChild(cell);
      checkboxes.push(checkbox);
    });

    const countEl = sh.getElementById('count');
    const saveBtn = sh.getElementById('save');
    // Track the count incrementally so toggling a checkbox is O(1), not an
    // O(n) re-scan of the whole grid on every click.
    let selected = 0;
    function paintCount() {
      countEl.textContent = t('selectedCount', { selected, total: images.length });
      saveBtn.textContent = t('saveNToLibrary', { count: selected });
      saveBtn.disabled = selected === 0;
    }
    grid.addEventListener('change', (e) => {
      if (!(e.target instanceof HTMLInputElement)) return;
      selected += e.target.checked ? 1 : -1;
      paintCount();
    });
    // Cell click toggles selection; the locate button is carved out so "find on
    // page" never also (de)selects the image.
    grid.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const locBtn = target.closest('.loc');
      if (locBtn) {
        e.preventDefault();
        e.stopPropagation();
        const cell = locBtn.closest('.cell');
        if (cell && cell.__odItem) locateImage(cell.__odItem.el);
        return;
      }
      if (target instanceof HTMLInputElement) return; // native toggle fires change
      const cell = target.closest('.cell');
      const cb = cell && cell.querySelector('input');
      if (cb) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    sh.getElementById('ov').addEventListener('click', (e) => {
      const a = e.target instanceof Element ? e.target.getAttribute('data-a') : null;
      if (!a) {
        if (e.target === sh.getElementById('ov')) closeImagePicker();
        return;
      }
      if (a === 'close') closeImagePicker();
      else if (a === 'all') { checkboxes.forEach((c) => (c.checked = true)); selected = images.length; paintCount(); }
      else if (a === 'none') { checkboxes.forEach((c) => (c.checked = false)); selected = 0; paintCount(); }
    });

    saveBtn.addEventListener('click', async () => {
      const chosen = checkboxes.filter((c) => c.checked).map((c) => images[Number(c.dataset.i)]);
      if (!chosen.length) return;
      saveBtn.disabled = true;
      saveBtn.textContent = t('saving');
      closeImagePicker();
      // Progress on the bar through the save, matching every other capture
      // action — the count rides into the busy label, so no separate toast.
      // ingestImages takes no screenshot, so the bar stays put — no blink.
      startBusy('imgs', { count: chosen.length });
      let res;
      try {
        res = await chrome.runtime.sendMessage({
          type: 'ingestImages',
          images: chosen.map((c) => ({ src: c.src, alt: c.alt })),
          sourceUrl: location.href,
          sourceTitle: document.title,
        });
      } catch {
        stopBusy();
        toast(t('extensionErrorReload'));
        return;
      }
      stopBusy();
      if (!res || !res.ok) {
        toast(res && res.error === 'not running'
          ? t('openDesignStartApp')
          : t('failed', { error: (res && res.error) || t('unknown') }));
        return;
      }
      toast(t('savedImagesCount', { count: res.count, total: res.total }));
    });

    document.documentElement.appendChild(imagePickerHost);
  }

  // --- region picker (drag a box → crop the visible tab) -------------------
  // A full-viewport surface with a crosshair. Drag to rubber-band a rectangle;
  // on release the worker screenshots the visible tab and crops to the box. The
  // surface tears down before the capture so none of our UI lands in the frame.
  let regionActive = false;
  let regionHost = null;
  let regionShadow = null;
  let regionRectEl = null;
  let regionStart = null;

  function startRegionPick() {
    if (regionActive) return;
    endElementPick(); // on-page picking surfaces are mutually exclusive
    regionActive = true;
    regionStart = null;
    regionHost = document.createElement('div');
    regionHost.id = 'od-clipper-region';
    regionHost.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:transparent;margin:0;padding:0;border:0;';
    regionShadow = regionHost.attachShadow({ mode: 'open' });
    setHTML(regionShadow, `
      <style>
        .surface { position: fixed; inset: 0; cursor: crosshair; background: rgba(13,12,10,0.04); }
        .sel {
          position: fixed; left: 0; top: 0; width: 0; height: 0; display: none; box-sizing: border-box;
          border: 1.5px solid #fff; outline: 1px solid rgba(201,100,66,0.95); outline-offset: -1.5px;
          box-shadow: 0 0 0 100vmax rgba(13,12,10,0.42), 0 1px 6px rgba(0,0,0,0.35);
        }
        .size {
          position: absolute; left: 0; bottom: -22px; min-width: max-content;
          background: #202020; color: #fff; font: 600 11px/1.6 -apple-system, system-ui, sans-serif;
          padding: 0 6px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .hintbar {
          position: fixed; left: 50%; top: 18px; transform: translateX(-50%); pointer-events: none;
          display: inline-flex; align-items: center; gap: 9px; background: rgba(32,32,32,0.95);
          -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
          color: #fff; font: 500 12.5px/1 -apple-system, system-ui, sans-serif;
          padding: 9px 14px; border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 12px 36px rgba(0,0,0,0.36);
          animation: odHintIn 280ms cubic-bezier(0.23,1,0.32,1);
        }
        .hintbar b { font-weight: 700; }
        .hintbar .kbd { background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.12); border-radius: 5px; padding: 2px 7px; font-size: 11px; font-weight: 600; }
        @keyframes odHintIn { from { opacity: 0; transform: translate(-50%, -12px); } to { opacity: 1; transform: translate(-50%, 0); } }
      </style>
      <div class="surface" id="surface"></div>
      <div class="sel" id="sel"><span class="size" id="size"></span></div>
      <div class="hintbar"><b>${esc(t('dragToSelectRegion'))}</b> &nbsp;${esc(t('dragToSelectRegionTail'))} &nbsp;<span class="kbd">Esc</span></div>`);
    document.documentElement.appendChild(regionHost);
    regionRectEl = regionShadow.getElementById('sel');
    const sizeEl = regionShadow.getElementById('size');
    const surface = regionShadow.getElementById('surface');

    const place = (a, b) => {
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      const w = Math.abs(a.x - b.x);
      const h = Math.abs(a.y - b.y);
      regionRectEl.style.display = 'block';
      regionRectEl.style.left = `${x}px`;
      regionRectEl.style.top = `${y}px`;
      regionRectEl.style.width = `${w}px`;
      regionRectEl.style.height = `${h}px`;
      sizeEl.textContent = `${Math.round(w)} × ${Math.round(h)}`;
      return { x, y, w, h };
    };
    surface.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      regionStart = { x: e.clientX, y: e.clientY };
      place(regionStart, regionStart);
    });
    surface.addEventListener('mousemove', (e) => {
      if (regionStart) place(regionStart, { x: e.clientX, y: e.clientY });
    });
    surface.addEventListener('mouseup', (e) => {
      if (!regionStart) return;
      const r = place(regionStart, { x: e.clientX, y: e.clientY });
      regionStart = null;
      if (r.w < 6 || r.h < 6) {
        toast(t('regionTooSmall'));
        return;
      }
      void commitRegionCapture(r);
    });
    document.addEventListener('keydown', onRegionKey, true);
  }

  function onRegionKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      endRegionPick();
      toast(t('regionCancelled'));
    }
  }

  function endRegionPick() {
    regionActive = false;
    regionStart = null;
    document.removeEventListener('keydown', onRegionKey, true);
    if (regionHost) {
      regionHost.remove();
      regionHost = null;
      regionShadow = null;
      regionRectEl = null;
    }
  }

  async function commitRegionCapture(r) {
    const payloadRect = { x: r.x, y: r.y, width: r.w, height: r.h };
    endRegionPick();
    startBusy('region');
    const hideBar = barOverlapsRect(payloadRect);
    // Two frames so our torn-down picker surface is off the compositor before
    // the worker screenshots.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    let res;
    try {
      res = await chrome.runtime.sendMessage({
        type: 'captureRegion',
        rect: payloadRect,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        sourceUrl: location.href,
        sourceTitle: document.title,
        hideBar,
      });
    } catch {
      stopBusy();
      toast(t('extensionErrorReload'));
      return;
    }
    stopBusy();
    if (!res || !res.ok) {
      toast(res && res.error === 'not running'
        ? t('openDesignStartApp')
        : t('failed', { error: (res && res.error) || t('unknown') }));
      return;
    }
    toast(res.deduped ? t('regionAlreadyInLibrary') : t('regionSaved'));
  }

  // --- per-image hover capture badge ---------------------------------------
  // A single delegated badge that follows the cursor over images, so any image
  // can be clipped in one click. One document-level listener (not per-image)
  // keeps it cheap on image-heavy pages. On by default; toggled from the popup.
  const IMG_HOVER_MIN = 48; // px — ignore icons/sprites smaller than this
  let imgBadgeHost = null;
  let imgBadgeBtn = null;
  let hoveredImg = null;
  let badgeHideTimer = null;

  function buildImageBadge() {
    if (imgBadgeHost) return;
    imgBadgeHost = document.createElement('div');
    imgBadgeHost.id = 'od-clipper-imghover';
    imgBadgeHost.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483645;display:none;background:transparent;margin:0;padding:0;border:0;pointer-events:none;';
    const sh = imgBadgeHost.attachShadow({ mode: 'open' });
    setHTML(sh, `
      <style>
        /* The wrap is the positioned anchor; the badge is the only hit target,
           the tip is a non-interactive label that drops below it. */
        .wrap { position: relative; width: 26px; height: 26px; pointer-events: none; }
        .badge {
          all: unset; pointer-events: auto; cursor: pointer; box-sizing: border-box;
          display: grid; place-items: center; width: 26px; height: 26px; border-radius: 8px;
          background: rgba(32,32,32,0.92); color: #fff;
          -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px);
          border: 1px solid rgba(255,255,255,0.16); box-shadow: 0 4px 14px rgba(0,0,0,0.32);
          transition: background 130ms cubic-bezier(0.23,1,0.32,1), transform 130ms cubic-bezier(0.23,1,0.32,1);
        }
        .badge svg { width: 15px; height: 15px; display: block; }
        .badge:hover { background: #c96442; transform: scale(1.06); }
        .badge:active { transform: scale(0.94); }
        /* Styled hover tip (replaces the slow native title). Right-aligned to the
           badge and dropping down, so it never clips off the right edge where the
           badge sits. Our own pill — fast, on-brand — instead of the OS tooltip. */
        .tip {
          position: absolute; top: calc(100% + 7px); right: 0;
          padding: 5px 9px; border-radius: 7px;
          background: #202020; color: #fff;
          font: 600 11px/1.3 -apple-system, system-ui, 'Segoe UI', sans-serif;
          letter-spacing: 0.01em; white-space: nowrap;
          border: 1px solid rgba(255,255,255,0.10); box-shadow: 0 6px 20px rgba(0,0,0,0.34);
          opacity: 0; transform: translateY(-4px); pointer-events: none;
          transition: opacity 160ms cubic-bezier(0.23,1,0.32,1), transform 160ms cubic-bezier(0.23,1,0.32,1);
        }
        .badge:hover ~ .tip { opacity: 1; transform: translateY(0); transition-delay: 120ms; }
      </style>
      <div class="wrap">
        <button class="badge" id="b" type="button" aria-label="${esc(t('saveImageToLibrary'))}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        </button>
        <span class="tip">${esc(t('saveImageToOpenDesign'))}</span>
      </div>`);
    document.documentElement.appendChild(imgBadgeHost);
    imgBadgeBtn = sh.getElementById('b');
    // The pointer crosses a 1-frame gap between leaving the image and reaching
    // the badge; keep it alive while the cursor is on the button.
    imgBadgeBtn.addEventListener('mouseenter', () => {
      if (badgeHideTimer) clearTimeout(badgeHideTimer);
    });
    imgBadgeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const img = hoveredImg;
      const src = img && (img.currentSrc || img.src);
      if (!src) return;
      hideImageBadge();
      // The badge vanishes on click, so the toast is the only feedback — keep it
      // a spinner that holds until the result replaces it.
      toast(t('savingImage'), { loading: true });
      let res;
      try {
        res = await chrome.runtime.sendMessage({
          type: 'ingestImages',
          images: [{ src, alt: img.alt || '' }],
          sourceUrl: location.href,
          sourceTitle: document.title,
        });
      } catch {
        toast(t('extensionErrorReload'));
        return;
      }
      if (!res || !res.ok) {
        toast(res && res.error === 'not running'
          ? t('openDesignStartApp')
          : t('failed', { error: (res && res.error) || t('unknown') }));
        return;
      }
      toast(res.count ? t('imageSaved') : t('imageSaveFailed'));
    });
  }

  function positionImageBadge(img) {
    const r = img.getBoundingClientRect();
    if (r.width < IMG_HOVER_MIN || r.height < IMG_HOVER_MIN) {
      hideImageBadge();
      return;
    }
    buildImageBadge();
    hoveredImg = img;
    if (badgeHideTimer) clearTimeout(badgeHideTimer);
    imgBadgeHost.style.display = '';
    // Inset into the image's top-right corner; clamp into the viewport.
    const top = Math.max(4, Math.round(r.top + 6));
    const left = Math.min(window.innerWidth - 30, Math.round(r.right - 32));
    imgBadgeHost.style.transform = `translate(${left}px, ${top}px)`;
  }

  function hideImageBadge() {
    hoveredImg = null;
    if (imgBadgeHost) imgBadgeHost.style.display = 'none';
  }

  function scheduleHideBadge() {
    if (badgeHideTimer) clearTimeout(badgeHideTimer);
    badgeHideTimer = setTimeout(hideImageBadge, 140);
  }

  function setImageHover(enabled, persist) {
    imageHoverEnabled = Boolean(enabled);
    if (!imageHoverEnabled) hideImageBadge();
    if (persist) {
      try {
        chrome.storage.local.set({ imageHoverCapture: imageHoverEnabled });
      } catch {
        // storage unavailable — runtime state still applies
      }
    }
  }

  function onDocOver(e) {
    if (!imageHoverEnabled || hiddenForCapture) return;
    const t = e.target;
    // Retargeting collapses shadow children to their host, so hovering our own
    // badge surfaces here as the `od-clipper-imghover` host → keep it alive.
    if (!t || (typeof t.id === 'string' && t.id.startsWith('od-clipper-'))) return;
    if (t.tagName === 'IMG') {
      positionImageBadge(t);
    } else {
      scheduleHideBadge();
    }
  }

  function onDocScroll() {
    // Badge positions are viewport-fixed; a scroll invalidates them. Hide and
    // let the next hover re-place the badge.
    if (hoveredImg) hideImageBadge();
  }

  // --- messages from the popup / service worker ----------------------------
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    switch (msg && msg.type) {
      case 'odClipper:setToolbar':
        setVisible(msg.mode === 'toggle' ? !toolbarVisible : msg.visible, true);
        sendResponse({ ok: true, visible: toolbarVisible });
        return false;
      case 'odClipper:getToolbar':
        sendResponse({ ok: true, visible: toolbarVisible });
        return false;
      case 'odClipper:pickElement':
        startElementPick();
        sendResponse({ ok: true });
        return false;
      case 'odClipper:pickImages':
        pickImages();
        sendResponse({ ok: true });
        return false;
      case 'odClipper:pickRegion':
        startRegionPick();
        sendResponse({ ok: true });
        return false;
      case 'odClipper:setImageHover':
        setImageHover(Boolean(msg.enabled), true);
        sendResponse({ ok: true, enabled: imageHoverEnabled });
        return false;
      case 'odClipper:getImageHover':
        sendResponse({ ok: true, enabled: imageHoverEnabled });
        return false;
      case 'odClipper:ping':
        // Liveness probe — lets the popup distinguish "no content script" from a
        // genuinely broken page and decide whether a reload is warranted.
        sendResponse({ ok: true, alive: true });
        return false;
      case 'odClipper:hideForCapture': {
        // Pull every piece of our on-page UI out of frame for the screenshot:
        // the bar, the cursor-following image badge, and any visible toast.
        hiddenForCapture = true;
        applyVisibility();
        hideImageBadge();
        toastHost.style.display = 'none';
        requestAnimationFrame(() => requestAnimationFrame(() => sendResponse({ ok: true })));
        return true; // async response
      }
      case 'odClipper:restoreAfterCapture':
        hiddenForCapture = false;
        applyVisibility();
        sendResponse({ ok: true });
        return false;
      default:
        return false;
    }
  });

  // Flag the page as attached only now that the listener above is live. If any
  // earlier step had thrown (e.g. a Trusted Types violation on a hostile host
  // page), the guard stays unset so a reload or the popup's "Refresh page"
  // re-injection can retry — instead of short-circuiting on a half-initialized
  // page forever. The whole body above is synchronous, so a concurrent
  // re-injection still sees the guard set before it can run past the top check.
  window.__odClipperInjected = true;
})();

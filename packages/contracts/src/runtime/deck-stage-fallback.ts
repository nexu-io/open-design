const DECK_STAGE_OPEN_TAG_RE = /<deck-stage\b/i;
const DECK_STAGE_FALLBACK_MARKER = 'data-od-deck-stage-fallback';

/**
 * The selector family that identifies a deck's slide elements. Single source of
 * truth shared by the runtime `<deck-stage>` fallback (below) and any host-side
 * static slide extraction (e.g. the web app's shadow-root thumbnail parser), so
 * both agree on what counts as a slide. Ordered structured→generic.
 */
export const DECK_SLIDE_SELECTOR = '.slide, [data-screen-label], .deck-slide, .ppt-slide';

const DECK_STAGE_FALLBACK_SCRIPT = `<script data-od-deck-stage-fallback>(function(){
  if (window.__odDeckStageFallbackInstalled) return;
  window.__odDeckStageFallbackInstalled = true;
  if (!window.customElements || window.customElements.get('deck-stage')) return;

  var ACTIVE_ATTR = 'data-od-deck-active';
  var SLIDE_SELECTOR = ${JSON.stringify(DECK_SLIDE_SELECTOR)};

  function numeric(value, fallback) {
    var n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function isEditableTarget(target) {
    while (target && target !== document.body && target !== document.documentElement) {
      var tag = String(target.tagName || '').toUpperCase();
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        tag === 'BUTTON' ||
        tag === 'A' ||
        target.isContentEditable
      ) {
        return true;
      }
      target = target.parentElement;
    }
    return false;
  }

  function postSlideState(active, count) {
    try {
      window.parent.postMessage({ type: 'od:slide-state', active: active, count: count }, '*');
    } catch (_) {}
  }

  class OdDeckStageFallback extends HTMLElement {
    constructor() {
      super();
      this._index = 0;
      this._slides = [];
      this._onMessage = this._onMessage.bind(this);
      this._onKeydown = this._onKeydown.bind(this);
      this._onResize = this.fit.bind(this);
      this._onSlotChange = this._refresh.bind(this);
      var root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' +
        ':host{position:fixed;inset:0;display:block;overflow:hidden;background:#0a0a0a;}' +
        '.stage{position:absolute;inset:0;display:grid;place-items:center;overflow:hidden;}' +
        '.canvas{position:relative;flex:none;width:var(--od-deck-stage-width,1920px);height:var(--od-deck-stage-height,1080px);transform-origin:center center;}' +
        ':host([noscale]) .canvas{transform:none!important;}' +
        '::slotted(*){visibility:hidden!important;pointer-events:none!important;}' +
        '::slotted([' + ACTIVE_ATTR + ']){visibility:visible!important;pointer-events:auto!important;}' +
        '</style><div class="stage"><div class="canvas"><slot></slot></div></div>';
      this._slot = root.querySelector('slot');
      this._canvas = root.querySelector('.canvas');
    }

    connectedCallback() {
      this._syncSize();
      this._refresh();
      window.addEventListener('message', this._onMessage);
      window.addEventListener('resize', this._onResize);
      document.addEventListener('keydown', this._onKeydown, true);
      if (this._slot) this._slot.addEventListener('slotchange', this._onSlotChange);
      this.fit();
      setTimeout(this._onResize, 50);
      setTimeout(this._onResize, 250);
    }

    disconnectedCallback() {
      window.removeEventListener('message', this._onMessage);
      window.removeEventListener('resize', this._onResize);
      document.removeEventListener('keydown', this._onKeydown, true);
      if (this._slot) this._slot.removeEventListener('slotchange', this._onSlotChange);
    }

    attributeChangedCallback() {
      this._syncSize();
      this.fit();
    }

    static get observedAttributes() {
      return ['width', 'height', 'noscale'];
    }

    get designWidth() {
      return numeric(this.getAttribute('width'), 1920);
    }

    get designHeight() {
      return numeric(this.getAttribute('height'), 1080);
    }

    _syncSize() {
      this.style.setProperty('--od-deck-stage-width', this.designWidth + 'px');
      this.style.setProperty('--od-deck-stage-height', this.designHeight + 'px');
    }

    _collectSlides() {
      var direct = [];
      var nested = Array.prototype.slice.call(this.querySelectorAll(SLIDE_SELECTOR));
      for (var i = 0; i < nested.length; i++) {
        if (nested[i].parentElement === this) direct.push(nested[i]);
      }
      this._slides = direct.length ? direct : nested;
      return this._slides;
    }

    _initialIndex(slides) {
      for (var i = 0; i < slides.length; i++) {
        var cl = slides[i].classList;
        if (cl && (cl.contains('active') || cl.contains('is-active') || cl.contains('current'))) return i;
        if (slides[i].hasAttribute(ACTIVE_ATTR)) return i;
      }
      return 0;
    }

    _refresh() {
      var slides = this._collectSlides();
      this._index = Math.max(0, Math.min(slides.length - 1, this._initialIndex(slides)));
      this._apply();
      this.fit();
    }

    _apply() {
      var slides = this._collectSlides();
      if (!slides.length) {
        postSlideState(0, 0);
        return;
      }
      this._index = Math.max(0, Math.min(slides.length - 1, this._index));
      for (var i = 0; i < slides.length; i++) {
        var on = i === this._index;
        var slide = slides[i];
        slide.toggleAttribute(ACTIVE_ATTR, on);
        slide.toggleAttribute('hidden', false);
        slide.setAttribute('aria-hidden', on ? 'false' : 'true');
        if (slide.classList) {
          slide.classList.toggle('active', on);
          slide.classList.toggle('is-active', on);
          slide.classList.toggle('current', on);
          slide.classList.toggle('visible', on);
        }
      }
      postSlideState(this._index, slides.length);
      try {
        this.dispatchEvent(new CustomEvent('slidechange', {
          detail: { active: this._index, count: slides.length },
          bubbles: true,
        }));
      } catch (_) {}
    }

    fit() {
      if (!this._canvas) return;
      this._syncSize();
      if (this.hasAttribute('noscale')) {
        this._canvas.style.transform = '';
        return;
      }
      var width = this.designWidth;
      var height = this.designHeight;
      var rect = this.getBoundingClientRect();
      var scale = Math.min(rect.width / width, rect.height / height);
      if (!Number.isFinite(scale) || scale <= 0) return;
      this._canvas.style.transform = 'scale(' + scale + ')';
    }

    go(action, index) {
      var slides = this._collectSlides();
      if (!slides.length) return;
      if (action === 'go' && typeof index === 'number') {
        this._index = index;
      } else if (action === 'next') {
        this._index += 1;
      } else if (action === 'prev') {
        this._index -= 1;
      } else if (action === 'first') {
        this._index = 0;
      } else if (action === 'last') {
        this._index = slides.length - 1;
      }
      this._apply();
    }

    _onMessage(ev) {
      var data = ev && ev.data;
      if (!data || data.type !== 'od:slide') return;
      this.go(data.action, data.index);
    }

    _onKeydown(ev) {
      if (!ev || isEditableTarget(ev.target)) return;
      var key = ev.key;
      if (key === 'Escape') {
        try { window.parent.postMessage({ type: 'od:present-escape' }, '*'); } catch (_) {}
        return;
      }
      if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.shiftKey) return;
      var action = '';
      if (key === 'ArrowRight' || key === 'PageDown' || key === ' ') action = 'next';
      else if (key === 'ArrowLeft' || key === 'PageUp') action = 'prev';
      else if (key === 'Home') action = 'first';
      else if (key === 'End') action = 'last';
      else if (String(key).toLowerCase() === 'r') action = 'first';
      if (!action) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.go(action);
    }
  }

  try {
    window.customElements.define('deck-stage', OdDeckStageFallback);
  } catch (_) {}
})();</script>`;

export function htmlUsesDeckStageElement(html: string): boolean {
  return DECK_STAGE_OPEN_TAG_RE.test(html);
}

export function injectDeckStageFallback(html: string): string {
  if (!htmlUsesDeckStageElement(html)) return html;
  if (html.includes(DECK_STAGE_FALLBACK_MARKER)) return html;
  return injectBeforeBodyEnd(html, DECK_STAGE_FALLBACK_SCRIPT);
}

function injectBeforeBodyEnd(html: string, injection: string): string {
  const match = /<\/body\s*>/i.exec(html);
  if (!match) return html + injection;
  return html.slice(0, match.index) + injection + html.slice(match.index);
}

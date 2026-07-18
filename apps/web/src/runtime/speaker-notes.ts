export type SpeakerNotesPresenterLabels = {
  title: string;
  edit: string;
  save: string;
  pause: string;
  resume: string;
  reset: string;
  previous: string;
  next: string;
  empty: string;
  slide: string;
};

export const PRESENTER_WINDOW_INITIAL_WIDTH = 1320;
export const PRESENTER_WINDOW_INITIAL_HEIGHT = 820;
export const PRESENTER_WINDOW_MIN_WIDTH = 720;
export const PRESENTER_WINDOW_MIN_HEIGHT = 640;

type ScriptBlock = {
  start: number;
  end: number;
  open: string;
  body: string;
  close: string;
};

const SCRIPT_OPEN_RE = /<script\b[^>]*>/gi;
const SCRIPT_CLOSE_RE = /<\/script\s*>/gi;
const SPEAKER_NOTES_ID_RE = /\bid\s*=\s*(?:"speaker-notes"|'speaker-notes'|speaker-notes)(?=[\s/>])/i;

export function normalizeSpeakerNotes(notes: readonly string[], slideCount = 0): string[] {
  const count = Math.max(slideCount, notes.length, 0);
  const next = Array.from({ length: count }, (_, index) => notes[index] ?? '');
  while (next.length > 0 && next[next.length - 1]?.trim() === '') next.pop();
  return next;
}

export function extractSpeakerNotesFromHtml(source: string | null | undefined, slideCount = 0): string[] {
  if (!source) return normalizeSpeakerNotes([], slideCount);
  const jsonNotes = extractSpeakerNotesJson(source);
  if (jsonNotes.length > 0) return normalizeSpeakerNotes(jsonNotes, slideCount);
  const inlineNotes = extractInlineSlideNotes(source);
  if (inlineNotes.length > 0) return normalizeSpeakerNotes(inlineNotes, slideCount);
  return normalizeSpeakerNotes([], slideCount);
}

export function removeSpeakerNotesFromHtml(source: string): string {
  const block = findSpeakerNotesScriptBlock(source);
  if (!block) return source;
  return `${source.slice(0, block.start)}${source.slice(block.end)}`;
}

export function upsertSpeakerNotesInHtml(source: string, notes: readonly string[]): string {
  const normalized = normalizeSpeakerNotes(notes);
  const json = safeJsonForScript(normalized);
  const block = findSpeakerNotesScriptBlock(source);
  if (block) {
    return `${source.slice(0, block.start)}${block.open}\n${json}\n${block.close}${source.slice(block.end)}`;
  }
  const notesBlock = `\n<script type="application/json" id="speaker-notes">\n${json}\n</script>\n`;
  if (/<\/body\s*>/i.test(source)) {
    return source.replace(/<\/body\s*>/i, `${notesBlock}</body>`);
  }
  return `${source.trimEnd()}${notesBlock}`;
}

function buildPresenterFrameHtml(previewHtml: string): string {
  const chromeHidingStyle = `<style data-od-presenter-frame-chrome>
.deck-counter,
.deck-hint,
.deck-nav,
.deck-floating-nav,
.deck-floating-reset,
.deck-controls,
.slide-nav,
.slides-nav,
.slide-controls,
.slide-counter,
.presentation-nav,
.presentation-controls,
[role="navigation"][aria-label*="Deck"],
[role="navigation"][aria-label*="deck"],
[role="navigation"][aria-label*="Slide"],
[role="navigation"][aria-label*="slide"],
[data-deck-nav],
[data-slide-nav] {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
</style>`;
  if (/<\/head\s*>/i.test(previewHtml)) {
    return previewHtml.replace(/<\/head\s*>/i, `${chromeHidingStyle}</head>`);
  }
  return `${chromeHidingStyle}${previewHtml}`;
}

export function buildSpeakerNotesPresenterHtml(options: {
  previewHtml: string;
  previewHtmlBySlide?: readonly string[];
  labels: SpeakerNotesPresenterLabels;
  title: string;
  projectId: string;
  fileName: string;
  notes: readonly string[];
  initialSlideIndex: number;
  slideCount: number;
}): string {
  const count = Math.max(options.slideCount, options.notes.length, 1);
  const previewHtmlBySlide = Array.isArray(options.previewHtmlBySlide)
    ? options.previewHtmlBySlide.map((html) => buildPresenterFrameHtml(String(html ?? '')))
    : [];
  const data = {
    previewHtml: buildPresenterFrameHtml(options.previewHtml),
    previewHtmlBySlide,
    title: options.title,
    projectId: options.projectId,
    fileName: options.fileName,
    notes: normalizeSpeakerNotes(options.notes, count),
    initialSlideIndex: clampInt(options.initialSlideIndex, 0, count - 1),
    slideCount: count,
    labels: options.labels,
  };

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(options.title)} - Presenter view</title>
  <style>
    * { box-sizing: border-box; }
    :root {
      --presenter-min-width: ${PRESENTER_WINDOW_MIN_WIDTH}px;
      --presenter-min-height: ${PRESENTER_WINDOW_MIN_HEIGHT}px;
    }
    html {
      margin: 0;
      width: 100%;
      height: 100%;
      min-width: var(--presenter-min-width);
      min-height: var(--presenter-min-height);
      overflow: auto;
      background: #171717;
      color: #f3f3f3;
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      width: 100%;
      height: 100%;
      min-width: var(--presenter-min-width);
      min-height: var(--presenter-min-height);
      overflow: hidden;
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr);
      background: #171717;
      color: #f3f3f3;
      font: inherit;
    }
    button {
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 8px;
      background: #242424;
      color: inherit;
      font: inherit;
      font-weight: 600;
      min-height: 44px;
      padding: 8px 12px;
      cursor: pointer;
      white-space: nowrap;
    }
    button:hover { background: #2e2e2e; }
    button:disabled { opacity: 0.45; cursor: default; }
    .stage { min-width: 0; min-height: 0; padding: 18px; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: 14px; border-right: 1px solid #303030; }
    .topbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; min-width: 0; }
    .timer { font-size: 30px; line-height: 1; font-weight: 800; letter-spacing: 0; font-variant-numeric: tabular-nums; margin-right: 2px; white-space: nowrap; }
    .counter { margin-left: auto; color: #bdbdbd; font-size: 18px; line-height: 1.1; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .current { position: relative; min-height: 0; border: 1px solid #2e2e2e; border-radius: 10px; overflow: hidden; background: #080808; cursor: pointer; transition: border-color 140ms cubic-bezier(0.23, 1, 0.32, 1); }
    .current:hover { border-color: #4a4a4a; }
    /* Preview decks are non-interactive so keyboard nav always reaches THIS
       presenter window (not a focused child iframe) and clicks bubble up to the
       frame's own click-to-navigate handler. */
    iframe { display: block; width: 100%; height: 100%; border: 0; background: white; pointer-events: none; }
    .filmstrip { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; min-height: 168px; }
    .filmstrip section { min-width: 0; cursor: pointer; }
    /* Pin each cell to its own column so "Previous" always sits on the left and
       "Next" always sits on the right, even when the other end is hidden (first
       slide has no previous, last slide has no next). Without explicit columns,
       hiding one cell would let the remaining one collapse into column 1. */
    #previous-section { grid-column: 1; }
    #next-section { grid-column: 2; }
    .filmstrip section[hidden] { display: none; }
    .thumb-label { color: #8f8f8f; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
    .thumb-frame { height: 160px; border: 1px solid #2f2f2f; border-radius: 8px; overflow: hidden; background: #101010; transition: border-color 140ms cubic-bezier(0.23, 1, 0.32, 1); }
    .filmstrip section:hover .thumb-frame { border-color: #4a4a4a; }
    .notes { min-width: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); background: #1b1b1b; }
    .notes-head { height: 58px; display: flex; align-items: center; gap: 14px; padding: 0 22px; border-bottom: 1px solid #303030; }
    .notes-title { font-size: 16px; font-weight: 800; color: #d6d6d6; }
    .notes-body { min-height: 0; padding: 28px; overflow: auto; cursor: text; }
    .note-text { white-space: pre-wrap; font-size: 21px; line-height: 1.58; font-weight: 600; color: #eeeeee; }
    .note-text:focus-visible { outline: 2px solid #6da2ff; outline-offset: 6px; border-radius: 8px; }
    .note-empty { color: #777; font-weight: 600; }
    textarea {
      width: 100%;
      min-height: 260px;
      resize: vertical;
      border-radius: 10px;
      border: 1px solid #3a3a3a;
      background: #111;
      color: #f5f5f5;
      padding: 14px;
      font: 18px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .notes-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
    @media (max-width: 980px) {
      body { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) minmax(200px, 0.55fr); }
      .stage { border-right: 0; border-bottom: 1px solid #303030; }
      .filmstrip { gap: 10px; min-height: 96px; }
      .thumb-label { font-size: 11px; margin-bottom: 4px; }
      .thumb-frame { height: 86px; border-radius: 7px; }
      .notes-head { height: auto; min-height: 58px; padding: 12px 22px; }
      .notes-body { padding: 22px; }
      .note-text { font-size: 20px; }
    }
    @media (max-width: 720px), (max-height: 640px) {
      .stage { padding: 14px; gap: 12px; }
      .timer { font-size: 28px; }
      .counter { font-size: 16px; }
      button { min-height: 40px; padding: 7px 11px; }
      .filmstrip { gap: 8px; min-height: 82px; }
      .thumb-frame { height: 74px; }
      .notes-body { padding: 20px; }
      .note-text { font-size: 18px; line-height: 1.55; }
      textarea { min-height: 180px; font-size: 16px; }
    }
  </style>
</head>
<body>
  <main class="stage">
    <div class="topbar">
      <div class="timer" id="timer">0:00</div>
      <button type="button" id="pause"></button>
      <button type="button" id="reset"></button>
      <div class="counter" id="counter"></div>
    </div>
    <div class="current"><iframe id="current" title="Current slide" sandbox="allow-scripts"></iframe></div>
    <div class="filmstrip">
      <section id="previous-section">
        <div class="thumb-label" id="previous-label"></div>
        <div class="thumb-frame"><iframe id="previous" title="Previous slide" sandbox="allow-scripts"></iframe></div>
      </section>
      <section id="next-section">
        <div class="thumb-label" id="next-label"></div>
        <div class="thumb-frame"><iframe id="next" title="Next slide" sandbox="allow-scripts"></iframe></div>
      </section>
    </div>
  </main>
  <aside class="notes">
    <div class="notes-head">
      <div>
        <div class="notes-title" id="notes-title"></div>
        <div class="thumb-label" id="slide-label"></div>
      </div>
    </div>
    <div class="notes-body" id="notes-body"></div>
  </aside>
  <script type="application/json" id="od-presenter-data">${jsonForHtmlScript(data)}</script>
  <script>
    (function(){
      var data = JSON.parse(document.getElementById('od-presenter-data').textContent || '{}');
      var labels = data.labels || {};
      var notes = Array.isArray(data.notes) ? data.notes.slice() : [];
      var count = Math.max(Number(data.slideCount) || 1, notes.length, 1);
      var index = Math.max(0, Math.min(count - 1, Number(data.initialSlideIndex) || 0));
      var paused = false;
      var startedAt = Date.now();
      var pausedMs = 0;
      var timerId = 0;
      var resizeEnforceTimer = 0;
      var minWindowWidth = ${PRESENTER_WINDOW_MIN_WIDTH};
      var minWindowHeight = ${PRESENTER_WINDOW_MIN_HEIGHT};
      var els = {
        timer: document.getElementById('timer'),
        pause: document.getElementById('pause'),
        reset: document.getElementById('reset'),
        counter: document.getElementById('counter'),
        current: document.getElementById('current'),
        previous: document.getElementById('previous'),
        next: document.getElementById('next'),
        previousSection: document.getElementById('previous-section'),
        nextSection: document.getElementById('next-section'),
        previousLabel: document.getElementById('previous-label'),
        nextLabel: document.getElementById('next-label'),
        notesTitle: document.getElementById('notes-title'),
        slideLabel: document.getElementById('slide-label'),
        notesBody: document.getElementById('notes-body')
      };
      function enforceMinimumWindowSize(){
        var innerWidth = window.innerWidth || document.documentElement.clientWidth || minWindowWidth;
        var innerHeight = window.innerHeight || document.documentElement.clientHeight || minWindowHeight;
        if (innerWidth >= minWindowWidth && innerHeight >= minWindowHeight) return;
        var outerWidth = window.outerWidth || innerWidth;
        var outerHeight = window.outerHeight || innerHeight;
        var chromeWidth = Math.max(0, outerWidth - innerWidth);
        var chromeHeight = Math.max(0, outerHeight - innerHeight);
        var nextWidth = Math.max(outerWidth, minWindowWidth + chromeWidth);
        var nextHeight = Math.max(outerHeight, minWindowHeight + chromeHeight);
        try { window.resizeTo(nextWidth, nextHeight); } catch (_) {}
      }
      function scheduleMinimumWindowSize(){
        window.clearTimeout(resizeEnforceTimer);
        resizeEnforceTimer = window.setTimeout(enforceMinimumWindowSize, 80);
      }
      els.pause.textContent = labels.pause || 'Pause';
      els.reset.textContent = labels.reset || 'Reset';
      els.previousLabel.textContent = labels.previous || 'Previous';
      els.nextLabel.textContent = labels.next || 'Next';
      els.notesTitle.textContent = labels.title || 'Speaker notes';
      function fmt(ms){
        var s = Math.max(0, Math.floor(ms / 1000));
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      }
      function tick(){
        var elapsed = paused ? pausedMs : pausedMs + Date.now() - startedAt;
        els.timer.textContent = fmt(elapsed);
      }
      function send(type, payload){
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(Object.assign({
              type: type,
              projectId: data.projectId,
              fileName: data.fileName
            }, payload || {}), '*');
          }
        } catch (_) {}
      }
      // Suppress a stale host echo from snapping us back right after a local
      // move: the host mirrors our navigation back as presenter-slide-state, and
      // a slow round-trip can still carry the pre-move index. Inside this guard
      // window we only accept a host index that matches where we already are.
      var localNavGuardUntil = 0;
      function htmlFor(target){
        if (Array.isArray(data.previewHtmlBySlide) && data.previewHtmlBySlide[target]) {
          return data.previewHtmlBySlide[target];
        }
        return data.previewHtml || '';
      }
      function postGo(frame, target){
        try { frame.contentWindow.postMessage({ type: 'od:slide', action: 'go', index: target }, '*'); } catch (_) {}
      }
      // Load each preview deck exactly once, then drive it by postMessage so a
      // slide change is a smooth in-deck transition instead of a full iframe
      // reload/flash on every keypress. Out-of-range targets (before the first
      // slide, past the last) return false so their filmstrip cell is hidden.
      function setFrame(frame, target){
        if (!frame) return false;
        var st = frame.__od || (frame.__od = { loaded: false, ready: false, want: -1 });
        if (target < 0 || target >= count) { st.want = -1; return false; }
        st.want = target;
        if (!st.loaded) {
          st.loaded = true;
          frame.addEventListener('load', function(){
            st.ready = true;
            if (st.want >= 0) postGo(frame, st.want);
          });
          frame.srcdoc = htmlFor(target);
        } else if (st.ready) {
          postGo(frame, target);
        }
        return true;
      }
      function noteAt(i){ return String(notes[i] || ''); }
      var editing = false;
      var activeTextarea = null;
      var saveActiveEdit = null;
      var suppressNotesEditClickUntil = 0;
      function beginEdit(){
        if (editing) return;
        editing = true;
        renderNotes();
      }
      function handleNotesBodyMouseDown(ev){
        if (!editing || !activeTextarea) return;
        var target = ev.target;
        if (target === activeTextarea || (target && activeTextarea.contains && activeTextarea.contains(target))) return;
        suppressNotesEditClickUntil = Date.now() + 800;
      }
      function handleNotesBodyClick(){
        if (suppressNotesEditClickUntil && Date.now() <= suppressNotesEditClickUntil) {
          suppressNotesEditClickUntil = 0;
          return;
        }
        suppressNotesEditClickUntil = 0;
        beginEdit();
      }
      function renderNotes(){
        var note = noteAt(index);
        els.slideLabel.textContent = (labels.slide || 'Slide {current} / {total}')
          .replace('{current}', String(index + 1))
          .replace('{total}', String(count));
        els.notesBody.textContent = '';
        if (editing) {
          var textarea = document.createElement('textarea');
          textarea.value = note;
          textarea.placeholder = labels.empty || '';
          activeTextarea = textarea;
          var didSave = false;
          function saveAndClose(){
            if (didSave) return;
            didSave = true;
            notes[index] = textarea.value;
            editing = false;
            activeTextarea = null;
            saveActiveEdit = null;
            send('od:presenter-notes-save', { notes: notes });
            renderNotes();
          }
          saveActiveEdit = saveAndClose;
          textarea.addEventListener('blur', function(){
            window.setTimeout(function(){
              if (document.activeElement !== textarea) saveAndClose();
            }, 0);
          });
          els.notesBody.appendChild(textarea);
          textarea.focus();
        } else {
          var div = document.createElement('div');
          div.className = note.trim() ? 'note-text' : 'note-text note-empty';
          div.tabIndex = 0;
          div.setAttribute('role', 'textbox');
          div.setAttribute('aria-readonly', 'true');
          div.textContent = note.trim() ? note : (labels.empty || '');
          div.addEventListener('keydown', function(ev){
            if (ev.key === 'Enter') {
              ev.preventDefault();
              beginEdit();
            }
          });
          els.notesBody.appendChild(div);
        }
      }
      function render(){
        els.counter.textContent = (index + 1) + ' / ' + count;
        setFrame(els.current, index);
        var hasPrevious = setFrame(els.previous, index - 1);
        var hasNext = setFrame(els.next, index + 1);
        if (els.previousSection) els.previousSection.hidden = !hasPrevious;
        if (els.nextSection) els.nextSection.hidden = !hasNext;
        renderNotes();
      }
      function go(next, fromHost){
        var target = Math.max(0, Math.min(count - 1, next));
        if (target === index) {
          // Already here — a host echo may still carry fresh notes/count.
          if (fromHost) renderNotes();
          return;
        }
        index = target;
        editing = false;
        activeTextarea = null;
        saveActiveEdit = null;
        render();
        if (!fromHost) {
          localNavGuardUntil = Date.now() + 600;
          send('od:presenter-slide-go', { index: index });
        }
      }
      function closePresenter(){
        send('od:presenter-close', {});
        try { window.close(); } catch (_) {}
      }
      els.pause.onclick = function(){
        if (paused) {
          paused = false;
          startedAt = Date.now();
          els.pause.textContent = labels.pause || 'Pause';
        } else {
          paused = true;
          pausedMs += Date.now() - startedAt;
          els.pause.textContent = labels.resume || 'Resume';
        }
        tick();
      };
      els.reset.onclick = function(){
        startedAt = Date.now();
        pausedMs = 0;
        tick();
        go(0);
      };
      els.notesBody.addEventListener('mousedown', handleNotesBodyMouseDown);
      els.notesBody.addEventListener('click', handleNotesBodyClick);
      // Clicking any preview cell navigates: the current stage advances, the
      // filmstrip cells jump to that slide. The iframes are pointer-events:none
      // so these clicks always land on the cell, never inside the deck.
      var currentStage = document.querySelector('.current');
      if (currentStage) currentStage.addEventListener('click', function(){ go(index + 1); });
      if (els.previousSection) els.previousSection.addEventListener('click', function(){ go(index - 1); });
      if (els.nextSection) els.nextSection.addEventListener('click', function(){ go(index + 1); });
      window.addEventListener('keydown', function(ev){
        if (ev.target && (ev.target.tagName === 'TEXTAREA' || ev.target.tagName === 'INPUT')) return;
        if (ev.key === 'Escape') { ev.preventDefault(); closePresenter(); return; }
        if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ') { ev.preventDefault(); go(index + 1); }
        else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') { ev.preventDefault(); go(index - 1); }
        else if (ev.key === 'Home') { ev.preventDefault(); go(0); }
        else if (ev.key === 'End') { ev.preventDefault(); go(count - 1); }
      });
      window.addEventListener('message', function(ev){
        var msg = ev.data || {};
        if (msg.type !== 'od:presenter-slide-state') return;
        if (msg.projectId !== data.projectId || msg.fileName !== data.fileName) return;
        if (Array.isArray(msg.notes)) notes = msg.notes.slice();
        if (typeof msg.count === 'number' && msg.count > 0) count = Math.max(1, Math.floor(msg.count));
        if (typeof msg.active === 'number') {
          var active = Math.floor(msg.active);
          // Ignore a stale echo of our own just-made move; otherwise follow host.
          if (Date.now() < localNavGuardUntil && active !== index) {
            renderNotes();
            return;
          }
          go(active, true);
        } else {
          renderNotes();
        }
      });
      timerId = window.setInterval(tick, 250);
      window.addEventListener('resize', scheduleMinimumWindowSize);
      window.addEventListener('beforeunload', function(){
        window.clearInterval(timerId);
        window.clearTimeout(resizeEnforceTimer);
      });
      enforceMinimumWindowSize();
      tick();
      render();
    })();
  </script>
</body>
</html>`;
}

function extractSpeakerNotesJson(source: string): string[] {
  const block = findSpeakerNotesScriptBlock(source);
  if (!block) return [];
  const raw = block.body.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((item) => String(item ?? '').trim());
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { notes?: unknown }).notes)) {
      return (parsed as { notes: unknown[] }).notes.map((item) => String(item ?? '').trim());
    }
  } catch {
    // Invalid JSON is not a usable notes payload. Older regex-based parsing
    // could accidentally target deck runtime comments that merely mentioned
    // the speaker-notes tag; treating that tail as plain text produced long
    // garbage notes in template-created decks.
  }
  return [];
}

function findSpeakerNotesScriptBlock(source: string): ScriptBlock | null {
  SCRIPT_OPEN_RE.lastIndex = 0;
  let openMatch: RegExpExecArray | null;
  while ((openMatch = SCRIPT_OPEN_RE.exec(source))) {
    const open = openMatch[0] ?? '';
    const bodyStart = SCRIPT_OPEN_RE.lastIndex;
    SCRIPT_CLOSE_RE.lastIndex = bodyStart;
    const closeMatch = SCRIPT_CLOSE_RE.exec(source);
    const bodyEnd = closeMatch?.index ?? source.length;
    const close = closeMatch?.[0] ?? '';
    const end = closeMatch ? SCRIPT_CLOSE_RE.lastIndex : source.length;

    if (SPEAKER_NOTES_ID_RE.test(open)) {
      return {
        start: openMatch.index,
        end,
        open,
        body: source.slice(bodyStart, bodyEnd),
        close,
      };
    }

    if (!closeMatch) break;
    SCRIPT_OPEN_RE.lastIndex = end;
  }
  return null;
}

function extractInlineSlideNotes(source: string): string[] {
  const slideBlocks = source.match(/<section\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bslide\b[^"']*\1)[^>]*>[\s\S]*?<\/section>/gi) ?? [];
  const blocks = slideBlocks.length > 0 ? slideBlocks : [source];
  return blocks.map((block) => {
    const noteMatch = /<(?:aside|div)\b(?=[^>]*\bclass\s*=\s*(["'])[^"']*\bnotes\b[^"']*\1)[^>]*>([\s\S]*?)<\/(?:aside|div)>/i.exec(block);
    return noteMatch ? stripHtmlToText(noteMatch[2] ?? '') : '';
  });
}

function stripHtmlToText(value: string): string {
  return decodeBasicHtmlEntities(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, '')
      .replace(/<style\b[\s\S]*?<\/style>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p\s*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
  );
}

function decodeBasicHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'");
}

function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/</g, '\\u003c');
}

function jsonForHtmlScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

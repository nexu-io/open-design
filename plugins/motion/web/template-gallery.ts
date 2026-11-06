import { collectionNames, formatTemplateViews, socialPlatform, templateCategoryLabel } from '../shared/catalog';
import type { GalleryTemplate, TemplatePage } from '../shared/catalog';
import { hostNames, templatePrompt } from '../shared/integration';
import type { IntegrationHost, IntegrationInfo } from '../shared/integration';
import { TemplatePlayback } from './template-playback';

export function mountTemplates(root: HTMLElement, options: {
  info: () => IntegrationInfo | null; host: () => IntegrationHost;
  copy: (value: string, label: string, button?: HTMLButtonElement) => Promise<void>;
  useTemplate: (id: string) => void;
}) {
  const element = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>('#' + id)!;
  const dialog = element<HTMLDialogElement>('template-preview-dialog');
  const search = document.getElementById('template-search') as HTMLInputElement;
  const playback = new TemplatePlayback(), cleanups: (() => void)[] = [];
  const lifetime = new AbortController();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let active = false, enabled = false, category = 'featured', loaded = false, next: number | null = 0;
  let request: AbortController | undefined, sequence = 0, shown = 0, preview: GalleryTemplate | undefined;
  let previewCleanup = () => {}, rotation: ReturnType<typeof setInterval> | undefined, debounce: ReturnType<typeof setTimeout> | undefined;
  const canCopy = () => !!options.info() && options.host() !== 'chatgpt';
  const glyph = (name: string) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.setAttribute('class', 'ui-icon'); svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '/web/design-system/icons.svg#icon-' + name); svg.append(use); return svg;
  };
  const copyTemplate = (template: GalleryTemplate, button: HTMLButtonElement) => {
    const info = options.info(); if (info && canCopy()) void options.copy(templatePrompt(info, options.host(), template), `「${template.title}」复刻指令`, button);
  };
  function configurePlayback() {
    playback.configure(active && enabled && !dialog.open && !document.hidden, window.innerWidth < 680 ? 1 : 2);
  }
  function createMedia(template: GalleryTemplate) {
    const media = document.createElement('div'); media.className = 'connect-template-media home-template-art';
    const badge = document.createElement('span'); badge.className = 'home-template-duration';
    badge.append(glyph('play'), template.duration === undefined ? collectionNames[template.collection] : `${Number(template.duration.toFixed(1))}s`);
    media.append(badge);
    const content = document.createElement('div'); content.className = 'home-template-no-preview';
    const label = document.createElement('span'), title = document.createElement('strong'), description = document.createElement('p'), status = document.createElement('small');
    label.textContent = collectionNames[template.collection]; title.textContent = template.title; description.textContent = template.description || template.subtitle;
    status.textContent = '查看模板内容'; content.append(label, title, description, status); media.append(content);
    let cleanup = () => {};
    {
      const poster = document.createElement('img'), video = document.createElement('video');
      // IntersectionObserver assigns src lazily; a hidden native-lazy image would never load.
      poster.alt = ''; poster.loading = 'eager'; poster.decoding = 'async';
      video.muted = true; video.playsInline = true; video.loop = true; video.preload = 'metadata'; video.setAttribute('aria-hidden', 'true');
      let posterReady = false, frameReady = false, failed = false, playing = false, started = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const update = () => {
        poster.hidden = !posterReady; video.hidden = !frameReady || (posterReady && !playing);
        content.hidden = posterReady || frameReady; media.dataset.previewState = playing ? 'playing' : frameReady ? 'frame' : posterReady ? 'poster' : failed ? 'unavailable' : 'content';
        status.textContent = failed ? '预览暂时不可用 · 仍可复制复刻指令' : !template.previewUrl && !template.posterUrl ? '查看模板内容与源码' : '正在加载预览…';
      };
      const unregister = playback.register(template.id, {
        play: () => { if (!video.paused || failed) return; void video.play().catch(() => playback.update(template.id, { ready: false })); },
        pause: () => video.pause(),
      });
      poster.onload = () => { posterReady = true; update(); };
      poster.onerror = () => { posterReady = false; if (!template.previewUrl || failed) failed = true; update(); };
      video.onloadedmetadata = () => { if (Number.isFinite(video.duration) && video.duration > .2) video.currentTime = Math.min(.6, video.duration / 4); };
      video.onloadeddata = () => { clearTimeout(timer); frameReady = true; failed = false; update(); playback.update(template.id, { ready: true }); };
      video.onplaying = () => { playing = true; update(); };
      video.onpause = () => { playing = false; update(); };
      video.onerror = () => { clearTimeout(timer); failed = true; playing = false; frameReady = false; playback.update(template.id, { ready: false }); update(); };
      const start = () => {
        if (started) return; started = true;
        if (template.posterUrl) poster.src = template.posterUrl;
        if (template.previewUrl) {
          video.src = template.previewUrl;
        }
        if (template.previewUrl || template.posterUrl) timer = setTimeout(() => {
          if (!frameReady && !posterReady) { failed = true; update(); }
          if (!frameReady && template.previewUrl) { playback.update(template.id, { ready: false }); video.removeAttribute('src'); video.load(); }
        }, 15000);
        update();
      };
      media.prepend(poster, video); update();
      const loading = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { start(); loading.disconnect(); } }, { root, rootMargin: '160px' }); loading.observe(media);
      const visible = new IntersectionObserver(([entry]) => playback.update(template.id, { visible: entry.isIntersecting }), { root, threshold: .15 }); visible.observe(media);
      media.onmouseenter = () => playback.update(template.id, { priority: true }); media.onmouseleave = () => playback.update(template.id, { priority: false });
      media.addEventListener('focusin', () => playback.update(template.id, { priority: true }));
      media.addEventListener('focusout', () => playback.update(template.id, { priority: false }));
      cleanup = () => { clearTimeout(timer); unregister(); loading.disconnect(); visible.disconnect(); video.pause(); video.removeAttribute('src'); video.load(); poster.removeAttribute('src'); };
    }
    cleanups.push(cleanup);
    const cover = document.createElement('button'); cover.className = 'connect-template-cover'; cover.setAttribute('aria-label', '预览模板 ' + template.title); cover.onclick = () => showPreview(template);
    const hint = document.createElement('span'); hint.className = 'connect-preview-hint'; hint.setAttribute('aria-hidden', 'true'); hint.append(glyph('eye'), '预览模板'); media.append(cover, hint);
    return media;
  }
  function sourceLink(template: GalleryTemplate) {
    const link = document.createElement('a'); link.className = 'connect-template-source';
    link.href = template.sourceUrl || '#'; link.target = '_blank'; link.rel = 'noopener noreferrer';
    let platform = '来源';
    if (template.sourceUrl) {
      const hostname = new URL(template.sourceUrl).hostname;
      platform = socialPlatform(template.sourceUrl) || (hostname.includes('github') ? 'GitHub' : '原始视频');
    }
    const author = document.createElement('span'); author.className = 'connect-template-author'; author.textContent = template.authorName || template.author || 'Hyperframes';
    link.append(author, document.createTextNode(' · ' + platform), glyph('arrow-up-right')); link.title = template.author;
    link.setAttribute('aria-label', `查看 ${template.author || template.title} 的原始出处`); return link;
  }
  function sourceSummary(template: GalleryTemplate) {
    const row = document.createElement('div'); row.className = 'connect-template-source-row'; row.append(sourceLink(template));
    if (template.social) {
      const social = template.social, count = document.createElement('a'), unit = social.platform === 'X' ? '次查看' : '次播放';
      count.className = 'connect-template-views'; count.href = social.sourceUrl; count.target = '_blank'; count.rel = 'noopener noreferrer';
      count.textContent = `${formatTemplateViews(social.views)} ${unit}`;
      count.title = `${social.platform} 原帖 · ${social.views.toLocaleString('zh-CN')} ${unit}\nHyperframes 收录数据 · 同步于 ${social.syncedAt.slice(0, 10)}`;
      count.setAttribute('aria-label', count.title.replace('\n', ' · ')); row.append(count);
    }
    return row;
  }
  function createCard(template: GalleryTemplate) {
    const card = document.createElement('article'); card.className = 'connect-template-card'; card.dataset.templateId = template.id;
    const details = document.createElement('div'); details.className = 'connect-template-info';
    const title = document.createElement('button'); title.className = 'connect-template-title'; title.textContent = template.title; title.title = template.title; title.onclick = () => showPreview(template);
    const heading = document.createElement('div'); heading.className = 'connect-template-heading';
    const type = document.createElement('span'); type.className = 'connect-template-category'; type.textContent = templateCategoryLabel(template); type.title = type.textContent === 'A-roll Cuts' ? '口播剪辑' : type.textContent;
    heading.append(title, type);
    const actions = document.createElement('div'); actions.className = 'connect-template-card-footer';
    const button = document.createElement('button'); button.className = 'ui-button ui-button--sm connect-remix-button'; button.append(glyph('copy'), '一键复刻'); button.dataset.copyTemplate = template.id;
    button.disabled = !canCopy(); button.setAttribute('aria-label', '一键复刻 ' + template.title); button.onclick = () => copyTemplate(template, button);
    actions.append(sourceSummary(template), button); details.append(heading, actions); card.append(createMedia(template), details); return card;
  }
  async function load(reset: boolean) {
    if (!active) return;
    request?.abort(); const controller = new AbortController(); request = controller; const ticket = ++sequence;
    if (reset) { cleanups.splice(0).forEach(clean => clean()); element('template-grid').replaceChildren(); shown = 0; next = 0; loaded = false; }
    element('catalog-error').hidden = true; element('template-panel').setAttribute('aria-busy', 'true');
    element<HTMLButtonElement>('more-templates').disabled = true; element('template-count').textContent = '正在读取模板…';
    const params = new URLSearchParams({ category, query: search.value, offset: String(reset ? 0 : next ?? 0), limit: '6', grouped: 'true', covered: 'true' });
    try {
      const response = await fetch('/motion-api/template-catalog?' + params, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (!response.ok) throw new Error('模板目录暂时无法读取');
      const page = await response.json() as TemplatePage;
      if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total)) throw new Error('模板目录格式无效');
      if (ticket !== sequence || !active) return;
      element('template-grid').append(...page.items.map(createCard)); shown += page.items.length; next = page.next; loaded = true;
      element('template-count').textContent = page.total ? `已展示 ${shown} / ${page.total} 组 · ${page.entryTotal} 个模板与片段` : '没有找到匹配模板，试试其他名称、作者或风格。';
      element('more-templates').hidden = next === null;
      const shortcut = document.getElementById('connection-templates')!; shortcut.textContent = `全部 ${page.galleryTotal ?? page.catalogTotal} 个模板`;
    } catch (error) {
      if (controller.signal.aborted || ticket !== sequence) return;
      element('catalog-error').hidden = false; element('catalog-error-text').textContent = error instanceof Error ? error.message + '，请重试。' : '模板目录暂时无法读取，请重试。';
      element('template-count').textContent = shown ? `已展示 ${shown} 组模板` : '目录暂不可达';
    } finally {
      if (ticket === sequence) { request = undefined; element('template-panel').setAttribute('aria-busy', 'false'); element<HTMLButtonElement>('more-templates').disabled = false; }
    }
  }
  function chooseCategory(button: HTMLButtonElement) {
    clearTimeout(debounce); category = button.dataset.category!;
    root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(item => { const selected = item === button; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; });
    element('template-panel').setAttribute('aria-labelledby', button.id); void load(true);
  }
  root.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.onclick = () => chooseCategory(button));
  element('template-tabs').onkeydown = event => {
    const buttons = [...element('template-tabs').querySelectorAll<HTMLButtonElement>('button')], index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0 || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[target].focus(); chooseCategory(buttons[target]);
  };
  search.oninput = () => { clearTimeout(debounce); request?.abort(); debounce = setTimeout(() => { element('templates').scrollIntoView({ block: 'start' }); void load(true); }, 180); };
  element('more-templates').onclick = () => { if (next !== null && !request) void load(false); };
  element('retry-catalog').onclick = () => void load(shown === 0);
  function renderPlayback() {
    const button = element<HTMLButtonElement>('toggle-previews');
    button.setAttribute('aria-pressed', String(enabled)); button.setAttribute('aria-label', enabled ? '暂停动态预览' : '播放动态预览'); button.replaceChildren(glyph(enabled ? 'pause' : 'play'), '动态预览'); configurePlayback();
  }
  function restorePlayback() {
    let saved = true; try { saved = localStorage.getItem('openmotion.template-previews') !== 'paused'; } catch {}
    enabled = !reducedMotion.matches && saved; renderPlayback();
  }
  element('toggle-previews').onclick = () => {
    enabled = !enabled; try { localStorage.setItem('openmotion.template-previews', enabled ? 'playing' : 'paused'); } catch {}
    renderPlayback();
  };
  restorePlayback(); reducedMotion.addEventListener('change', restorePlayback, { signal: lifetime.signal }); window.addEventListener('resize', configurePlayback, { signal: lifetime.signal });
  function updateConnection() {
    root.querySelectorAll<HTMLButtonElement>('[data-copy-template], #copy-preview-template').forEach(button => button.disabled = !canCopy());
    if (preview) {
      const info = options.info(); element('preview-prompt').textContent = info ? templatePrompt(info, options.host(), preview) : '工作区恢复连接后即可复制完整复刻指令。';
      element('preview-copy-hint').textContent = options.host() === 'chatgpt' ? '请选择可用的本机客户端开始复刻。' : `复制后发给 ${hostNames[options.host()]}，即可开始复刻。`;
    }
  }
  function showSelection(template: GalleryTemplate) {
    previewCleanup(); preview = template;
    element('preview-title').textContent = template.title; element('preview-description').textContent = template.subtitle;
    element('preview-detail').textContent = [templateCategoryLabel(template), template.duration === undefined ? '' : `${Number(template.duration.toFixed(1))} 秒`, template.ratio || ''].filter(Boolean).join(' · ');
    element('preview-source').replaceChildren(sourceSummary(template));
    element('preview-error').hidden = true; element('use-preview-template').hidden = template.kind !== 'builtin';
    const stage = element('template-preview-stage'); stage.replaceChildren();
    dialog.classList.toggle('connect-preview-dialog--portrait', template.ratio === '9:16' || template.kind === 'builtin');
    if (template.previewUrl) {
      const video = document.createElement('video'); video.controls = true; video.muted = true; video.playsInline = true; video.autoplay = !reducedMotion.matches; video.loop = true; video.preload = 'metadata'; video.setAttribute('aria-label', template.title + '参考视频'); if (template.posterUrl) video.poster = template.posterUrl;
      let timer: ReturnType<typeof setTimeout>;
      const failed = () => { clearTimeout(timer); element('preview-error').textContent = '预览暂时无法加载。可以继续查看模板内容与复刻指令，或关闭后重新打开预览。'; element('preview-error').hidden = false; };
      video.onerror = failed; video.onloadeddata = () => clearTimeout(timer); video.src = template.previewUrl; stage.append(video); timer = setTimeout(failed, 15000);
      previewCleanup = () => { clearTimeout(timer); video.onerror = null; video.pause(); video.removeAttribute('src'); video.load(); };
    } else if (template.posterUrl) {
      const poster = document.createElement('img'); poster.alt = template.title + '模板封面'; poster.src = template.posterUrl; stage.append(poster);
      poster.onerror = () => { stage.replaceChildren(contentPreview(template)); }; previewCleanup = () => { poster.onerror = null; poster.removeAttribute('src'); };
    } else { stage.append(contentPreview(template)); previewCleanup = () => {}; }
    updateConnection();
  }
  function contentPreview(template: GalleryTemplate) {
    const content = document.createElement('div'); content.className = 'home-template-no-preview'; const label = document.createElement('span'), title = document.createElement('strong'), text = document.createElement('p');
    label.textContent = collectionNames[template.collection] + ' · 模板内容'; title.textContent = template.title; text.textContent = template.description || template.subtitle; content.append(label, title, text); return content;
  }
  function showPreview(template: GalleryTemplate) {
    const variants = template.variants || [template], select = element<HTMLSelectElement>('preview-variants');
    element('preview-variants-field').hidden = variants.length < 2; element('preview-variants-label').textContent = `同源参考 · ${variants.length} 个选择`;
    select.replaceChildren(...variants.map(item => { const option = document.createElement('option'); option.value = item.id; option.textContent = `${collectionNames[item.collection]} · ${item.title}`; return option; }));
    select.value = template.id; select.onchange = () => showSelection(variants.find(item => item.id === select.value)!);
    showSelection(template); dialog.showModal(); configurePlayback();
  }
  element('close-template-preview').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { previewCleanup(); previewCleanup = () => {}; preview = undefined; configurePlayback(); }, { signal: lifetime.signal });
  element('copy-preview-template').onclick = event => { if (preview) copyTemplate(preview, event.currentTarget as HTMLButtonElement); };
  element('use-preview-template').onclick = () => { if (preview?.kind === 'builtin') { const id = preview.id; dialog.close(); options.useTemplate(id); } };
  document.addEventListener('visibilitychange', () => { configurePlayback(); if (document.hidden) element('template-preview-stage').querySelector('video')?.pause(); }, { signal: lifetime.signal });
  function suspend() { active = false; if (request) { request.abort(); loaded = false; } clearTimeout(debounce); clearInterval(rotation); configurePlayback(); if (dialog.open) dialog.close(); previewCleanup(); }
  return {
    updateConnection,
    showAll() { search.value = ''; chooseCategory(element<HTMLButtonElement>('template-tab-featured')); },
    resume() { active = true; if (!loaded) void load(true); clearInterval(rotation); rotation = setInterval(() => { if (active && enabled && !dialog.open && !document.hidden) playback.advance(); }, 4200); configurePlayback(); },
    suspend,
    destroy() { suspend(); lifetime.abort(); cleanups.splice(0).forEach(clean => clean()); element('template-grid').replaceChildren(); },
  };
}

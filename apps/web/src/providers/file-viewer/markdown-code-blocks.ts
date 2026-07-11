// DOM-touching markdown code-block adapters for the markdown viewer: shiki
// syntax highlighting (dynamic import, builds a detached element to parse the
// rendered HTML) and the per-block copy-button DOM injection/copied-state
// toggle. Lives in providers/ because it touches a bare `document`; the slice
// hook reaches it through `MarkdownCodeBlocksPort` so it stays DOM-free and
// unit-testable.
import {
  MARKDOWN_CODE_BLOCK_ATTR,
  MARKDOWN_CODE_LANGUAGE_ATTR,
  MARKDOWN_COPY_BLOCK_ATTR,
  MARKDOWN_COPY_BUTTON_CLASS,
  MARKDOWN_COPY_TOAST_CLASS,
  markdownCodeBlockLanguage,
} from '../../features/file-viewer';
import type { TranslateFn } from '../../features/file-viewer';

export async function highlightMarkdownCodeBlocks(html: string): Promise<string> {
  if (typeof document === 'undefined') return html;
  const root = document.createElement('div');
  root.innerHTML = html;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>(`[${MARKDOWN_CODE_BLOCK_ATTR}]`));
  if (blocks.length === 0) return html;
  const { highlightCode } = await import('../../runtime/shiki');
  let changed = false;
  await Promise.all(blocks.map(async (block) => {
    const code = block.querySelector<HTMLElement>('pre > code');
    if (!code) return;
    const language = markdownCodeBlockLanguage(code.outerHTML);
    if (!language) return;
    const source = (code.textContent ?? '').replace(/\n$/, '');
    const highlighted = await highlightCode(source, language.lang);
    if (!highlighted) return;
    const wrapper = document.createElement('div');
    wrapper.innerHTML = highlighted;
    const highlightedPre = wrapper.firstElementChild;
    if (!(highlightedPre instanceof HTMLElement)) return;
    highlightedPre.classList.add('markdown-shiki');
    highlightedPre.setAttribute('data-lang', language.label);
    code.closest('pre')?.replaceWith(highlightedPre);
    block.setAttribute(MARKDOWN_CODE_LANGUAGE_ATTR, language.label);
    changed = true;
  }));
  return changed ? root.innerHTML : html;
}

export function setMarkdownCodeBlockCopiedState(block: HTMLElement, copied: boolean, t: TranslateFn): void {
  const button = block.querySelector<HTMLButtonElement>(`.${MARKDOWN_COPY_BUTTON_CLASS}`);
  if (!button) return;
  const label = copied ? t('fileViewer.copied') : t('fileViewer.copy');
  button.textContent = label;
  button.setAttribute('aria-label', label);
  button.title = t('fileViewer.copyTitle');

  const existingToast = block.querySelector(`.${MARKDOWN_COPY_TOAST_CLASS}`);
  if (copied) {
    if (existingToast instanceof HTMLElement) {
      existingToast.textContent = t('fileViewer.copied');
      return;
    }
    const toast = document.createElement('span');
    toast.className = MARKDOWN_COPY_TOAST_CLASS;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = t('fileViewer.copied');
    button.insertAdjacentElement('afterend', toast);
    return;
  }

  existingToast?.remove();
}

export function ensureMarkdownCodeBlockControls(root: HTMLElement, t: TranslateFn): void {
  for (const block of root.querySelectorAll<HTMLElement>(`[${MARKDOWN_CODE_BLOCK_ATTR}]`)) {
    let button = block.querySelector<HTMLButtonElement>(`.${MARKDOWN_COPY_BUTTON_CLASS}`);
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = MARKDOWN_COPY_BUTTON_CLASS;
      const blockId = block.getAttribute(MARKDOWN_CODE_BLOCK_ATTR) ?? '';
      button.setAttribute(MARKDOWN_COPY_BLOCK_ATTR, blockId);
      block.prepend(button);
    }
    setMarkdownCodeBlockCopiedState(block, false, t);
  }
}

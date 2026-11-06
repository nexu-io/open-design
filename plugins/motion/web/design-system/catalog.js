(() => {
  const colors = [['bg', '工作区'], ['panel', '面板'], ['raised', '浮层'], ['inset', '输入底色'], ['border', '分隔线'], ['strong', '强调文字'], ['text', '正文'], ['dim', '辅助文字'], ['brand', '品牌绿'], ['accent', '选中与焦点'], ['action', '主要操作'], ['accent-soft', '选中底色']];
  const container = document.getElementById('swatches');
  function refresh() {
    const styles = getComputedStyle(document.documentElement);
    container.replaceChildren(...colors.map(([token, label]) => {
      const swatch = document.createElement('article'); swatch.className = 'swatch';
      const color = document.createElement('div'); color.className = 'swatch-color'; color.style.setProperty('--swatch', `var(--motion-${token})`);
      const text = document.createElement('div'); const title = document.createElement('strong'); title.textContent = label;
      const value = document.createElement('code'); value.textContent = styles.getPropertyValue(`--motion-${token}`).trim().toUpperCase();
      text.append(title, value); swatch.append(color, text); return swatch;
    }));
  }
  new MutationObserver(refresh).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  document.querySelectorAll('[data-preview-action]').forEach(button => button.addEventListener('click', () => {
    document.getElementById('component-feedback').textContent = `已触发「${button.textContent.trim() || button.getAttribute('aria-label')}」示例。`;
  }));
  refresh();
})();

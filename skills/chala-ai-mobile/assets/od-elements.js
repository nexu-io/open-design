/**
 * od-elements.js — Web Component preview shims for ODML.
 *
 * Purpose: render <od-*> tags inside the daemon's preview iframe so designers
 * see something visual when reviewing skill output. THIS FILE IS THROWAWAY
 * PREVIEW CODE — the SwiftUI translator never reads it. The contract is
 * defined by ODML's SKILL.md, not by these shims.
 *
 * Tokens are wired via CSS custom properties on :host with names that mirror
 * design-systems/chala-ai/tokens.json. Update tokens.css (generated from
 * tokens.json) if you change the palette; do not edit values here.
 */

const TOKEN_CSS = `
:host {
  /* Colors */
  --od-bg: #050505;
  --od-bg-elevated: #0B0B0B;
  --od-bg-overlay: rgba(255, 255, 255, 0.06);
  --od-fg: #FFFFFF;
  --od-fg-muted: rgba(255, 255, 255, 0.55);
  --od-fg-subtle: rgba(255, 255, 255, 0.32);
  --od-accent: #FFFFFF;
  --od-accent-fg: #0B0B0B;
  --od-success: #34C759;
  --od-warning: #FF9500;
  --od-danger: #FF3B30;
  --od-border: rgba(255, 255, 255, 0.08);
  --od-border-strong: rgba(255, 255, 255, 0.16);

  /* Spacing */
  --od-space-none: 0px;
  --od-space-xs: 4px;
  --od-space-sm: 8px;
  --od-space-md: 16px;
  --od-space-lg: 24px;
  --od-space-xl: 32px;
  --od-space-2xl: 48px;
  --od-space-3xl: 64px;

  /* Radius */
  --od-radius-none: 0px;
  --od-radius-sm: 6px;
  --od-radius-md: 8px;
  --od-radius-lg: 15px;
  --od-radius-xl: 24px;
  --od-radius-full: 9999px;

  /* Typography */
  --od-font-sans: 'Geist', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --od-font-mono: 'GeistMono', ui-monospace, 'SFMono-Regular', Menlo, monospace;

  display: block;
  color: var(--od-fg);
}
`;

const TEXT_STYLES = {
  display: 'font-family: var(--od-font-sans); font-size: 42px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.1;',
  title: 'font-family: var(--od-font-sans); font-size: 36px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.15;',
  headline: 'font-family: var(--od-font-sans); font-size: 22px; font-weight: 500; letter-spacing: -0.02em; line-height: 1.2;',
  body: 'font-family: var(--od-font-sans); font-size: 15px; font-weight: 400; line-height: 1.4;',
  caption: 'font-family: var(--od-font-mono); font-size: 10px; font-weight: 400; letter-spacing: 0.18em; text-transform: uppercase;',
  mono: 'font-family: var(--od-font-mono); font-size: 14px; font-weight: 400;',
};

const ALIGN_MAP = { leading: 'flex-start', center: 'center', trailing: 'flex-end' };
const JUSTIFY_MAP = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  'space-between': 'space-between',
};
const ICON_SIZE = { xs: 12, sm: 16, md: 20, lg: 28, xl: 36 };
const AVATAR_SIZE = { sm: 32, md: 48, lg: 72 };
const BUTTON_SIZE_PADDING = {
  sm: '6px 12px',
  md: '10px 16px',
  lg: '14px 20px',
};

function tokenStyle(prefix, name) {
  return name ? `var(--od-${prefix}-${name})` : null;
}

function makeBase(tagName, content, hostStyle = '') {
  return class extends HTMLElement {
    connectedCallback() {
      if (this.shadowRoot) return;
      const shadow = this.attachShadow({ mode: 'open' });
      shadow.innerHTML = `<style>${TOKEN_CSS}${hostStyle}</style>${content(this)}`;
    }
  };
}

/* --------------------------- Containers --------------------------- */

customElements.define('od-screen', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const bg = this.getAttribute('background');
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        ${TOKEN_CSS}
        :host {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 100vh;
          background: ${tokenStyle('bg', bg === 'bg-elevated' ? 'elevated' : bg === 'bg-overlay' ? 'overlay' : '') || 'var(--od-bg)'};
          padding: 60px 0 80px;
          box-sizing: border-box;
        }
      </style>
      <slot></slot>
    `;
  }
});

customElements.define('od-stack', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const direction = this.getAttribute('direction') || 'vertical';
    const spacing = this.getAttribute('spacing') || 'none';
    const padding = this.getAttribute('padding') || 'none';
    const align = this.getAttribute('align') || 'leading';
    const justify = this.getAttribute('justify') || 'start';
    const flexDir = direction === 'horizontal' ? 'row' : direction === 'z' ? null : 'column';

    const shadow = this.attachShadow({ mode: 'open' });
    if (direction === 'z') {
      shadow.innerHTML = `
        <style>${TOKEN_CSS}
          :host { display: grid; padding: var(--od-space-${padding}); }
          :host > ::slotted(*) { grid-area: 1 / 1; }
        </style>
        <slot></slot>
      `;
    } else {
      shadow.innerHTML = `
        <style>${TOKEN_CSS}
          :host {
            display: flex;
            flex-direction: ${flexDir};
            gap: var(--od-space-${spacing});
            padding: var(--od-space-${padding});
            align-items: ${ALIGN_MAP[align] || 'flex-start'};
            justify-content: ${JUSTIFY_MAP[justify] || 'flex-start'};
            box-sizing: border-box;
          }
        </style>
        <slot></slot>
      `;
    }
  }
});

customElements.define('od-grid', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const cols = this.getAttribute('columns') || '2';
    const spacing = this.getAttribute('spacing') || 'none';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: grid;
          grid-template-columns: repeat(${cols}, minmax(0, 1fr));
          gap: var(--od-space-${spacing});
        }
      </style>
      <slot></slot>
    `;
  }
});

customElements.define('od-scroll', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const direction = this.getAttribute('direction') || 'vertical';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: block;
          overflow-${direction === 'horizontal' ? 'x' : 'y'}: auto;
          max-${direction === 'horizontal' ? 'width' : 'height'}: 100%;
        }
      </style>
      <slot></slot>
    `;
  }
});

customElements.define('od-card', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const padding = this.getAttribute('padding') || 'md';
    const radius = this.getAttribute('radius') || 'md';
    const bg = this.getAttribute('background');
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: block;
          padding: var(--od-space-${padding});
          border-radius: var(--od-radius-${radius});
          background: ${bg ? tokenStyle('bg', bg === 'bg-elevated' ? 'elevated' : bg === 'bg-overlay' ? 'overlay' : '') : 'rgba(255,255,255,0.04)'};
          border: 1px solid var(--od-border);
        }
      </style>
      <slot></slot>
    `;
  }
});

customElements.define('od-spacer', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>:host { display: block; flex: 1; }</style>`;
  }
});

customElements.define('od-divider', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const orientation = this.getAttribute('orientation') || 'horizontal';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: block;
          background: var(--od-border);
          ${orientation === 'horizontal' ? 'height: 1px; width: 100%;' : 'width: 1px; height: 100%;'}
        }
      </style>
    `;
  }
});

/* --------------------------- Content --------------------------- */

customElements.define('od-text', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const style = this.getAttribute('style-name') || this.getAttribute('style') || 'body';
    const color = this.getAttribute('color') || 'fg';
    const align = this.getAttribute('align') || 'leading';
    const bind = this.getAttribute('bind');
    const text = bind ? `{${bind}}` : this.textContent;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: inline-block;
          ${TEXT_STYLES[style] || TEXT_STYLES.body}
          color: ${tokenStyle('', color === 'fg-muted' ? 'fg-muted' : color === 'fg-subtle' ? 'fg-subtle' : color)};
          text-align: ${align === 'leading' ? 'left' : align === 'trailing' ? 'right' : 'center'};
        }
      </style>
      <span>${text}</span>
    `;
  }
});

customElements.define('od-icon', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const name = this.getAttribute('name') || 'square';
    const size = this.getAttribute('size') || 'md';
    const color = this.getAttribute('color') || 'fg';
    const px = ICON_SIZE[size] || 20;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${px}px;
          height: ${px}px;
          color: ${tokenStyle('', color === 'fg-muted' ? 'fg-muted' : color === 'fg-subtle' ? 'fg-subtle' : color)};
          font-family: var(--od-font-mono);
          font-size: ${Math.round(px * 0.5)}px;
          letter-spacing: 0;
        }
      </style>
      <span title="${name}">${'□'}</span>
    `;
  }
});

customElements.define('od-image', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const aspect = this.getAttribute('aspect') || 'square';
    const radius = this.getAttribute('radius') || 'none';
    const ratio = { square: '1 / 1', portrait: '3 / 4', landscape: '16 / 9', fill: '1 / 1' }[aspect];
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: block;
          aspect-ratio: ${ratio};
          background: var(--od-bg-elevated);
          border-radius: var(--od-radius-${radius});
          border: 1px solid var(--od-border);
        }
      </style>
    `;
  }
});

customElements.define('od-avatar', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const size = this.getAttribute('size') || 'md';
    const px = AVATAR_SIZE[size] || 48;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: inline-block;
          width: ${px}px;
          height: ${px}px;
          border-radius: 50%;
          background: var(--od-bg-elevated);
          border: 1px solid var(--od-border);
        }
      </style>
    `;
  }
});

customElements.define('od-badge', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const variant = this.getAttribute('variant') || 'neutral';
    const text = this.getAttribute('text') || '';
    const bg = {
      neutral: 'rgba(255,255,255,0.10)',
      success: 'var(--od-success)',
      warning: 'var(--od-warning)',
      danger: 'var(--od-danger)',
    }[variant];
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: inline-block;
          padding: 2px 8px;
          background: ${bg};
          color: var(--od-fg);
          ${TEXT_STYLES.caption}
          border-radius: var(--od-radius-full);
        }
      </style>
      <span>${text}</span>
    `;
  }
});

customElements.define('od-progress', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const value = parseFloat(this.getAttribute('value') || '0') || 0;
    const style = this.getAttribute('style-name') || this.getAttribute('progress-style') || this.getAttribute('style') || 'bar';
    const shadow = this.attachShadow({ mode: 'open' });
    if (style === 'ring') {
      shadow.innerHTML = `
        <style>${TOKEN_CSS}
          :host {
            display: inline-block;
            width: 48px;
            height: 48px;
            border-radius: 50%;
            background: conic-gradient(var(--od-accent) ${value * 360}deg, var(--od-border) 0);
          }
        </style>
      `;
    } else {
      shadow.innerHTML = `
        <style>${TOKEN_CSS}
          :host { display: block; width: 100%; height: 4px; background: var(--od-border); border-radius: var(--od-radius-full); }
          .fill { width: ${Math.max(0, Math.min(1, value)) * 100}%; height: 100%; background: var(--od-accent); border-radius: var(--od-radius-full); }
        </style>
        <div class="fill"></div>
      `;
    }
  }
});

/* --------------------------- Interactive --------------------------- */

customElements.define('od-button', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const variant = this.getAttribute('variant') || 'primary';
    const size = this.getAttribute('size') || 'md';
    const disabled = this.getAttribute('disabled') === 'true';

    const bg = {
      primary: 'var(--od-accent)',
      secondary: 'var(--od-bg-elevated)',
      ghost: 'transparent',
      destructive: 'var(--od-danger)',
    }[variant];
    const fg = {
      primary: 'var(--od-accent-fg)',
      secondary: 'var(--od-fg)',
      ghost: 'var(--od-fg)',
      destructive: 'var(--od-fg)',
    }[variant];

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: inline-flex;
          align-items: center;
          gap: var(--od-space-xs);
          padding: ${BUTTON_SIZE_PADDING[size] || BUTTON_SIZE_PADDING.md};
          background: ${bg};
          color: ${fg};
          border: ${variant === 'ghost' ? '1px solid var(--od-border)' : 'none'};
          border-radius: var(--od-radius-md);
          cursor: pointer;
          font-family: var(--od-font-sans);
          font-size: 13px;
          font-weight: 500;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          opacity: ${disabled ? '0.4' : '1'};
          pointer-events: ${disabled ? 'none' : 'auto'};
        }
      </style>
      <slot></slot>
    `;
  }
});

customElements.define('od-input', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const placeholder = this.getAttribute('placeholder') || '';
    const secure = this.getAttribute('secure') === 'true';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host { display: block; }
        input {
          width: 100%;
          padding: 12px 14px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid var(--od-border);
          border-radius: var(--od-radius-md);
          color: var(--od-fg);
          font-family: var(--od-font-sans);
          font-size: 15px;
          box-sizing: border-box;
        }
        input::placeholder { color: var(--od-fg-subtle); }
      </style>
      <input type="${secure ? 'password' : 'text'}" placeholder="${placeholder}" />
    `;
  }
});

customElements.define('od-toggle', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const label = this.getAttribute('label') || '';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host { display: flex; align-items: center; justify-content: space-between; gap: var(--od-space-md); }
        .label { ${TEXT_STYLES.body} color: var(--od-fg); }
        .track { width: 44px; height: 26px; background: var(--od-bg-elevated); border: 1px solid var(--od-border); border-radius: 13px; position: relative; }
        .knob { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: var(--od-fg); border-radius: 50%; }
      </style>
      <span class="label">${label}</span>
      <span class="track"><span class="knob"></span></span>
    `;
  }
});

customElements.define('od-list', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host { display: flex; flex-direction: column; gap: var(--od-space-sm); }
      </style>
      <slot></slot>
    `;
  }
});

/* --------------------------- Chrome --------------------------- */

customElements.define('od-nav-bar', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const title = this.getAttribute('title') || '';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 44px;
          padding: 0 var(--od-space-md);
          ${TEXT_STYLES.body}
          color: var(--od-fg);
        }
      </style>
      <span>${title}</span>
    `;
  }
});

customElements.define('od-tab-bar', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const tabs = (this.getAttribute('tabs') || '').split(',').map((t) => t.trim()).filter(Boolean);
    const active = this.getAttribute('active') || '';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: flex;
          justify-content: space-around;
          padding: var(--od-space-sm) var(--od-space-md);
          border-top: 1px solid var(--od-border);
          ${TEXT_STYLES.caption}
        }
        .tab { color: var(--od-fg-subtle); }
        .tab.active { color: var(--od-fg); }
        .tab.active .dot { background: var(--od-fg); }
        .dot { display: block; width: 4px; height: 4px; border-radius: 50%; background: transparent; margin: 4px auto 0; }
      </style>
      ${tabs.map((t) => `<span class="tab${t === active ? ' active' : ''}">${t}<span class="dot"></span></span>`).join('')}
    `;
  }
});

customElements.define('od-sheet', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host { display: none; }
      </style>
      <slot></slot>
    `;
  }
});

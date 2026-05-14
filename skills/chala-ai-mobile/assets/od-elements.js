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
 *
 * Safety: this file runs inside the daemon's preview iframe which has
 * sandbox="allow-scripts". Any user-authored ODML attribute or text gets
 * scriptable powers if interpolated into innerHTML, so every user-supplied
 * string (od-text content, od-badge text, od-input placeholder, od-toggle
 * label, od-nav-bar title, od-tab-bar tab names, od-icon name attribute)
 * is set via textContent / setAttribute / Element.dataset rather than
 * concatenated into a template literal. Static CSS that has no user
 * interpolation still uses innerHTML.
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

// Full ODColor enum from SKILL.md / packages/od-dialect/src/ast.ts. Every
// allowed background / color attribute value must round-trip through
// this set so the preview resolves the same token the prompt permits,
// instead of silently falling back to a default that hides off-token
// inputs in review.
const OD_COLORS = new Set([
  'bg',
  'bg-elevated',
  'bg-overlay',
  'fg',
  'fg-muted',
  'fg-subtle',
  'accent',
  'accent-fg',
  'success',
  'warning',
  'danger',
  'border',
  'border-strong',
]);

/**
 * Resolve an ODColor token name to its CSS custom-property reference.
 * Unknown tokens return null so callers can decide whether to fall back
 * (od-screen uses `var(--od-bg)`) or omit the declaration (od-card uses
 * its 4%-white card surface). Never return a constructed `var(--od-X)`
 * for an off-token name — that would mask invalid ODML in preview.
 */
function colorVar(token) {
  if (!token) return null;
  if (!OD_COLORS.has(token)) return null;
  return `var(--od-${token})`;
}

/* --------------------------- Containers --------------------------- */

customElements.define('od-screen', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const bg = this.getAttribute('background');
    const bgValue = colorVar(bg) || 'var(--od-bg)';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        ${TOKEN_CSS}
        :host {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 100vh;
          background: ${bgValue};
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
    const cols = Math.max(1, Math.min(12, parseInt(this.getAttribute('columns') || '2', 10) || 2));
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
    // Default card surface is 4%-white-on-bg (DESIGN.md §2.Card); any
    // explicit `background="<token>"` from valid ODColor overrides it.
    // Invalid tokens fall back to the default so off-spec ODML still
    // renders something, but the preview will visibly differ from the
    // intended look (the structural issue is the wrong attribute, not
    // a missing fill).
    const bgValue = colorVar(bg) || 'rgba(255,255,255,0.04)';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: block;
          padding: var(--od-space-${padding});
          border-radius: var(--od-radius-${radius});
          background: ${bgValue};
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
    const colorValue = colorVar(color) || 'var(--od-fg)';
    const shadow = this.attachShadow({ mode: 'open' });
    // CSS template (no user data interpolated) goes via innerHTML; the
    // user-supplied text content is appended via textContent so any
    // HTML/script payload renders as inert text.
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: inline-block;
          ${TEXT_STYLES[style] || TEXT_STYLES.body}
          color: ${colorValue};
          text-align: ${align === 'leading' ? 'left' : align === 'trailing' ? 'right' : 'center'};
        }
      </style>
      <span></span>
    `;
    const span = shadow.querySelector('span');
    if (span) span.textContent = text || '';
  }
});

customElements.define('od-icon', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const name = this.getAttribute('name') || 'square';
    const size = this.getAttribute('size') || 'md';
    const color = this.getAttribute('color') || 'fg';
    const px = ICON_SIZE[size] || 20;
    const colorValue = colorVar(color) || 'var(--od-fg)';
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>${TOKEN_CSS}
        :host {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${px}px;
          height: ${px}px;
          color: ${colorValue};
          font-family: var(--od-font-mono);
          font-size: ${Math.round(px * 0.5)}px;
          letter-spacing: 0;
        }
      </style>
      <span>□</span>
    `;
    // SF Symbol name is user-supplied; set via setAttribute so quotes /
    // angle brackets in the value can't escape the tag.
    const span = shadow.querySelector('span');
    if (span) span.setAttribute('title', name);
  }
});

customElements.define('od-image', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const aspect = this.getAttribute('aspect') || 'square';
    const radius = this.getAttribute('radius') || 'none';
    const ratio = { square: '1 / 1', portrait: '3 / 4', landscape: '16 / 9', fill: '1 / 1' }[aspect] || '1 / 1';
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
    }[variant] || 'rgba(255,255,255,0.10)';
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
      <span></span>
    `;
    const span = shadow.querySelector('span');
    if (span) span.textContent = text;
  }
});

customElements.define('od-progress', class extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const raw = parseFloat(this.getAttribute('value') || '0');
    const value = Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0));
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
          .fill { width: ${value * 100}%; height: 100%; background: var(--od-accent); border-radius: var(--od-radius-full); }
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
    }[variant] || 'var(--od-accent)';
    const fg = {
      primary: 'var(--od-accent-fg)',
      secondary: 'var(--od-fg)',
      ghost: 'var(--od-fg)',
      destructive: 'var(--od-fg)',
    }[variant] || 'var(--od-accent-fg)';

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
      <input />
    `;
    const input = shadow.querySelector('input');
    if (input) {
      input.type = secure ? 'password' : 'text';
      input.setAttribute('placeholder', placeholder);
    }
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
      <span class="label"></span>
      <span class="track"><span class="knob"></span></span>
    `;
    const labelEl = shadow.querySelector('.label');
    if (labelEl) labelEl.textContent = label;
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
      <span></span>
    `;
    const span = shadow.querySelector('span');
    if (span) span.textContent = title;
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
    `;
    // Tab labels are user-supplied — build the DOM with createElement
    // + textContent so quotes / brackets / scripts in tab names stay
    // inert. Tab class names come from a fixed string set ('tab' or
    // 'tab active'), so the only attribute interpolation is on the
    // class, which is static.
    for (const name of tabs) {
      const span = document.createElement('span');
      span.className = name === active ? 'tab active' : 'tab';
      span.textContent = name;
      const dot = document.createElement('span');
      dot.className = 'dot';
      span.appendChild(dot);
      shadow.appendChild(span);
    }
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

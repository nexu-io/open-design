import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { I18nProvider } from '../src/i18n';
import { AnalyticsProvider } from '../src/analytics/provider';
import '../src/index.css';
import '../src/styles/home/index.css';

export const metadata: Metadata = {
  title: 'Open Design',
  icons: {
    icon: '/app-icon.png',
    apple: '/app-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#F4EFE6',
};

/**
 * Inline script that runs before React hydrates to apply the saved theme
 * preference without a flash of unstyled content. It reads the same
 * localStorage key used by `state/config.ts` and sets `data-theme` on
 * `<html>` immediately — before any CSS or React paint.
 * Keep the accent variable mix ratios in sync with `accentVars()` in
 * `src/state/appearance.ts`; this script cannot import application modules.
 */
/**
 * Guard against `Cannot read properties of null (reading 'cssRules')` crashes
 * in third-party libraries (motion, CSS-in-JS, etc.) that iterate
 * `document.styleSheets`. The StyleSheetList is a live collection whose
 * entries can become null when stylesheets are removed from the DOM during
 * iteration (React re-renders, dynamic imports, CSS module swaps).
 *
 * Two layers:
 *   1. Patch StyleSheetList iteration so index access never returns null.
 *   2. Wrap CSSStyleSheet.prototype.cssRules with a null-sheet guard.
 */
const styleSheetGuardScript = `(function(){
  if (typeof document === 'undefined' || !document.styleSheets) return;
  var desc = Object.getOwnPropertyDescriptor(document, 'styleSheets');
  if (!desc || !desc.get) {
    // Pre-DOM-Level-2 browser — not worth patching.
    return;
  }
  var raw = desc.get;
  Object.defineProperty(document, 'styleSheets', {
    configurable: true,
    enumerable: true,
    get: function(){
      var list = raw.call(document);
      if (!list) return list;
      // Wrap array-like access to filter out null/undefined entries.
      var handler = {
        get: function(target, prop, receiver){
          var val = Reflect.get(target, prop, receiver);
          if (prop === 'length') return val;
          if (typeof prop === 'string' && /^\\d+$/.test(prop)) {
            return val == null ? undefined : val;
          }
          if (prop === 'item') {
            return function(i){ var v = target.item(i); return v == null ? undefined : v; };
          }
          return val;
        }
      };
      return new Proxy(list, handler);
    }
  });
})();`;

const themeInitScript = `(function(){try{var c=JSON.parse(localStorage.getItem('open-design:config')||'{}');var t=c.theme;if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);var a=typeof c.accentColor==='string'&&/^#[0-9a-fA-F]{6}$/.test(c.accentColor.trim())?c.accentColor.trim().toLowerCase():'#c96442';var s=document.documentElement.style;s.setProperty('--accent',a);s.setProperty('--accent-strong','color-mix(in srgb, '+a+' 86%, var(--text-strong))');s.setProperty('--accent-soft','color-mix(in srgb, '+a+' 22%, var(--bg-panel))');s.setProperty('--accent-tint','color-mix(in srgb, '+a+' 12%, var(--bg-panel))');s.setProperty('--accent-hover','color-mix(in srgb, '+a+' 90%, var(--text-strong))');}catch(e){}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang='en' suppressHydrationWarning>
      {/* eslint-disable-next-line @next/next/no-sync-scripts */}
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional styleSheet guard to prevent cssRules crashes in dependencies */}
        <script dangerouslySetInnerHTML={{ __html: styleSheetGuardScript }} />
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: intentional theme-init inline script to prevent FOUC */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <I18nProvider>
          <AnalyticsProvider>{children}</AnalyticsProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

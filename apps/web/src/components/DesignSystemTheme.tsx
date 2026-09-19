import { useMemo, type CSSProperties } from 'react';
import type { DesignSystemDetail } from '../types';
import { useT } from '../i18n';
import type { WorkspaceResourceReadIdentity } from '../collab/workspace-identity';
import { isLightHex, type DesignKit } from '../runtime/design-kit';
import { useDesignSystemTokens, type DesignSystemToken } from './useDesignSystemTokens';
import styles from './DesignSystemTheme.module.css';

interface DesignSystemThemeProps {
  kit: DesignKit;
  packageInfo?: DesignSystemDetail['packageInfo'];
  resourceReadIdentity: WorkspaceResourceReadIdentity | null;
  tokens?: readonly DesignSystemToken[];
}

interface ThemeColor {
  name: string;
  value: string;
  role?: string;
  usage?: string;
}

const GROUP_ORDER = ['brand', 'background', 'text', 'icon', 'border', 'state-success', 'state-error', 'state-warning', 'state-info', 'sidebar', 'colors'];

function colorGroup(token: ThemeColor): string {
  const name = (token.role || token.name).replace(/^--/, '').toLowerCase();
  if (/sidebar/.test(name)) return 'sidebar';
  if (/success|positive/.test(name)) return 'state-success';
  if (/error|danger|destructive|negative/.test(name)) return 'state-error';
  if (/warning|warn|caution/.test(name)) return 'state-warning';
  if (/(^|[-_ ])info($|[-_ ])/.test(name)) return 'state-info';
  if (/icon/.test(name)) return 'icon';
  if (/accent|brand|primary/.test(name)) return 'brand';
  if (/background|(^|[-_ ])bg($|[-_ ])|surface|canvas/.test(name)) return 'background';
  if (/foreground|(^|[-_ ])fg($|[-_ ])|text|muted|meta/.test(name)) return 'text';
  if (/border|divider|stroke/.test(name)) return 'border';
  return 'colors';
}

// Scoped custom properties let real aliases/color-mix tokens work without
// accidentally resolving against or overriding the application's own theme.
function cssColor(value: string): string {
  return value.replace(/var\(\s*--([\w-]+)/g, 'var(--ds-preview-$1');
}

function foreground(color: ThemeColor, tokens: ThemeColor[], visited = new Set<string>()): string {
  let value = color.value;
  const referenced = /var\(\s*(--[\w-]+)/.exec(value)?.[1];
  if (referenced && !visited.has(referenced)) {
    const match = tokens.find((token) => token.name === referenced);
    if (match) {
      visited.add(referenced);
      return foreground(match, tokens, visited);
    }
  }
  if (/^#[\da-f]{3}$/i.test(value)) value = `#${value.slice(1).split('').map((part) => part + part).join('')}`;
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value);
  if (rgb) value = `#${rgb.slice(1, 4).map((part) => Math.min(255, Number(part)).toString(16).padStart(2, '0')).join('')}`;
  return isLightHex(value) ? '#181818' : '#ffffff';
}

export function DesignSystemTheme({ kit, packageInfo, resourceReadIdentity, tokens }: DesignSystemThemeProps) {
  const t = useT();
  const loadedTokens = useDesignSystemTokens({ kit, packageInfo, resourceReadIdentity, enabled: tokens === undefined });
  const sourceTokens = tokens ?? loadedTokens;
  const colors = useMemo<ThemeColor[]>(() => {
    const colorTokens = sourceTokens.filter((token) => token.type === 'color');
    return colorTokens.length > 0 ? colorTokens
      : kit.colors.map((color) => ({ name: color.name || color.role, value: color.hex, role: color.role, usage: color.usage }));
  }, [sourceTokens, kit.colors]);
  const groups = useMemo(() => GROUP_ORDER.flatMap((name) => {
    const tokens = colors.filter((token) => colorGroup(token) === name);
    return tokens.length > 0 ? [{ name, tokens }] : [];
  }), [colors]);
  const variables = Object.fromEntries(colors
    .filter((color) => /^--[\w-]+$/.test(color.name))
    .map((color) => [`--ds-preview-${color.name.slice(2)}`, cssColor(color.value)])) as CSSProperties;

  if (groups.length === 0) return null;

  return (
    <div className={styles.theme} style={variables} data-testid="design-system-theme" aria-label={t('brandDetail.palette')}>
      {groups.map((group) => {
        const primary = group.tokens[0]!;
        return (
          <section key={group.name} className={`${styles.band} ${group.name.startsWith('state-') ? styles.stateBand : ''}`} aria-label={group.name}>
            <h3 className={styles.bandHeader} style={{ backgroundColor: cssColor(primary.value), color: foreground(primary, colors) }}>{group.name}</h3>
            <div className={styles.swatches} tabIndex={0} role="group" aria-label={group.name}>
              {group.tokens.map((token, index) => (
                <div key={`${token.name}-${index}`} className={styles.swatch} style={{ backgroundColor: cssColor(token.value), color: foreground(token, colors) }} title={token.usage || undefined}>
                  <span className={styles.tokenName}>{token.name}</span>
                  <span className={styles.tokenValue}>{token.value}</span>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

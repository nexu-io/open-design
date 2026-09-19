import type { CSSProperties } from 'react';
import { useT } from '../i18n';
import type { DesignSystemToken } from './useDesignSystemTokens';
import styles from './DesignSystemFoundations.module.css';

interface Props {
  tokens: readonly DesignSystemToken[];
}

function originalTokens(tokens: readonly DesignSystemToken[]): DesignSystemToken[] {
  const byName = new Map(tokens.map((token) => [token.name, token]));
  const hasEvidence = (token: DesignSystemToken, seen = new Set<string>()): boolean => {
    if (token.sourceBacked !== true || seen.has(token.name)) return false;
    const references = [...token.value.matchAll(/var\(\s*(--[\w-]+)/g)];
    return references.every((match) => {
      const dependency = byName.get(match[1]!);
      return dependency !== undefined && hasEvidence(dependency, new Set([...seen, token.name]));
    });
  };
  return tokens.filter((token) => hasEvidence(token));
}

function scopedValue(value: string): string {
  return value.replace(/var\(\s*--([\w-]+)/g, 'var(--ds-foundation-$1');
}

function resolveValue(value: string, tokens: readonly DesignSystemToken[], seen = new Set<string>()): string {
  return value.replace(/var\(\s*(--[\w-]+)(?:\s*,\s*([^()]*))?\s*\)/g, (original, name: string, fallback: string | undefined) => {
    if (seen.has(name)) return fallback || original;
    const referenced = tokens.find((token) => token.name === name);
    if (!referenced) return fallback || original;
    return resolveValue(referenced.value, tokens, new Set([...seen, name]));
  });
}

function foundationFonts(tokens: readonly DesignSystemToken[]) {
  const fontTokens = tokens.filter((token) => token.type === 'fontFamily' && token.value.trim());
  const used = new Set<string>();
  const fonts: Array<{ key: string; family: string; stack: string }> = [];
  const addToken = (token: DesignSystemToken) => {
    used.add(token.name);
    const resolved = resolveValue(token.value, tokens);
    const family = (resolved.split(',')[0] || resolved).trim().replace(/^['"]|['"]$/g, '');
    fonts.push({ key: token.name, family, stack: scopedValue(token.value) });
  };
  for (const role of ['display', 'body', 'mono'] as const) {
    const token = fontTokens.find((item) => item.name === `--font-${role}`);
    if (token) addToken(token);
  }
  fontTokens.filter((token) => !used.has(token.name)).forEach(addToken);
  return fonts;
}

function foundationGroups(tokens: readonly DesignSystemToken[]) {
  const populated = tokens.filter((token) => token.name.trim() && token.value.trim());
  return {
    shadow: populated.filter((token) => token.type === 'shadow'),
    radius: populated.filter((token) => /(?:^|[-_])radius(?:$|[-_])/.test(token.name) && ['dimension', 'number'].includes(token.type)),
    spacing: populated.filter((token) => /(?:^|[-_])(?:space|spacing)(?:$|[-_])/.test(token.name) && ['dimension', 'number'].includes(token.type)),
  };
}

export function hasDesignSystemFoundations(tokens: readonly DesignSystemToken[]): boolean {
  const original = originalTokens(tokens);
  return foundationFonts(original).length > 0
    || Object.values(foundationGroups(original)).some((items) => items.length > 0);
}

export function DesignSystemFoundations({ tokens }: Props) {
  const t = useT();
  const original = originalTokens(tokens);
  const fonts = foundationFonts(original);
  const foundationTokens = foundationGroups(original);
  const groups = [
    { kind: 'shadow', label: t('ds.foundationShadow'), items: foundationTokens.shadow },
    { kind: 'radius', label: t('ds.foundationRadius'), items: foundationTokens.radius },
    { kind: 'spacing', label: t('ds.foundationSpacing'), items: foundationTokens.spacing },
  ] as const;
  const variables = Object.fromEntries(original.filter((token) => /^--[\w-]+$/.test(token.name))
    .map((token) => [`--ds-foundation-${token.name.slice(2)}`, scopedValue(token.value)])) as CSSProperties;
  if (fonts.length === 0 && groups.every((group) => group.items.length === 0)) return null;

  return (
    <div className={styles.root} style={variables} data-testid="design-system-foundations">
      {fonts.length > 0 ? <div className={styles.fonts}>
        {fonts.map((font) => (
          <article key={font.key} className={styles.card}>
            <div className={styles.fontSample} style={{ fontFamily: font.stack }} aria-hidden="true">Aa</div>
            <div className={styles.fontMeta}>
              <span className={styles.label}>{t('ds.foundationFont')}</span>
              <span className={styles.fontName} title={font.stack}>{font.family}</span>
            </div>
          </article>
        ))}
      </div> : null}
      {groups.filter((group) => group.items.length > 0).map((group) => (
        <section key={group.kind} className={styles.card} aria-label={group.label}>
          <div className={styles.samples}>
            {group.items.map((token) => {
              const value = scopedValue(token.value);
              const dimension = token.type === 'number' && /^\d+(\.\d+)?$/.test(value) ? `${value}px` : value;
              return (
                <div key={token.name} className={styles.sample} title={`${token.name}: ${token.value}`}>
                  <div className={styles.sampleStage} aria-hidden="true">
                    {group.kind === 'shadow' ? <div className={styles.shadowSample} style={{ boxShadow: value }} />
                      : group.kind === 'radius' ? <div className={styles.radiusSample} style={{ borderRadius: dimension }} />
                        : <div className={styles.spacingSample} style={{ width: dimension }} />}
                  </div>
                  <span className={styles.sampleName}>{group.kind === 'shadow' ? token.name.replace(/^--/, '') : token.value}</span>
                  {group.kind !== 'shadow' ? <span className={styles.tokenName}>{token.name.replace(/^--/, '')}</span> : null}
                </div>
              );
            })}
          </div>
          <h3 className={styles.groupLabel}>{group.label}</h3>
        </section>
      ))}
    </div>
  );
}

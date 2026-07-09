/**
 * Role: 브랜드 상세 리치 페이지 — 히어로 + 브랜드 컨텍스트 + 디자인 시스템 + 지식 문서(마스터-디테일)
 * Key Features: manifest.presentation·palette 시각화, 문서 리스트→프리뷰 재호출, fetch 실패 폴백
 * Dependencies: fetchBrand, renderMarkdownToSafeHtml, i18n
 * Notes: 편집 기능 없음(서브프로젝트 B). 마크다운 내 상대 이미지 미렌더(기존 MVP 한계 유지).
 */
import { useEffect, useState } from 'react';
import { Button } from '@marketing-ax/components';
import type { BrandDetail } from '@marketing-ax/contracts';
import { renderMarkdownToSafeHtml } from '../artifacts/markdown';
import { useI18n } from '../i18n';
import { fetchBrand } from '../providers/registry';
import styles from './BrandDetailView.module.css';

interface Props {
  brandId: string;
  onBack: () => void;
}

export function BrandDetailView({ brandId, onBack }: Props) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<BrandDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [doc, setDoc] = useState<string>('core'); // 'core' | deliverable key

  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetchBrand(brandId, doc === 'core' ? undefined : doc)
      .then((d) => alive && setDetail(d))
      .catch(() => {
        if (!alive) return;
        setDetail(null);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [brandId, doc]);

  if (failed) {
    return (
      <div className="tab-panel" data-testid="brand-detail">
        <Button variant="ghost" onClick={onBack}>
          {t('brands.back')}
        </Button>
        <div role="alert">{t('brands.loadFailed')}</div>
      </div>
    );
  }
  if (!detail) return <div className="tab-panel" data-testid="brand-detail" />;

  const p = detail.presentation;
  const primary = detail.primaryColor ?? detail.palette?.[0]?.value ?? '#1E86FA';
  const swatches = [
    ...(detail.palette?.map((e) => e.value) ?? []),
    ...(p?.neutralPalette ?? []),
  ];
  const channels = detail.deliverables.map((k) => detail.deliverableLabels?.[k] ?? k).join(' · ');
  const contextRows: Array<[string, string | undefined]> = [
    [t('brands.fieldTagline'), p?.tagline],
    [t('brands.fieldWebsite'), p?.website],
    [t('brands.fieldAudience'), p?.audience],
    [t('brands.fieldKeyMessage'), p?.keyMessage],
    [t('brands.fieldAvoid'), p?.avoid],
    [t('brands.fieldChannels'), channels || undefined],
  ];
  const body = doc === 'core' ? detail.body : detail.deliverable?.body ?? '';
  const docItems: Array<{ key: string; label: string }> = [
    { key: 'core', label: t('brands.coreDocLabel') },
    ...detail.deliverables.map((k) => ({ key: k, label: detail.deliverableLabels?.[k] ?? k })),
  ];

  return (
    <div className={styles.page} data-testid="brand-detail">
      <div className={styles.breadcrumb}>
        <button type="button" className={styles.breadcrumbLink} onClick={onBack}>
          {t('brands.pageTitle')}
        </button>
        <span>/</span>
        <span>{detail.title}</span>
      </div>

      <div className={styles.hero}>
        <div className={styles.tile} style={{ background: primary }}>
          {detail.title.slice(0, 1)}
        </div>
        <div>
          <h1 className={styles.heroTitle}>{detail.title}</h1>
          {p?.subtitle && <p className={styles.heroSubtitle}>{p.subtitle}</p>}
        </div>
      </div>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionDot} />
          {t('brands.sectionContext')}
        </div>
        <div className={styles.contextTable}>
          {contextRows
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <div key={k} className={styles.contextRow}>
                <span className={styles.contextKey}>{k}</span>
                <span className={styles.contextValue}>{v}</span>
              </div>
            ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionDot} />
          {t('brands.sectionDesignSystem')}
        </div>
        <div className={styles.dsGrid}>
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t('brands.palette')}</div>
            <div className={styles.swatches}>
              {swatches.map((hex) => (
                <div key={hex} className={styles.swatch}>
                  <span className={styles.swatchChip} style={{ background: hex }} />
                  <span className={styles.swatchHex}>{hex}</span>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t('brands.typography')}</div>
            {p?.typography && (
              <>
                <div className={styles.typeFamily}>{p.typography.family}</div>
                <div className={styles.typeMeta}>
                  {[p.typography.roles, p.typography.weights].filter(Boolean).join(' / ')}
                </div>
              </>
            )}
            <div className={styles.dsMeta}>
              {t('brands.paletteChannelMeta', { c: swatches.length, n: detail.deliverables.length })}
            </div>
          </div>
        </div>
        {p?.voiceTone && p.voiceTone.length > 0 && (
          <div className={styles.card}>
            <div className={styles.cardLabel}>{t('brands.voiceTone')}</div>
            <div className={styles.toneChips}>
              {p.voiceTone.map((tone) => (
                <span key={tone} className={styles.toneChip}>
                  {tone}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionDot} />
          {t('brands.sectionDocs')}
        </div>
        <p className={styles.heroSubtitle}>{t('brands.docsHint')}</p>
        <div className={styles.docs}>
          <div className={styles.docList} role="tablist">
            {docItems.map((item) => (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={doc === item.key}
                className={`${styles.docItem} ${doc === item.key ? styles.docItemActive : ''}`}
                onClick={() => setDoc(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <article
            className={styles.docPreview}
            // 데몬이 소유한 신뢰 마크다운 → sanitize 렌더러 경유
            dangerouslySetInnerHTML={{ __html: renderMarkdownToSafeHtml(body) }}
          />
        </div>
      </section>
    </div>
  );
}

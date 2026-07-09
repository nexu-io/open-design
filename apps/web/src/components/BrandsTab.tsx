/**
 * Role: 브랜드 목록 페이지 — 헤더 + 2열 리치 카드 그리드 (읽기 전용)
 * Key Features: fetchBrands 로드, 이니셜 타일·subtitle·tagline·채널 배지·프로젝트수/톤 메타, 카드 클릭 → 상세
 * Dependencies: providers/registry.fetchBrands, i18n
 * Notes: 생성/편집(+새 브랜드·⋯메뉴)은 서브프로젝트 B — 여기 없음.
 */
import { useEffect, useState } from 'react';
import type { BrandSummary } from '@marketing-ax/contracts';
import { useI18n } from '../i18n';
import { fetchBrands } from '../providers/registry';
import styles from './BrandsTab.module.css';

interface Props {
  onOpenBrand: (brandId: string) => void;
}

export function BrandsTab({ onOpenBrand }: Props) {
  const { t } = useI18n();
  const [brands, setBrands] = useState<BrandSummary[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetchBrands()
      .then((rows) => alive && setBrands(rows))
      .catch(() => alive && setBrands([]));
    return () => {
      alive = false;
    };
  }, []);
  if (brands === null) return <div className={styles.page} data-testid="brands-tab" />;
  return (
    <div className={styles.page} data-testid="brands-tab">
      <div className={styles.head}>
        <h1 className={styles.title}>{t('brands.pageTitle')}</h1>
        <p className={styles.subtitle}>{t('brands.pageSubtitle')}</p>
      </div>
      {brands.length === 0 ? (
        <p className={styles.empty}>{t('brands.empty')}</p>
      ) : (
        <div className={styles.grid} data-testid="brands-grid">
          {brands.map((brand) => {
            const projectCountLabel =
              typeof brand.projectCount === 'number'
                ? t('brands.projectCount', { n: brand.projectCount })
                : null;
            const hasMeta = Boolean(projectCountLabel || brand.toneLabel);
            return (
              <button
                key={brand.id}
                type="button"
                className={styles.card}
                onClick={() => onOpenBrand(brand.id)}
              >
                <div className={styles.cardHead}>
                  <div
                    className={styles.tile}
                    style={{ background: brand.primaryColor ?? '#1E86FA' }}
                  >
                    {brand.title.slice(0, 1)}
                  </div>
                  <div>
                    <div className={styles.cardTitle}>{brand.title}</div>
                    {brand.subtitle && <div className={styles.cardSubtitle}>{brand.subtitle}</div>}
                  </div>
                </div>
                {brand.tagline && <div className={styles.tagline}>{brand.tagline}</div>}
                <div className={styles.badges}>
                  {brand.deliverables.map((k) => (
                    <span key={k} className={styles.badge}>
                      {brand.deliverableLabels?.[k] ?? k}
                    </span>
                  ))}
                </div>
                {hasMeta && (
                  <div className={styles.meta}>
                    {projectCountLabel && <span>{projectCountLabel}</span>}
                    {projectCountLabel && brand.toneLabel && ' · '}
                    {brand.toneLabel && <span>{brand.toneLabel}</span>}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

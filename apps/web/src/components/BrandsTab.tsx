/**
 * Role: 브랜드 목록 페이지 — 헤더 + 2열 리치 카드 그리드 + 생성 진입점
 * Key Features: fetchBrands 로드, 이니셜 타일·subtitle·tagline·채널 배지·프로젝트수/톤 메타, 카드 클릭 → 상세, "+ 새 브랜드" → BrandCreateModal
 * Dependencies: providers/registry.fetchBrands, BrandCreateModal, @marketing-ax/components Button, i18n
 * Notes: 상세 편집(presentation·문서·채널·에셋·삭제)은 BrandDetailView 담당.
 */
import { useEffect, useState } from 'react';
import type { BrandSummary } from '@marketing-ax/contracts';
import { Button } from '@marketing-ax/components';
import { useI18n } from '../i18n';
import { fetchBrands } from '../providers/registry';
import { brandAccentFallback } from './brand-accent';
import { BrandCreateModal } from './BrandCreateModal';
import styles from './BrandsTab.module.css';

interface Props {
  onOpenBrand: (brandId: string) => void;
}

export function BrandsTab({ onOpenBrand }: Props) {
  const { t } = useI18n();
  const [brands, setBrands] = useState<BrandSummary[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
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
        <div>
          <h1 className={styles.title}>{t('brands.pageTitle')}</h1>
          <p className={styles.subtitle}>{t('brands.pageSubtitle')}</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>
          {t('brands.newButton')}
        </Button>
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
                  {brand.iconUrl ? (
                    <img
                      className={styles.tile}
                      src={brand.iconUrl}
                      alt=""
                      aria-hidden
                    />
                  ) : (
                    <div
                      className={styles.tile}
                      style={{ background: brand.primaryColor ?? brandAccentFallback(brand.id) }}
                    >
                      {brand.title.slice(0, 1)}
                    </div>
                  )}
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
      {showCreate && (
        <BrandCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={(brandId) => {
            setShowCreate(false);
            onOpenBrand(brandId);
          }}
        />
      )}
    </div>
  );
}

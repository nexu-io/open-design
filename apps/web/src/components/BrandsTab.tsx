/**
 * Role: Brands 읽기 전용 목록 탭 — 브랜드 카드 그리드
 * Key Features: fetchBrands 로드, 채널 칩 표시, 카드 클릭 → 상세 라우트
 * Dependencies: providers/registry.fetchBrands, i18n
 */
import { useEffect, useState } from 'react';
import type { BrandSummary } from '@marketing-ax/contracts';
import { useI18n } from '../i18n';
import { fetchBrands } from '../providers/registry';

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
  if (brands === null) return <div className="tab-panel" data-testid="brands-tab" />;
  return (
    <div className="tab-panel" data-testid="brands-tab">
      {brands.length === 0 ? (
        <p>{t('brands.empty')}</p>
      ) : (
        <div className="ds-grid" data-testid="brands-grid">
          {brands.map((brand) => (
            <button
              key={brand.id}
              type="button"
              className="ds-card"
              onClick={() => onOpenBrand(brand.id)}
            >
              <div className="ds-card-meta">
                <span className="ds-card-title">{brand.title}</span>
                <span className="ds-card-category">
                  {brand.deliverables.map((d) => (
                    <span key={d} className="ds-card-badge">
                      {d}
                    </span>
                  ))}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

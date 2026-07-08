/**
 * Role: 브랜드 상세 읽기 전용 뷰 — 코어/채널 마크다운 + 에셋 미리보기
 * Key Features: 코어 + 채널 탭(fetchBrand ?deliverable 재호출), 에셋 이미지,
 *   fetch 실패 시 백버튼 + 에러 메시지 렌더(빈 화면 데드엔드 방지)
 * Dependencies: fetchBrand, renderMarkdownToSafeHtml
 * Notes: 편집 기능 없음(후속 트랙). ds-tag-tabs/ds-review-section 전역 클래스 재사용.
 *   에셋 미리보기(cardnews 탭 본문의 상대 이미지 참조)는 마크다운 렌더러가 처리하지
 *   못해 MVP는 본문 텍스트만 렌더링한다 — 에셋 바이트 라우트는 후속 이미지 패널용으로
 *   이미 존재하므로 YAGNI.
 */
import { useEffect, useState } from 'react';
import { Button } from '@marketing-ax/components';
import type { BrandDetail } from '@marketing-ax/contracts';
import { renderMarkdownToSafeHtml } from '../artifacts/markdown';
import { useI18n } from '../i18n';
import { fetchBrand } from '../providers/registry';
import { Icon } from './Icon';

interface Props {
  brandId: string;
  onBack: () => void;
}

export function BrandDetailView({ brandId, onBack }: Props) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<BrandDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<string>('core');
  useEffect(() => {
    let alive = true;
    setFailed(false);
    fetchBrand(brandId, tab === 'core' ? undefined : tab)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
      })
      .catch(() => {
        if (!alive) return;
        // 탭 전환 중 실패도 같은 경로를 탄다 — 이전 탭의 content를 조용히
        // 지우는 대신 에러 상태로 명시적으로 대체한다.
        setDetail(null);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [brandId, tab]);
  if (failed) {
    return (
      <div className="tab-panel" data-testid="brand-detail">
        <header className="entry-section__head">
          <Button variant="ghost" onClick={onBack}>
            <Icon name="arrow-left" size={16} />
            {t('brands.back')}
          </Button>
        </header>
        <div role="alert">{t('brands.loadFailed')}</div>
      </div>
    );
  }
  if (!detail) return <div className="tab-panel" data-testid="brand-detail" />;
  const body = tab === 'core' ? detail.body : detail.deliverable?.body ?? '';
  return (
    <div className="tab-panel" data-testid="brand-detail">
      <header className="entry-section__head">
        <Button variant="ghost" onClick={onBack}>
          <Icon name="arrow-left" size={16} />
          {t('brands.back')}
        </Button>
        <h1 className="entry-section__title">{detail.title}</h1>
      </header>
      <nav className="ds-tag-tabs" role="tablist" aria-label={detail.title}>
        {['core', ...detail.deliverables].map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key)}
          >
            {key === 'core' ? t('brands.core') : key}
          </button>
        ))}
      </nav>
      <article
        className="ds-review-section"
        // 데몬이 소유한 신뢰 마크다운 → sanitize 렌더러 경유
        dangerouslySetInnerHTML={{ __html: renderMarkdownToSafeHtml(body) }}
      />
    </div>
  );
}

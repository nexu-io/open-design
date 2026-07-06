import { useEffect, useState } from 'react';
import type { BrandSummary } from '@open-design/contracts';
import { useT } from '../i18n';
import { fetchDesignSystem } from '../providers/registry';
import {
  brandSummaryToKit,
  useDesignKit,
} from '../runtime/design-kit';
import type { DesignSystemDetail, DesignSystemSummary } from '../types';
import { DesignKitView } from './DesignKitView';
import {
  designSystemLogoHost,
  isUserSystem,
} from './design-system-metadata';

interface DesignSystemKitPreviewProps {
  system: DesignSystemSummary;
  brandSummary?: BrandSummary | null;
  variant?: 'panel' | 'compact';
  showCover?: boolean;
  className?: string;
  dataTestId?: string;
}

export function DesignSystemKitPreview({
  system,
  brandSummary,
  variant = 'panel',
  showCover = false,
  className,
  dataTestId = 'design-system-kit-preview',
}: DesignSystemKitPreviewProps) {
  if (brandSummary) {
    return (
      <BrandDesignSystemKitPreview
        summary={brandSummary}
        variant={variant}
        showCover={showCover}
        className={className}
        dataTestId={dataTestId}
      />
    );
  }

  return (
    <RegistryDesignSystemKitPreview
      system={system}
      variant={variant}
      showCover={showCover}
      className={className}
      dataTestId={dataTestId}
    />
  );
}

function BrandDesignSystemKitPreview({
  summary,
  variant,
  showCover,
  className,
  dataTestId,
}: {
  summary: BrandSummary;
  variant: 'panel' | 'compact';
  showCover: boolean;
  className?: string;
  dataTestId: string;
}) {
  const kit = brandSummaryToKit(summary);
  return (
    <div className={className} data-testid={dataTestId}>
      <DesignKitView
        kit={kit}
        variant={variant}
        showCover={showCover}
        dataTestId={`${dataTestId}-view`}
      />
    </div>
  );
}

function RegistryDesignSystemKitPreview({
  system,
  variant,
  showCover,
  className,
  dataTestId,
}: {
  system: DesignSystemSummary;
  variant: 'panel' | 'compact';
  showCover: boolean;
  className?: string;
  dataTestId: string;
}) {
  const t = useT();
  const [detail, setDetail] = useState<DesignSystemDetail | null>(null);
  const [detailResolved, setDetailResolved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setDetailResolved(false);
    void fetchDesignSystem(system.id)
      .then((next) => {
        if (cancelled) return;
        setDetail(next);
        setDetailResolved(true);
      })
      .catch(() => {
        if (!cancelled) setDetailResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [system.id]);

  const projectId = detail?.projectId ?? system.projectId;
  const host = designSystemLogoHost(system) || undefined;
  const { kit, loading } = useDesignKit({
    designSystemId: system.id,
    title: system.title,
    projectId,
    body: detail?.body,
    packageInfo: detail?.packageInfo,
    swatches: system.swatches,
    showcaseHtml: null,
    editable: isUserSystem(system),
    host,
  });

  const pending = !detailResolved || loading || !kit;

  return (
    <div className={className} data-testid={dataTestId}>
      {pending ? (
        <div
          className="design-system-kit-preview-loading"
          role="status"
          aria-busy="true"
          data-testid={`${dataTestId}-loading`}
        >
          {t('designSystemPicker.loadingPreview')}
        </div>
      ) : (
        <DesignKitView
          kit={kit}
          variant={variant}
          showCover={showCover}
          dataTestId={`${dataTestId}-view`}
        />
      )}
    </div>
  );
}

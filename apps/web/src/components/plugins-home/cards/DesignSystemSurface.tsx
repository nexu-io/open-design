// Design-system preview surface — showcase thumbnail with a brand-patch fallback.
//
// Most design-system plugins reference an upstream design system in
// `od.context.designSystem.ref`. When available, reuse the same
// showcase route as the detail modal so the home grid reads like real
// website thumbnails rather than synthetic color swatches. The iframe
// uses native lazy loading so off-screen cards do not eagerly render.

import type { DesignPreviewSpec } from '../preview';

interface Props {
  preview: DesignPreviewSpec;
}

export function DesignSystemSurface({ preview }: Props) {
  if (preview.designSystemId) {
    return (
      <div className="plugins-home__design plugins-home__design--showcase">
        <div className="plugins-home__design-showcase">
          <iframe
            title={`${preview.brand} showcase preview`}
            src={`/api/design-systems/${encodeURIComponent(preview.designSystemId)}/showcase`}
            sandbox="allow-scripts"
            loading="lazy"
            tabIndex={-1}
            aria-hidden
            className="plugins-home__design-iframe"
          />
        </div>
      </div>
    );
  }

  const [primary, secondary, ink] = preview.swatches;
  return (
    <div
      className="plugins-home__design"
      style={{
        background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`,
        color: ink,
      }}
    >
      <div className="plugins-home__design-headline">
        The system that <br />
        makes <strong>{preview.brand}</strong> <br />
        feel like {preview.brand}.
      </div>
      <div className="plugins-home__design-specimen" aria-hidden>
        <span>Aa</span>
        <span>Bb</span>
        <span>Cc</span>
      </div>
      <div className="plugins-home__design-swatches" aria-hidden>
        {preview.swatches.map((c, i) => (
          <span key={i} style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

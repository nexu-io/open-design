import { useCallback, useSyncExternalStore } from "react";
import { useI18n } from '../../i18n/I18n';
import {
  Aperture,
  BracketsCurly,
  ChartBarHorizontal,
  ClockCounterClockwise,
  Code,
  FilmSlate,
  Image,
  Layout,
  Monitor,
  Presentation,
  SlidersHorizontal,
  SquaresFour,
  Stack,
  X,
  type Icon,
} from "@phosphor-icons/react";
import type { IDockviewPanelHeaderProps } from "dockview-react";
import { isPanelId, type PanelId } from "./panelRegistry";

const TAB_ICONS: Record<PanelId, Icon> = {
  preview: Monitor,
  timeline: ChartBarHorizontal,
  compositions: Layout,
  assets: Image,
  code: Code,
  catalog: SquaresFour,
  design: SlidersHorizontal,
  layers: Stack,
  renders: FilmSlate,
  variables: BracketsCurly,
  slideshow: Presentation,
  motionBlur: Aperture,
  history: ClockCounterClockwise,
};

/**
 * A dock tab. dock.css shows the type icon and close glyph on the shown tab only, keyed on
 * dockview's own tab class, so they swap in the frame the tab changes rather than a render later.
 */
export function DockTab({ api }: IDockviewPanelHeaderProps) {
  const { t } = useI18n();
  const subscribe = useCallback(
    (onChange: () => void) => {
      const subscription = api.onDidTitleChange(onChange);
      return () => subscription.dispose();
    },
    [api],
  );
  const title = useSyncExternalStore(subscribe, () => api.title ?? "");
  const TypeIcon = isPanelId(api.id) ? TAB_ICONS[api.id] : null;
  return (
    <div className="hf-dock-tab">
      {TypeIcon ? <TypeIcon className="hf-dock-tab-icon" size={14} aria-hidden /> : null}
      <span className="hf-dock-tab-label">{title}</span>
      {/* Same shape as dockview's own close control: a tab cannot hold a focusable button. */}
      <div
        role="button"
        tabIndex={-1}
        aria-label={t('Close {title}', { title })}
        className="hf-dock-tab-close"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          api.close();
        }}
      >
        <X size={12} aria-hidden />
      </div>
    </div>
  );
}

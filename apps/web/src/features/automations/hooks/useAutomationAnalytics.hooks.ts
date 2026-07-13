// Page-view + click analytics for the automations tab. Ref-keyed page-view
// firing so re-renders don't double-fire while the user stays on the page.
import { useCallback, useEffect, useState } from 'react';
import type { AutomationsClickProps } from '@open-design/contracts';

import { useAnalytics } from '../../../analytics/provider';
import { trackAutomationsClick, trackPageView } from '../../../analytics/events';

export interface AutomationAnalyticsController {
  fireClick: (
    element: AutomationsClickProps['element'],
    extra?: Pick<AutomationsClickProps, 'type_id' | 'filter_id' | 'template_kind'>,
  ) => void;
}

export function useAutomationAnalytics(): AutomationAnalyticsController {
  const analytics = useAnalytics();
  // P2 page_view page_name=automations. Ref-keyed so re-renders don't
  // double-fire while the user is on the page.
  const pageViewFiredRef = useState<{ fired: boolean }>(() => ({ fired: false }))[0];
  useEffect(() => {
    if (pageViewFiredRef.fired) return;
    pageViewFiredRef.fired = true;
    trackPageView(analytics.track, { page_name: 'automations' });
  }, [analytics.track, pageViewFiredRef]);

  // P2 ui_click page_name=automations. Fire on every actionable click inside
  // the tab before running the handler, so navigations that unmount the view
  // still report.
  const fireClick = useCallback(
    (
      element: AutomationsClickProps['element'],
      extra?: Pick<AutomationsClickProps, 'type_id' | 'filter_id' | 'template_kind'>,
    ) => {
      trackAutomationsClick(analytics.track, {
        page_name: 'automations',
        area: 'automations',
        element,
        ...extra,
      });
    },
    [analytics.track],
  );

  return { fireClick };
}

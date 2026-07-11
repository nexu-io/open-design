// Feature-local hook for HtmlViewer's toolbar chrome: the preview/source mode,
// the zoom level, the "more" overflow menu, the version-history modal's open
// state, and the present-menu's open state (the present menu's own JSX stays
// in the orchestrator's chrome-actions portal — see ViewerToolbar.tsx — but
// its outside-click/Escape dismiss effect is grouped here with the other
// toolbar popovers, mirroring the plan's Cluster C grouping). Each popover
// dismisses on an outside mousedown or Escape via the injected dismiss port.
import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { dismissPort as realDismissPort } from '../dependencies';
import type { DismissPort } from '../ports';

export interface ViewerToolbarMenusController {
  mode: 'preview' | 'source';
  setMode: (mode: 'preview' | 'source') => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  zoomMenuOpen: boolean;
  setZoomMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  zoomMenuRef: MutableRefObject<HTMLDivElement | null>;
  presentMenuOpen: boolean;
  setPresentMenuOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  presentWrapRef: MutableRefObject<HTMLDivElement | null>;
  toolbarMoreOpen: boolean;
  setToolbarMoreOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  toolbarMoreRef: MutableRefObject<HTMLDivElement | null>;
  versionModalOpen: false | 'toolbar' | 'more_menu';
  setVersionModalOpen: (value: false | 'toolbar' | 'more_menu') => void;
}

export function useViewerToolbarMenus(dismissPort: DismissPort): ViewerToolbarMenusController {
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [zoom, setZoom] = useState(100);
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  const zoomMenuRef = useRef<HTMLDivElement | null>(null);
  const [presentMenuOpen, setPresentMenuOpen] = useState(false);
  const presentWrapRef = useRef<HTMLDivElement | null>(null);
  const [toolbarMoreOpen, setToolbarMoreOpen] = useState(false);
  const toolbarMoreRef = useRef<HTMLDivElement | null>(null);
  // False when closed; otherwise records which entry opened the modal so the
  // surface_view impression can carry entry_from.
  const [versionModalOpen, setVersionModalOpen] = useState<false | 'toolbar' | 'more_menu'>(false);

  useEffect(() => {
    if (!presentMenuOpen) return undefined;
    return dismissPort.subscribeOutsideDismiss(() => presentWrapRef.current, () => setPresentMenuOpen(false));
  }, [dismissPort, presentMenuOpen]);

  useEffect(() => {
    if (!zoomMenuOpen) return undefined;
    return dismissPort.subscribeOutsideDismiss(() => zoomMenuRef.current, () => setZoomMenuOpen(false));
  }, [dismissPort, zoomMenuOpen]);

  useEffect(() => {
    if (!toolbarMoreOpen) return undefined;
    return dismissPort.subscribeOutsideDismiss(() => toolbarMoreRef.current, () => setToolbarMoreOpen(false));
  }, [dismissPort, toolbarMoreOpen]);

  return {
    mode,
    setMode,
    zoom,
    setZoom,
    zoomMenuOpen,
    setZoomMenuOpen,
    zoomMenuRef,
    presentMenuOpen,
    setPresentMenuOpen,
    presentWrapRef,
    toolbarMoreOpen,
    setToolbarMoreOpen,
    toolbarMoreRef,
    versionModalOpen,
    setVersionModalOpen,
  };
}

export function useWiredViewerToolbarMenus(): ViewerToolbarMenusController {
  return useViewerToolbarMenus(realDismissPort);
}

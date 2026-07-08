import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface ExcalidrawApi {
  getSceneElementsIncludingDeleted: () => unknown[];
  getAppState: () => Record<string, unknown>;
  getFiles: () => Record<string, unknown>;
  setOpenDialog: (dialog: unknown) => void;
}

interface ExcalidrawMockProps {
  children?: ReactNode;
  excalidrawAPI?: (api: ExcalidrawApi) => void;
  initialData?: {
    elements?: unknown[];
    appState?: Record<string, unknown>;
    files?: Record<string, unknown>;
  };
  langCode?: string;
  theme?: string;
  renderTopRightUI?: (isMobile: boolean, appState: Record<string, unknown>) => ReactNode;
}

export function Excalidraw({
  children,
  excalidrawAPI,
  initialData,
  langCode,
  renderTopRightUI,
  theme,
}: ExcalidrawMockProps) {
  useEffect(() => {
    excalidrawAPI?.({
      getSceneElementsIncludingDeleted: () => initialData?.elements ?? [],
      getAppState: () => initialData?.appState ?? {},
      getFiles: () => initialData?.files ?? {},
      setOpenDialog: () => {},
    });
  }, [excalidrawAPI, initialData]);

  return (
    <div data-testid="excalidraw" data-lang={langCode ?? ''} data-theme={theme ?? ''}>
      <canvas />
      {renderTopRightUI?.(false, initialData?.appState ?? {})}
      {children}
    </div>
  );
}

function MainMenuItem({
  children,
  icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode }) {
  return (
    <button type="button" {...props}>
      {icon}
      {children}
    </button>
  );
}

export const MainMenu = Object.assign(
  ({ children }: { children?: ReactNode }) => (
    <div data-testid="excalidraw-main-menu">{children}</div>
  ),
  {
    Item: MainMenuItem,
    DefaultItems: {
      SearchMenu: () => null,
      Help: () => null,
      ChangeCanvasBackground: () => null,
    },
    Separator: () => null,
  },
);

export function convertToExcalidrawElements(elements: unknown[]) {
  return elements.map((element, index) => ({
    id: `mock-element-${index}`,
    isDeleted: false,
    ...(typeof element === 'object' && element !== null ? element : {}),
  }));
}

export function restore(data: {
  elements?: unknown[];
  appState?: Record<string, unknown> | null;
  files?: Record<string, unknown>;
} | null) {
  return {
    elements: data?.elements ?? [],
    appState: data?.appState ?? {},
    files: data?.files ?? {},
  };
}

export async function exportToSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('data-preview', 'excalidraw');
  return svg;
}

export async function exportToBlob() {
  return new Blob(['mock image'], { type: 'image/png' });
}

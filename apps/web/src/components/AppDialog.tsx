import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import {
  normalizeAppDialogOptions,
  setActiveAppDialogApi,
  showAppAlert,
  showAppConfirm,
  type AppDialogApi,
  type AppDialogOptions,
} from '../utils/app-dialog';

type DialogKind = 'alert' | 'confirm';

interface DialogRequest extends AppDialogOptions {
  id: number;
  kind: DialogKind;
  resolve: (value: boolean) => void;
}

const AppDialogContext = createContext<AppDialogApi | null>(null);

let dialogId = 0;

export function useAppAlert() {
  return useContext(AppDialogContext)?.alert ?? showAppAlert;
}

export function useAppConfirm() {
  return useContext(AppDialogContext)?.confirm ?? showAppConfirm;
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const currentRef = useRef<DialogRequest | null>(null);
  const queueRef = useRef<DialogRequest[]>([]);

  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  const push = useCallback((kind: DialogKind, options: AppDialogOptions | string) => {
    const normalized = normalizeAppDialogOptions(options);
    return new Promise<boolean>((resolve) => {
      const request: DialogRequest = {
        ...normalized,
        id: ++dialogId,
        kind,
        resolve,
      };
      if (currentRef.current) {
        queueRef.current.push(request);
      } else {
        currentRef.current = request;
        setCurrent(request);
      }
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    const request = currentRef.current;
    if (!request) return;
    request.resolve(value);
    const next = queueRef.current.shift() ?? null;
    currentRef.current = next;
    setCurrent(next);
  }, []);

  const api = useMemo<AppDialogApi>(() => ({
    alert: async (options) => {
      await push('alert', options);
    },
    confirm: (options) => push('confirm', options),
  }), [push]);

  useEffect(() => {
    setActiveAppDialogApi(api);
    return () => setActiveAppDialogApi(null);
  }, [api]);

  return (
    <AppDialogContext.Provider value={api}>
      {children}
      {current ? (
        <AppDialogModal
          request={current}
          t={t}
          onSettle={settle}
        />
      ) : null}
    </AppDialogContext.Provider>
  );
}

function AppDialogModal({
  request,
  t,
  onSettle,
}: {
  request: DialogRequest;
  t: (key: keyof Dict, vars?: Record<string, string | number>) => string;
  onSettle: (value: boolean) => void;
}) {
  const confirmLabel =
    request.confirmLabel ??
    (request.kind === 'alert'
      ? t('common.close')
      : request.danger
        ? t('common.delete')
        : 'OK');
  const cancelLabel = request.cancelLabel ?? t('common.cancel');
  const title = request.title ?? (request.kind === 'alert' ? 'Open Design' : 'Confirm action');
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, [request.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onSettle(request.kind === 'alert');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSettle, request.kind]);

  const modal = (
    <div
      className="modal-backdrop app-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onSettle(request.kind === 'alert');
      }}
    >
      <div
        className={`modal modal-confirm app-dialog${request.danger ? ' danger' : ''}`}
        role={request.kind === 'alert' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={`app-dialog-title-${request.id}`}
        aria-describedby={`app-dialog-message-${request.id}`}
      >
        <h2 id={`app-dialog-title-${request.id}`}>{title}</h2>
        <p id={`app-dialog-message-${request.id}`} className="modal-confirm-message">
          {request.message}
        </p>
        <div className="row">
          {request.kind === 'confirm' ? (
            <button type="button" onClick={() => onSettle(false)}>
              {cancelLabel}
            </button>
          ) : null}
          <button
            ref={confirmRef}
            type="button"
            className={`primary${request.danger ? ' danger' : ''}`}
            onClick={() => onSettle(true)}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

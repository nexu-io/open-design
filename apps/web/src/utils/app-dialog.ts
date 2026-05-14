export type AppDialogOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type AppDialogApi = {
  alert: (options: AppDialogOptions | string) => Promise<void>;
  confirm: (options: AppDialogOptions | string) => Promise<boolean>;
};

let activeDialogApi: AppDialogApi | null = null;

export function normalizeAppDialogOptions(options: AppDialogOptions | string): AppDialogOptions {
  return typeof options === 'string' ? { message: options } : options;
}

export function setActiveAppDialogApi(api: AppDialogApi | null) {
  activeDialogApi = api;
}

function appDialogUnavailableError(kind: 'alert' | 'confirm') {
  return new Error(`AppDialog API unavailable: no app dialog provider or native ${kind}() fallback is available.`);
}

export function showAppAlert(options: AppDialogOptions | string): Promise<void> {
  if (activeDialogApi) return activeDialogApi.alert(options);
  const normalized = normalizeAppDialogOptions(options);
  if (typeof globalThis.alert === 'function') {
    globalThis.alert(normalized.message);
    return Promise.resolve();
  }
  return Promise.reject(appDialogUnavailableError('alert'));
}

export function showAppConfirm(options: AppDialogOptions | string): Promise<boolean> {
  if (activeDialogApi) return activeDialogApi.confirm(options);
  const normalized = normalizeAppDialogOptions(options);
  if (typeof globalThis.confirm === 'function') {
    return Promise.resolve(globalThis.confirm(normalized.message));
  }
  return Promise.reject(appDialogUnavailableError('confirm'));
}

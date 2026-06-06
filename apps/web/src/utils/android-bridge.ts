import { Capacitor } from '@capacitor/core';
import { OPEN_DESIGN_HOST_GLOBAL, OPEN_DESIGN_HOST_CLIENT_TYPES, OPEN_DESIGN_HOST_VERSION } from '@open-design/host';

export function initializeAndroidBridge() {
  if (Capacitor.getPlatform() !== 'android') return;

  const androidBridge = {
    version: OPEN_DESIGN_HOST_VERSION,
    client: {
      type: OPEN_DESIGN_HOST_CLIENT_TYPES.ANDROID,
      platform: 'android',
    },
    // Mobile-specific overrides can be added here
    shell: {
        openExternal: async (url: string) => {
            window.open(url, '_blank');
            return { ok: true as const };
        },
        openPath: async () => {
            return { ok: false as const, reason: 'unsupported on android' };
        }
    },
    browser: {
        clearData: async () => ({ ok: true as const })
    },
    capture: {
        page: async () => ({ ok: false as const, reason: 'unsupported on android' })
    },
    project: {
        pickAndImport: async () => ({ ok: false as const, reason: 'unsupported on android' }),
        pickAndReplaceWorkingDir: async () => ({ ok: false as const, reason: 'unsupported on android' }),
    },
    pdf: {
        print: async () => ({ ok: false as const, reason: 'unsupported on android' })
    },
    pet: {
        setVisible: () => {}
    },
    updater: {
        status: async () => ({ ok: false as const, reason: 'unsupported on android' }),
        check: async () => ({ ok: false as const, reason: 'unsupported on android' }),
        download: async () => ({ ok: false as const, reason: 'unsupported on android' }),
        install: async () => ({ ok: false as const, reason: 'unsupported on android' }),
        quit: async () => ({ ok: false as const, reason: 'unsupported on android' }),
        subscribe: () => () => {}
    }
  };

  (window as any)[OPEN_DESIGN_HOST_GLOBAL] = androidBridge;

  // Set the data attribute for CSS targeting
  document.documentElement.setAttribute('data-od-client-type', OPEN_DESIGN_HOST_CLIENT_TYPES.ANDROID);
}

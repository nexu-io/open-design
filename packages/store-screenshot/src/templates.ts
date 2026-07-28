export type StoreScreenshotTemplateId = 'minimal-center' | 'gradient-device' | 'editorial-split';

export interface StoreScreenshotTemplate {
  id: StoreScreenshotTemplateId;
  background: 'solid' | 'gradient' | 'split';
  headlineAlign: 'center' | 'left';
  headlineScale: 'standard' | 'display';
  devicePlacement: 'bottom' | 'right';
  screenshotRadius: number;
  accentLabel: boolean;
  colors: {
    background: string;
    accent: string;
    text: string;
  };
}

export const storeScreenshotTemplates: Record<StoreScreenshotTemplateId, StoreScreenshotTemplate> = {
  'minimal-center': {
    id: 'minimal-center',
    background: 'solid',
    headlineAlign: 'center',
    headlineScale: 'standard',
    devicePlacement: 'bottom',
    screenshotRadius: 0,
    accentLabel: false,
    colors: { background: '#FFFFFF', accent: '#4F46E5', text: '#111827' },
  },
  'gradient-device': {
    id: 'gradient-device',
    background: 'gradient',
    headlineAlign: 'left',
    headlineScale: 'standard',
    devicePlacement: 'right',
    screenshotRadius: 48,
    accentLabel: false,
    colors: { background: '#312E81', accent: '#A78BFA', text: '#FFFFFF' },
  },
  'editorial-split': {
    id: 'editorial-split',
    background: 'split',
    headlineAlign: 'left',
    headlineScale: 'display',
    devicePlacement: 'bottom',
    screenshotRadius: 0,
    accentLabel: true,
    colors: { background: '#FFF7ED', accent: '#EA580C', text: '#1C1917' },
  },
};

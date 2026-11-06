import type { Express } from 'express';
import type { WhatsNewResponse } from '@open-design/contracts';
import { readCurrentAppVersionInfo } from '../app-version.js';
import { type WhatsNewService } from '../services/whats-new.js';

export interface RegisterWhatsNewRoutesDeps {
  whatsNew: WhatsNewService;
}

export function registerWhatsNewRoutes(app: Express, ctx: RegisterWhatsNewRoutesDeps): void {
  const { whatsNew } = ctx;

  app.get('/api/whats-new', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    const result = await whatsNew.readWhatsNew(versionInfo.channel);
    const payload: WhatsNewResponse = {
      version: versionInfo.version,
      id: result.id,
      content: result.content,
    };
    res.json(payload);
  });
}

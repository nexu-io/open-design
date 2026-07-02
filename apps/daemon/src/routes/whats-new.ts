import type { Express } from 'express';
import type { WhatsNewResponse } from '@open-design/contracts';
import { readCurrentAppVersionInfo } from '../app-version.js';
import { whatsNewReleaseUrl, type WhatsNewService } from '../services/whats-new.js';

export interface RegisterWhatsNewRoutesDeps {
  whatsNew: WhatsNewService;
}

export function registerWhatsNewRoutes(app: Express, ctx: RegisterWhatsNewRoutesDeps): void {
  const { whatsNew } = ctx;

  app.get('/api/whats-new', async (_req, res) => {
    const versionInfo = await readCurrentAppVersionInfo();
    const input = { version: versionInfo.version, channel: versionInfo.channel };
    const result = await whatsNew.readWhatsNew(input);
    const payload: WhatsNewResponse = {
      version: input.version,
      channel: input.channel,
      content: result.content,
      releaseUrl: whatsNewReleaseUrl(input),
    };
    res.json(payload);
  });
}

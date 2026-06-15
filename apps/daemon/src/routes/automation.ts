import type { Express } from 'express';
import type { AutomationProposalStatus } from '@open-design/contracts';

import {
  applyAutomationProposal,
  createAutomationProposal,
  getAutomationProposal,
  listAutomationProposals,
  rejectAutomationProposal,
} from '../automation-proposals.js';
import {
  getAutomationSourcePacket,
  ingestAutomationSource,
  listAutomationSourcePackets,
} from '../automation-ingestions.js';

export interface RegisterAutomationRoutesDeps {
  paths: {
    RUNTIME_DATA_DIR: string;
  };
}

function errorMessage(err: unknown): string {
  return String((err as { message?: unknown } | null)?.message || err);
}

function proposalStatus(raw: unknown): AutomationProposalStatus | 'all' {
  return typeof raw === 'string' ? raw as AutomationProposalStatus | 'all' : 'all';
}

export function registerAutomationRoutes(app: Express, deps: RegisterAutomationRoutesDeps): void {
  const { RUNTIME_DATA_DIR } = deps.paths;

  app.get('/api/automation-source-packets', async (req, res) => {
    try {
      const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
      const packets = await listAutomationSourcePackets(
        RUNTIME_DATA_DIR,
        limit === undefined ? {} : { limit },
      );
      res.json({ packets });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  app.post('/api/automation-ingestions', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await ingestAutomationSource(RUNTIME_DATA_DIR, body);
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.get('/api/automation-source-packets/:id', async (req, res) => {
    try {
      const packet = await getAutomationSourcePacket(RUNTIME_DATA_DIR, req.params.id);
      if (!packet) return res.status(404).json({ error: 'automation source packet not found' });
      res.json({ packet });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.get('/api/automation-proposals', async (req, res) => {
    try {
      const rawStatus = proposalStatus(req.query.status);
      const proposals = await listAutomationProposals(RUNTIME_DATA_DIR, {
        status: rawStatus,
      });
      res.json({ proposals });
    } catch (err) {
      res.status(500).json({ error: errorMessage(err) });
    }
  });

  app.post('/api/automation-proposals', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const proposal = await createAutomationProposal(RUNTIME_DATA_DIR, body);
      res.json({ proposal });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.get('/api/automation-proposals/:id', async (req, res) => {
    try {
      const proposal = await getAutomationProposal(RUNTIME_DATA_DIR, req.params.id);
      if (!proposal) return res.status(404).json({ error: 'automation proposal not found' });
      res.json({ proposal });
    } catch (err) {
      res.status(400).json({ error: errorMessage(err) });
    }
  });

  app.post('/api/automation-proposals/:id/apply', async (req, res) => {
    try {
      const result = await applyAutomationProposal(RUNTIME_DATA_DIR, req.params.id);
      res.json(result);
    } catch (err) {
      const message = errorMessage(err);
      const status = message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });

  app.post('/api/automation-proposals/:id/reject', async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const proposal = await rejectAutomationProposal(
        RUNTIME_DATA_DIR,
        req.params.id,
        typeof body.reason === 'string' ? body.reason : undefined,
      );
      res.json({ proposal });
    } catch (err) {
      const message = errorMessage(err);
      const status = message.includes('not found') ? 404 : 400;
      res.status(status).json({ error: message });
    }
  });
}

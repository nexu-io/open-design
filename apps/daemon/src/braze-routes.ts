// Braze IAM authoring HTTP surface (/api/braze/*). Drives the fixed flow
// request → interview → plan(draft) → confirm gate → produce → edit → done
// (DATA-MODEL-BRAZE.md §1). The web UI and the `od braze` CLI both call these
// endpoints — they are the single source of truth for the workflow.

import type { Express } from 'express';
import { randomUUID } from 'node:crypto';
import type {
  BrazeBriefSaveRequest,
  BrazeInterviewRequest,
  BrazeMessageCreateRequest,
  BrazeMessageStatus,
  BrazePlan,
  BrazePlanDecisionRequest,
  BrazePlanUpsertRequest,
  BrazeVariantProduceRequest,
  BrazeVariantStatus,
  BrazeVariantUpdateRequest,
} from '@open-design/contracts';
import {
  deleteBrazeMessage,
  getBrazeMessage,
  getBrazeVariant,
  insertBrazeMessage,
  insertBrazeVariant,
  listBrazeMessages,
  updateBrazeMessage,
  updateBrazeVariant,
} from './braze/persistence.js';
import { getProject } from './db.js';
import { writeProjectFile } from './projects.js';
import type { RouteDeps } from './server-context.js';

export interface RegisterBrazeRoutesDeps extends RouteDeps<'db' | 'http' | 'paths'> {}

// A→Z labels for generated variants.
function variantLabel(index: number): string {
  return String.fromCharCode(65 + (index % 26));
}

export function registerBrazeRoutes(app: Express, ctx: RegisterBrazeRoutesDeps) {
  const { db } = ctx;
  const { PROJECTS_DIR } = ctx.paths;
  const { sendApiError } = ctx.http;
  const now = () => Date.now();

  // Create an IAM authoring unit. status → interviewing.
  app.post('/api/braze/messages', (req, res) => {
    const body = (req.body ?? {}) as Partial<BrazeMessageCreateRequest>;
    if (!body.projectId || !body.conversationId || !body.title) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'projectId, conversationId and title are required');
    }
    const id = randomUUID();
    insertBrazeMessage(db, {
      id,
      projectId: body.projectId,
      conversationId: body.conversationId,
      title: body.title,
      goal: body.goal ?? null,
      brandId: body.brandId ?? null,
      now: now(),
    });
    res.json({ message: getBrazeMessage(db, id) });
  });

  // List messages for a project.
  app.get('/api/braze/messages', (req, res) => {
    const projectId = typeof req.query.projectId === 'string' ? req.query.projectId : '';
    if (!projectId) return sendApiError(res, 400, 'BAD_REQUEST', 'projectId query param is required');
    res.json({ messages: listBrazeMessages(db, projectId) });
  });

  // Get a single message with its variants.
  app.get('/api/braze/messages/:id', (req, res) => {
    const message = getBrazeMessage(db, req.params.id);
    if (!message) return sendApiError(res, 404, 'NOT_FOUND', 'braze message not found');
    res.json({ message });
  });

  app.delete('/api/braze/messages/:id', (req, res) => {
    if (!getBrazeMessage(db, req.params.id)) {
      return sendApiError(res, 404, 'NOT_FOUND', 'braze message not found');
    }
    deleteBrazeMessage(db, req.params.id);
    res.json({ ok: true });
  });

  // Submit interview answers. Seeds targeting/creative fields and moves
  // interviewing → plan_draft so the agent can author the plan.
  // Guard: only allowed from `interviewing` or `plan_draft` — prevents resetting
  // a confirmed/produced/done message back to plan_draft.
  app.post('/api/braze/messages/:id/interview', (req, res) => {
    const message = getBrazeMessage(db, req.params.id);
    if (!message) return sendApiError(res, 404, 'NOT_FOUND', 'braze message not found');
    if (message.status !== 'interviewing' && message.status !== 'plan_draft') {
      return sendApiError(
        res,
        409,
        'CONFLICT',
        `interview is only allowed when status is 'interviewing' or 'plan_draft' (current: '${message.status}')`,
      );
    }
    const body = (req.body ?? {}) as Partial<BrazeInterviewRequest>;
    if (!body.iamFormat || !body.deliveryModel || !body.triggerEvent) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'iamFormat, deliveryModel and triggerEvent are required');
    }
    const variantCount = Number.isInteger(body.variantCount) && (body.variantCount as number) > 0
      ? (body.variantCount as number)
      : 1;
    // custom_event drills into a catalog event name; otherwise the trigger
    // event itself is the recorded value.
    const triggerEvent = body.triggerEvent === 'custom_event'
      ? (body.customEventName ?? 'custom_event')
      : body.triggerEvent;
    updateBrazeMessage(db, message.id, {
      iamFormat: body.iamFormat,
      deliveryModel: body.deliveryModel,
      triggerEvent,
      segment: body.segment ?? null,
      tone: body.tone ?? null,
      emphasis: body.emphasis ? body.emphasis.join('\n') : null,
      variantCount,
      status: 'plan_draft',
    }, now());
    res.json({ message: getBrazeMessage(db, message.id) });
  });

  // Agent writes/rewrites the plan. Stays in plan_draft pending confirmation.
  app.put('/api/braze/messages/:id/plan', (req, res) => {
    const message = getBrazeMessage(db, req.params.id);
    if (!message) return sendApiError(res, 404, 'NOT_FOUND', 'braze message not found');
    const body = (req.body ?? {}) as Partial<BrazePlanUpsertRequest>;
    if (!body.plan || body.plan.version !== 'braze_plan_v1') {
      return sendApiError(res, 400, 'BAD_REQUEST', 'plan (braze_plan_v1) is required');
    }
    // Preserve accumulated rejection history across rewrites.
    const plan: BrazePlan = {
      ...body.plan,
      rejections: body.plan.rejections ?? message.plan?.rejections ?? [],
    };
    updateBrazeMessage(db, message.id, { plan, status: 'plan_draft' }, now());
    res.json({ message: getBrazeMessage(db, message.id) });
  });

  // Confirm gate. confirm → plan_confirmed + spawn variants; reject →
  // plan_draft + append the reason for the next rewrite.
  app.post('/api/braze/messages/:id/plan/decision', (req, res) => {
    const message = getBrazeMessage(db, req.params.id);
    if (!message) return sendApiError(res, 404, 'NOT_FOUND', 'braze message not found');
    if (!message.plan) return sendApiError(res, 409, 'CONFLICT', 'no plan to decide on');
    const body = (req.body ?? {}) as Partial<BrazePlanDecisionRequest>;

    if (body.decision === 'reject') {
      const plan: BrazePlan = {
        ...message.plan,
        rejections: [
          ...message.plan.rejections,
          { at: new Date(now()).toISOString(), reason: body.reason ?? '' },
        ],
      };
      updateBrazeMessage(db, message.id, { plan, status: 'plan_draft' }, now());
      return res.json({ message: getBrazeMessage(db, message.id) });
    }

    if (body.decision === 'confirm') {
      // Spawn one variant per planned variant, falling back to variantCount.
      const planned = message.plan.variants ?? [];
      const count = planned.length > 0 ? planned.length : message.variantCount;
      const ts = now();
      for (let i = 0; i < count; i += 1) {
        insertBrazeVariant(db, {
          id: randomUUID(),
          messageId: message.id,
          label: planned[i]?.label ?? variantLabel(i),
          position: i,
          now: ts,
        });
      }
      updateBrazeMessage(db, message.id, { status: 'plan_confirmed', variantCount: count }, ts);
      return res.json({ message: getBrazeMessage(db, message.id) });
    }

    return sendApiError(res, 400, 'BAD_REQUEST', "decision must be 'confirm' or 'reject'");
  });

  // SKILL이 저작한 기획 문서(brief.md)를 프로젝트 파일로 저장한다.
  // 경로·저장·표면노출만 소유 — 내용은 검증하지 않음(접근 A).
  const BRIEF_ALLOWED: BrazeMessageStatus[] = ['plan_confirmed', 'producing', 'produced', 'editing', 'done'];
  app.post('/api/braze/messages/:id/brief', async (req, res) => {
    const message = getBrazeMessage(db, req.params.id);
    if (!message) return sendApiError(res, 404, 'NOT_FOUND', 'braze message not found');
    if (!message.plan) return sendApiError(res, 409, 'CONFLICT', 'no plan — brief requires a confirmed plan');
    if (!BRIEF_ALLOWED.includes(message.status)) {
      return sendApiError(res, 409, 'CONFLICT', `brief not allowed in status ${message.status}`);
    }
    const body = (req.body ?? {}) as Partial<BrazeBriefSaveRequest>;
    const markdown = typeof body.markdown === 'string' ? body.markdown : '';
    if (markdown.trim().length === 0) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'markdown is required');
    }
    const project = getProject(db, message.projectId);
    if (!project) return sendApiError(res, 404, 'NOT_FOUND', 'project not found');

    // 결정적 폴더명: <messageId>-<slug>. title이 비면 messageId만.
    const slug = message.title
      .toLowerCase()
      .replace(/[^a-z0-9가-힣]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40);
    const folder = slug ? `${message.id}-${slug}` : message.id;
    const relPath = `braze/${folder}/brief.md`;

    try {
      // artifactManifest 생략 — .md 확장자가 markdown-document 매니페스트를 자동 추론.
      await writeProjectFile(PROJECTS_DIR, message.projectId, relPath, Buffer.from(markdown, 'utf8'), {}, project.metadata);
    } catch (err) {
      // project-routes.ts의 업로드 에러 매핑과 동형.
      const code = (err as { code?: string })?.code;
      if (code === 'EEXIST') return sendApiError(res, 409, 'CONFLICT', 'brief already exists');
      return sendApiError(res, 422, 'UNPROCESSABLE', `failed to write brief: ${(err as Error)?.message ?? 'unknown'}`);
    }

    updateBrazeMessage(db, message.id, { briefPath: relPath }, now());
    return res.json({ message: getBrazeMessage(db, message.id), path: relPath });
  });

  // Record a produced HTML file against a variant. When every variant is
  // produced the message advances to `produced`.
  app.post('/api/braze/messages/:id/variants/:variantId/produce', (req, res) => {
    const message = getBrazeMessage(db, req.params.id);
    if (!message) return sendApiError(res, 404, 'NOT_FOUND', 'braze message not found');
    const body = (req.body ?? {}) as Partial<BrazeVariantProduceRequest>;
    const variant = getBrazeVariant(db, req.params.variantId);
    if (!variant || variant.messageId !== message.id) {
      return sendApiError(res, 404, 'NOT_FOUND', 'braze variant not found');
    }
    if (!body.artifactPath) {
      return sendApiError(res, 400, 'BAD_REQUEST', 'artifactPath is required');
    }
    const ts = now();
    updateBrazeVariant(db, variant.id, { artifactPath: body.artifactPath, status: 'produced' }, ts);
    const refreshed = getBrazeMessage(db, message.id);
    const allProduced = refreshed?.variants.length
      ? refreshed.variants.every((v) => v.status === 'produced' || v.status === 'done')
      : false;
    updateBrazeMessage(db, message.id, { status: allProduced ? 'produced' : 'producing' }, ts);
    res.json({ message: getBrazeMessage(db, message.id) });
  });

  // Edit-loop update for a single variant.
  app.patch('/api/braze/messages/:id/variants/:variantId', (req, res) => {
    const message = getBrazeMessage(db, req.params.id);
    if (!message) return sendApiError(res, 404, 'NOT_FOUND', 'braze message not found');
    const variant = getBrazeVariant(db, req.params.variantId);
    if (!variant || variant.messageId !== message.id) {
      return sendApiError(res, 404, 'NOT_FOUND', 'braze variant not found');
    }
    const body = (req.body ?? {}) as Partial<BrazeVariantUpdateRequest>;
    // exactOptionalPropertyTypes: only forward keys that were actually supplied.
    const patch: { status?: BrazeVariantStatus; artifactPath?: string | null } = {};
    if (body.status !== undefined) patch.status = body.status;
    if (body.artifactPath !== undefined) patch.artifactPath = body.artifactPath;
    updateBrazeVariant(db, variant.id, patch, now());
    res.json({ message: getBrazeMessage(db, message.id) });
  });
}

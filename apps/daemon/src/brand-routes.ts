/**
 * Role: 브랜드 쓰기 HTTP 라우트 (/api/brands POST·PUT·DELETE) — 레지스트리 함수 위의 얇은 표면
 * Key Features: 생성 201, manifest 패치, docs core·:key 저장(단일 핸들러 core 분기),
 *               deliverable add/remove, DELETE 바인딩 프로젝트 409 { projectCount }
 * Dependencies: express, ./brands.js (레지스트리 쓰기 함수 + BrandWriteError), better-sqlite3 db (주입)
 * Notes: brandsDir·db 주입형 — 테스트가 tmp 루트 + 격리 db로 등록할 수 있게 server.ts 전역에
 *        의존하지 않는다 (design-system-tool 라우트와 동형). 검증·경로 게이트는 레지스트리 내부,
 *        여기서는 BrandWriteError 코드 → 400/409 매핑과 null/false → 404 판정만 담당.
 *        asset 업로드 라우트는 별도(multer 의존) — server.ts 소유.
 */
import type { Express, Response } from 'express';

import type { BrandCreateInput, BrandDeliverableInput, BrandUpdateInput } from '@marketing-ax/contracts';

import {
  addBrandDeliverable,
  BrandWriteError,
  createBrand,
  deleteBrand,
  readBrandCore,
  removeBrandDeliverable,
  updateBrandManifest,
  writeBrandCore,
  writeBrandDeliverableDoc,
} from './brands.js';

export interface BrandWriteRoutesDeps {
  brandsDir: string;
  db: any; // better-sqlite3 — projects.brand_id 카운트(삭제 게이트)만 사용
}

// BrandWriteError 코드 → HTTP 상태 (스펙 §3·§4 매핑 정본)
function brandWriteErrorStatus(code: BrandWriteError['code']): number {
  return code === 'duplicate-id' || code === 'duplicate-key' ? 409 : 400;
}

// typed 에러는 400/409로, 나머지는 500으로 — 기존 브랜드 GET 라우트의 { error } shape 유지
function sendBrandWriteFailure(res: Response, err: unknown): void {
  if (err instanceof BrandWriteError) {
    res.status(brandWriteErrorStatus(err.code)).json({ error: err.message, code: err.code });
    return;
  }
  res.status(500).json({ error: String(err) });
}

export function registerBrandWriteRoutes(app: Express, { brandsDir, db }: BrandWriteRoutesDeps): void {
  // 브랜드 생성 — id 미지정 시 title 슬러그 파생(비라틴이면 레지스트리가 'id-required' 400)
  app.post('/api/brands', async (req, res) => {
    const input = (req.body ?? {}) as Partial<BrandCreateInput>;
    if (typeof input.title !== 'string' || !input.title.trim()) {
      return res.status(400).json({ error: 'title is required' });
    }
    try {
      const manifest = await createBrand(brandsDir, input as BrandCreateInput);
      // 201 응답은 BrandDetail 서브셋 — 방금 생성한 브랜드라 projectCount 0, palette는 스캐폴드라 비어 있음
      const body = await readBrandCore(brandsDir, manifest.id);
      res.status(201).json({
        id: manifest.id,
        title: manifest.title,
        deliverables: Object.keys(manifest.deliverables ?? {}),
        body: body ?? '',
        projectCount: 0,
        ...(manifest.presentation ? { presentation: manifest.presentation } : {}),
      });
    } catch (err) {
      sendBrandWriteFailure(res, err);
    }
  });

  // manifest 패치 — title·presentation(통째 교체)만, deliverables 보존은 레지스트리 책임
  app.put('/api/brands/:id', async (req, res) => {
    const input = (req.body ?? {}) as BrandUpdateInput;
    try {
      const manifest = await updateBrandManifest(brandsDir, req.params.id, input);
      if (!manifest) return res.status(404).json({ error: 'brand not found' });
      res.json({ brand: manifest });
    } catch (err) {
      sendBrandWriteFailure(res, err);
    }
  });

  // 문서 본문 저장 — 단일 :key 핸들러 안에서 'core'를 특수 분기.
  // 별도 라우트 2개로 가면 등록 순서에 따라 :key가 core를 가로채므로 여기서 갈라야 한다 (스펙 §3).
  app.put('/api/brands/:id/docs/:key', async (req, res) => {
    const body = (req.body ?? {}) as { body?: unknown };
    if (typeof body.body !== 'string') {
      return res.status(400).json({ error: 'body is required' });
    }
    try {
      const ok = req.params.key === 'core'
        ? await writeBrandCore(brandsDir, req.params.id, body.body)
        : await writeBrandDeliverableDoc(brandsDir, req.params.id, req.params.key, body.body);
      if (!ok) return res.status(404).json({ error: 'brand document not found' });
      res.json({ ok: true });
    } catch (err) {
      sendBrandWriteFailure(res, err);
    }
  });

  // 채널 추가 — 키 형식/중복은 레지스트리 typed 에러(400/409), 미존재 브랜드는 null(404)
  app.post('/api/brands/:id/deliverables', async (req, res) => {
    const input = (req.body ?? {}) as Partial<BrandDeliverableInput>;
    // 키 타입 게이트 — 비문자열이 레지스트리 regex에 닿기 전에 400 (String(undefined)='undefined'가 regex를 통과하는 함정 차단)
    if (typeof input.key !== 'string') {
      return res.status(400).json({ error: 'key is required' });
    }
    try {
      const manifest = await addBrandDeliverable(brandsDir, req.params.id, input as BrandDeliverableInput);
      if (!manifest) return res.status(404).json({ error: 'brand not found' });
      res.status(201).json({ brand: manifest });
    } catch (err) {
      sendBrandWriteFailure(res, err);
    }
  });

  // 채널 제거 — manifest 엔트리 + 문서 파일 동시 삭제
  app.delete('/api/brands/:id/deliverables/:key', async (req, res) => {
    try {
      const manifest = await removeBrandDeliverable(brandsDir, req.params.id, req.params.key);
      if (!manifest) return res.status(404).json({ error: 'brand deliverable not found' });
      res.json({ brand: manifest });
    } catch (err) {
      sendBrandWriteFailure(res, err);
    }
  });

  // 브랜드 삭제 — 바인딩 프로젝트가 있으면 409 { projectCount } (DB는 라우트 소유, 스펙 §4)
  app.delete('/api/brands/:id', async (req, res) => {
    try {
      const countRow = db
        .prepare(`SELECT COUNT(*) AS n FROM projects WHERE brand_id = ?`)
        .get(req.params.id) as { n: number } | undefined;
      const projectCount = countRow?.n ?? 0;
      if (projectCount > 0) {
        return res.status(409).json({ error: 'brand has bound projects', projectCount });
      }
      const ok = await deleteBrand(brandsDir, req.params.id);
      if (!ok) return res.status(404).json({ error: 'brand not found' });
      res.json({ ok: true });
    } catch (err) {
      sendBrandWriteFailure(res, err);
    }
  });
}

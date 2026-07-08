import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { renderDiscoveryAndPhilosophy } from '../../src/prompts/discovery.js';
import { composeSystemPrompt } from '../../src/prompts/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');

const discovery = renderDiscoveryAndPhilosophy('filesystem');

describe('Horangdesign immersive workflow prompt', () => {
  it('asks a staged 3D/Spline interview instead of generic SaaS discovery', () => {
    expect(discovery).toContain('technicalDesignMode');
    expect(discovery).toContain('splineStrategy');
    expect(discovery).toContain('wireframeCheckpoint');
    expect(discovery).toContain('Awwwards / studio / experimental');
    expect(discovery).toContain('3D/Spline');
  });

  it('keeps the interview compact but multi-stage', () => {
    expect(discovery).toContain('1,2차');
    expect(discovery).toContain('와이어프레임');
    expect(discovery).toContain('3,4차');
    expect(discovery).toContain('5차');
    expect(discovery).toContain('4-7 questions');
    expect(discovery).toContain('horang-stage-1');
    expect(discovery).toContain('horang-stage-2');
    expect(discovery).toContain('horang-stage-3');
    expect(discovery).toContain('horang-stage-4');
    expect(discovery).toContain('horang-stage-5');
    expect(discovery).toContain('Do not jump from 1차 answers directly into final production');
  });

  it('prevents metadata labels, automatic card lists, static sites, and assistant copy leakage', () => {
    const body = readFileSync(path.join(repoRoot, 'design-systems/horang-immersive/DESIGN.md'), 'utf8');
    const skill = readFileSync(path.join(repoRoot, 'skills/horang-design-pro/SKILL.md'), 'utf8');
    const compactPrompt = composeSystemPrompt({ tokenDietEnabled: true });
    expect(body).toContain('Do not turn information into cards by default');
    expect(body).toContain('Rounded corners are conditional');
    expect(body).toContain('dynamic/interactive by default');
    expect(body).toContain('Roy/caveman/AI helper');
    expect(body).toContain('준비 → 염색 → 후가공');
    expect(skill).toContain('Use card-like grouping only when the site/PPT/PDF mood or reference clearly supports it');
    expect(skill).toContain('Do not write the assistant\'s chat style into HTML');
    expect(compactPrompt).toContain('Rounded cards are allowed only when the medium/reference/mood makes them correct');
    expect(compactPrompt).toContain('Only produce a static site when the user explicitly says static/정적');
    expect(compactPrompt).toContain('준비 → 염색 → 후가공');
  });

  it('teaches compact prompt mode the Horangdesign immersive quality bar', () => {
    const prompt = composeSystemPrompt({ tokenDietEnabled: true });
    expect(prompt).toContain('Horangdesign compact design mode');
    expect(prompt).toContain('3D/Spline');
    expect(prompt).toContain('Awwwards');
    expect(prompt).toContain('no generic SaaS hero');
  });

  it('ships a Horang immersive design system for mood routing', () => {
    const body = readFileSync(path.join(repoRoot, 'design-systems/horang-immersive/DESIGN.md'), 'utf8');
    const server = readFileSync(path.join(repoRoot, 'apps/daemon/src/server.ts'), 'utf8');
    const skill = readFileSync(path.join(repoRoot, 'skills/horang-design-pro/SKILL.md'), 'utf8');
    const webConfig = readFileSync(path.join(repoRoot, 'apps/web/src/state/config.ts'), 'utf8');
    const homeView = readFileSync(path.join(repoRoot, 'apps/web/src/components/HomeView.tsx'), 'utf8');
    const projectRoutes = readFileSync(path.join(repoRoot, 'apps/daemon/src/routes/project/index.ts'), 'utf8');
    expect(body).toContain('Horang Immersive');
    expect(body).toContain('Spline');
    expect(body).toContain('Awwwards');
    expect(body).toContain('generic SaaS');
    expect(body).toContain('21:9');
    expect(server).toContain("id: 'horang-immersive'");
    expect(skill).toContain('`horang-immersive`');
    expect(webConfig).toContain("skillId: 'horang-design-pro'");
    expect(webConfig).toContain('designSystemId: null');
    expect(webConfig).toContain("if (merged.designSystemId === 'horang-immersive') merged.designSystemId = null");
    expect(homeView).toContain("activeSkill?.id ?? 'horang-design-pro'");
    expect(homeView).toContain('mood/community design systems');
    expect(projectRoutes).toContain("if (!resolveBody && !normalizedSkillId && initialSessionMode === 'design')");
  });

  it('keeps Horang rewrite foundation and technique-library hooks wired', () => {
    const skill = readFileSync(path.join(repoRoot, 'skills/horang-design-pro/SKILL.md'), 'utf8');
    const body = readFileSync(path.join(repoRoot, 'design-systems/horang-immersive/DESIGN.md'), 'utf8');
    const compactPrompt = composeSystemPrompt({ tokenDietEnabled: true });
    expect(discovery).toContain('HORANG REWRITE FOUNDATION');
    expect(discovery).toContain('Technique-library contract');
    expect(compactPrompt).toContain('Technique-library hook');
    expect(skill).toContain('Horang Rewrite Foundation v2');
    expect(body).toContain('Horang Rewrite Canvas v2');
  });

});

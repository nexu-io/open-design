// vela subcommand handlers (login + models) used by the mock CLI when
// argv[1] is not the default 'agent' (which falls through to the
// ACP server in format-vela.mjs).
//
// Mirrors the contract that
// apps/daemon/tests/fixtures/fake-vela.mjs implements — kept in sync
// because both feed the same daemon-side login route + status reader
// (apps/daemon/src/integrations/vela-profile.ts +
// apps/web/src/components/amrLoginPolling.ts).

import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

const DEFAULT_MODELS_STDOUT = [
  'public_model_deepseek_v3_2          vela',
  'public_model_deepseek_v4_flash      vela',
  'public_model_deepseek_v4_pro        vela',
  'public_model_gemini_2_5_flash       vela',
  'public_model_gemini_3_1_flash_lite_preview  vela',
  'public_model_gemini_3_1_pro_preview vela',
  'public_model_gpt_5_4                vela',
  'public_model_gpt_5_4_mini           vela',
  'public_model_glm_5                  vela',
  'public_model_glm_5_1                vela',
  'public_model_gpt_image_2            vela',
  'public_model_kimi_k2_6              vela',
  'public_model_minimax_m2_7           vela',
  'public_model_qwen3_235b_a22b        vela',
  'public_model_seedance_2             vela',
].join('\n');

/**
 * `vela login` — writes the AMR config file the daemon's status reader
 * + AmrLoginPill component expect on disk. The real vela goes through a
 * device-authorization browser approval; we skip the loop and just
 * project the same on-disk artifact a successful real login produces.
 *
 * Envs (compat with fake-vela.mjs):
 *   VELA_PROFILE                — profile slot to populate (prod|test|local)
 *   FAKE_VELA_LOGIN_DELAY_MS    — sleep before the write (test in-flight states)
 *   FAKE_VELA_LOGIN_USER_EMAIL  — email written into the profile
 *   FAKE_VELA_LOGIN_USER_PLAN   — plan written into the profile
 *   FAKE_VELA_LOGIN_FAIL        — when set, prints to stderr + exits 1
 */
export async function runVelaLogin() {
  if (process.env.FAKE_VELA_LOGIN_FAIL) {
    process.stderr.write(`${process.env.FAKE_VELA_LOGIN_FAIL}\n`);
    process.exit(1);
  }
  const allowed = new Set(['prod', 'test', 'local']);
  const requested = (process.env.VELA_PROFILE || 'prod').trim() || 'prod';
  const profile = allowed.has(requested) ? requested : 'prod';
  if (!allowed.has(requested)) {
    process.stderr.write(`[mock-vela] unknown profile ${requested}; defaulting to prod\n`);
  }
  const delayMs = Number(process.env.FAKE_VELA_LOGIN_DELAY_MS) || 0;
  const userEmail = process.env.FAKE_VELA_LOGIN_USER_EMAIL || 'fake-user@example.com';
  const userPlan  = process.env.FAKE_VELA_LOGIN_USER_PLAN  || 'free';

  const write = () => {
    const file = join(homedir(), '.amr', 'config.json');
    mkdirSync(dirname(file), { recursive: true });
    const payload = {
      profiles: {
        [profile]: {
          // Fake credentials — never used by real vela traffic since the
          // daemon's link client points at the same FAKE_VELA_API_URL.
          controlKey: 'fake-control-key-0000000000000000000000',
          runtimeKey: 'fake-runtime-key-0000000000000000000000',
          apiUrl:  profile === 'local' ? 'http://localhost:18080' : '',
          linkUrl: profile === 'local' ? 'http://localhost:18081' : '',
          user: {
            id: 'fake-user-id',
            email: userEmail,
            name: 'Fake User',
            plan: userPlan,
          },
        },
      },
    };
    writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    process.stdout.write(`Login successful for ${userEmail}.\n`);
    process.exit(0);
  };

  if (delayMs > 0) setTimeout(write, delayMs);
  else write();
}

/**
 * `vela models` — prints the production-shaped public model catalog.
 * Override via FAKE_VELA_MODELS env (newline-separated lines).
 */
export function runVelaModels() {
  const out = process.env.FAKE_VELA_MODELS || DEFAULT_MODELS_STDOUT;
  process.stdout.write(`${out}\n`);
  process.exit(0);
}

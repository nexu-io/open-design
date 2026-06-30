/*
 * Per-tutorial localized long-form content (index).
 *
 * Non-English tutorial detail pages render `bodyHtml` from this store; the page
 * prefers a match here and falls back to the generic placeholder when a locale
 * is missing, so short catalogue entries are untouched. English renders from the
 * Markdown source via `<Content />` and is not stored here.
 *
 * Each article's localized content lives in its own shard file under
 * `./tutorials-longform/<slug>.ts` (keeps every changed file well under the 1 MiB CI blob
 * guard). This index merges the shards. Locale keys match `LANDING_LOCALES`
 * (see `app/i18n.ts`); retired locales are never stored.
 */

export interface LocalizedTutorialContent {
  title: string;
  summary: string;
  bodyHtml: string;
}

export type TutorialLongformI18n = Record<
  string,
  Partial<Record<string, LocalizedTutorialContent>>
>;

import { entry as e_open_design_31_skills_72_systems_popular_ai } from './tutorials-longform/open-design-31-skills-72-systems-popular-ai';
import { entry as e_open_design_feature_tour_silicon_hotpot } from './tutorials-longform/open-design-feature-tour-silicon-hotpot';
import { entry as e_open_design_full_overview_vs_figma_purpleschool_anton_larichev } from './tutorials-longform/open-design-full-overview-vs-figma-purpleschool-anton-larichev';
import { entry as e_open_design_in_20_minutes_coding_menace } from './tutorials-longform/open-design-in-20-minutes-coding-menace';
import { entry as e_open_design_install_demo_systems_chase_ai } from './tutorials-longform/open-design-install-demo-systems-chase-ai';
import { entry as e_open_design_local_setup_ollama_alternative_ai_automation_station } from './tutorials-longform/open-design-local-setup-ollama-alternative-ai-automation-station';
import { entry as e_open_design_overview_worldofai } from './tutorials-longform/open-design-overview-worldofai';
import { entry as e_open_design_replacing_claude_design_jack_roberts } from './tutorials-longform/open-design-replacing-claude-design-jack-roberts';
import { entry as e_open_design_setup_gemini_cli_free_credits_sandeep_singh } from './tutorials-longform/open-design-setup-gemini-cli-free-credits-sandeep-singh';
import { entry as e_open_design_vibe_coders_dream_sean_kochel } from './tutorials-longform/open-design-vibe-coders-dream-sean-kochel';
import { entry as e_open_design_windows_wsl_installation_setup_ai_automation } from './tutorials-longform/open-design-windows-wsl-installation-setup-ai-automation';

export const tutorialsLongformI18n: TutorialLongformI18n = {
  "open-design-31-skills-72-systems-popular-ai": e_open_design_31_skills_72_systems_popular_ai,
  "open-design-feature-tour-silicon-hotpot": e_open_design_feature_tour_silicon_hotpot,
  "open-design-full-overview-vs-figma-purpleschool-anton-larichev": e_open_design_full_overview_vs_figma_purpleschool_anton_larichev,
  "open-design-in-20-minutes-coding-menace": e_open_design_in_20_minutes_coding_menace,
  "open-design-install-demo-systems-chase-ai": e_open_design_install_demo_systems_chase_ai,
  "open-design-local-setup-ollama-alternative-ai-automation-station": e_open_design_local_setup_ollama_alternative_ai_automation_station,
  "open-design-overview-worldofai": e_open_design_overview_worldofai,
  "open-design-replacing-claude-design-jack-roberts": e_open_design_replacing_claude_design_jack_roberts,
  "open-design-setup-gemini-cli-free-credits-sandeep-singh": e_open_design_setup_gemini_cli_free_credits_sandeep_singh,
  "open-design-vibe-coders-dream-sean-kochel": e_open_design_vibe_coders_dream_sean_kochel,
  "open-design-windows-wsl-installation-setup-ai-automation": e_open_design_windows_wsl_installation_setup_ai_automation,
};

export function getLocalizedTutorial(
  slug: string,
  locale: string,
): LocalizedTutorialContent | undefined {
  return tutorialsLongformI18n[slug]?.[locale];
}

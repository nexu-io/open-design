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
import { entry as e_open_design_claude_design_alternative_local_ai_fire_academy } from './tutorials-longform/open-design-claude-design-alternative-local-ai-fire-academy';
import { entry as e_open_design_claude_design_alternative_open_source_brendan_o_connell } from './tutorials-longform/open-design-claude-design-alternative-open-source-brendan-o-connell';
import { entry as e_open_design_design_engine_codedigipt } from './tutorials-longform/open-design-design-engine-codedigipt';
import { entry as e_open_design_feature_tour_silicon_hotpot } from './tutorials-longform/open-design-feature-tour-silicon-hotpot';
import { entry as e_open_design_free_claude_alternative_local_compile_future } from './tutorials-longform/open-design-free-claude-alternative-local-compile-future';
import { entry as e_open_design_free_claude_alternative_local_dylan_michael_ai_automation } from './tutorials-longform/open-design-free-claude-alternative-local-dylan-michael-ai-automation';
import { entry as e_open_design_full_overview_vs_figma_purpleschool_anton_larichev } from './tutorials-longform/open-design-full-overview-vs-figma-purpleschool-anton-larichev';
import { entry as e_open_design_full_walkthrough_self_hosted_alternative_ai_stack_engineer } from './tutorials-longform/open-design-full-walkthrough-self-hosted-alternative-ai-stack-engineer';
import { entry as e_open_design_in_20_minutes_coding_menace } from './tutorials-longform/open-design-in-20-minutes-coding-menace';
import { entry as e_open_design_install_demo_systems_chase_ai } from './tutorials-longform/open-design-install-demo-systems-chase-ai';
import { entry as e_open_design_local_setup_ollama_alternative_ai_automation_station } from './tutorials-longform/open-design-local-setup-ollama-alternative-ai-automation-station';
import { entry as e_open_design_open_design_vs_claude_design_demo_justyn_the_ai_guy } from './tutorials-longform/open-design-open-design-vs-claude-design-demo-justyn-the-ai-guy';
import { entry as e_open_design_open_design_vs_claude_design_first_look_community } from './tutorials-longform/open-design-open-design-vs-claude-design-first-look-community';
import { entry as e_open_design_open_design_vs_claude_design_free_alternative_ai_fusion } from './tutorials-longform/open-design-open-design-vs-claude-design-free-alternative-ai-fusion';
import { entry as e_open_design_open_design_vs_claude_design_landing_page_roy_shavit } from './tutorials-longform/open-design-open-design-vs-claude-design-landing-page-roy-shavit';
import { entry as e_open_design_open_design_vs_claude_design_setup_eli_rigobeli_ai } from './tutorials-longform/open-design-open-design-vs-claude-design-setup-eli-rigobeli-ai';
import { entry as e_open_design_open_source_alternative_claude_design_nyndra_ai } from './tutorials-longform/open-design-open-source-alternative-claude-design-nyndra-ai';
import { entry as e_open_design_open_source_alternative_claude_design_tony_xhepa } from './tutorials-longform/open-design-open-source-alternative-claude-design-tony-xhepa';
import { entry as e_open_design_open_source_alternative_comparison_where_do_i_click } from './tutorials-longform/open-design-open-source-alternative-comparison-where-do-i-click';
import { entry as e_open_design_open_source_alternative_vs_claude_design_ai_teaches_better } from './tutorials-longform/open-design-open-source-alternative-vs-claude-design-ai-teaches-better';
import { entry as e_open_design_open_source_claude_alternative_aicodeking } from './tutorials-longform/open-design-open-source-claude-alternative-aicodeking';
import { entry as e_open_design_open_source_tools_roundup_chase_ai } from './tutorials-longform/open-design-open-source-tools-roundup-chase-ai';
import { entry as e_open_design_overview_worldofai } from './tutorials-longform/open-design-overview-worldofai';
import { entry as e_open_design_replacing_claude_design_jack_roberts } from './tutorials-longform/open-design-replacing-claude-design-jack-roberts';
import { entry as e_open_design_revolutionary_approach_01coder } from './tutorials-longform/open-design-revolutionary-approach-01coder';
import { entry as e_open_design_setup_gemini_cli_free_credits_sandeep_singh } from './tutorials-longform/open-design-setup-gemini-cli-free-credits-sandeep-singh';
import { entry as e_open_design_vibe_coders_dream_sean_kochel } from './tutorials-longform/open-design-vibe-coders-dream-sean-kochel';
import { entry as e_open_design_vs_claude_design_better_stack } from './tutorials-longform/open-design-vs-claude-design-better-stack';
import { entry as e_open_design_vs_claude_design_comparison_panda_making_money } from './tutorials-longform/open-design-vs-claude-design-comparison-panda-making-money';
import { entry as e_open_design_windows_wsl_installation_setup_ai_automation } from './tutorials-longform/open-design-windows-wsl-installation-setup-ai-automation';
import { entry as e_open_design_open_design_vs_claude_design_jeremy_de_campos } from './tutorials-longform/open-design-open-design-vs-claude-design-jeremy-de-campos';
import { entry as e_open_design_claude_design_rebuild_beginner_assets_parth_jadav } from './tutorials-longform/open-design-claude-design-rebuild-beginner-assets-parth-jadav';
import { entry as e_open_design_claude_alternative_wordpress_design_dan_davies } from './tutorials-longform/open-design-claude-alternative-wordpress-design-dan-davies';
import { entry as e_open_design_free_open_source_alternative_code_a_program } from './tutorials-longform/open-design-free-open-source-alternative-code-a-program';
import { entry as e_open_design_cloud_deployment_sealos_sealos } from './tutorials-longform/open-design-cloud-deployment-sealos-sealos';
import { entry as e_open_design_instalacao_alternativa_gratis_fabricando_sua_ideia_tutoriais } from './tutorials-longform/open-design-instalacao-alternativa-gratis-fabricando-sua-ideia-tutoriais';
import { entry as e_open_design_open_source_ai_design_overview_ai } from './tutorials-longform/open-design-open-source-ai-design-overview-ai';
import { entry as e_open_design_install_setup_free_alternative_ai_unlocked } from './tutorials-longform/open-design-install-setup-free-alternative-ai-unlocked';
import { entry as e_open_design_alternativa_gratis_claude_design_maestros_da_ia } from './tutorials-longform/open-design-alternativa-gratis-claude-design-maestros-da-ia';

export const tutorialsLongformI18n: TutorialLongformI18n = {
  "open-design-31-skills-72-systems-popular-ai": e_open_design_31_skills_72_systems_popular_ai,
  "open-design-claude-design-alternative-local-ai-fire-academy": e_open_design_claude_design_alternative_local_ai_fire_academy,
  "open-design-claude-design-alternative-open-source-brendan-o-connell": e_open_design_claude_design_alternative_open_source_brendan_o_connell,
  "open-design-design-engine-codedigipt": e_open_design_design_engine_codedigipt,
  "open-design-feature-tour-silicon-hotpot": e_open_design_feature_tour_silicon_hotpot,
  "open-design-free-claude-alternative-local-compile-future": e_open_design_free_claude_alternative_local_compile_future,
  "open-design-free-claude-alternative-local-dylan-michael-ai-automation": e_open_design_free_claude_alternative_local_dylan_michael_ai_automation,
  "open-design-full-overview-vs-figma-purpleschool-anton-larichev": e_open_design_full_overview_vs_figma_purpleschool_anton_larichev,
  "open-design-full-walkthrough-self-hosted-alternative-ai-stack-engineer": e_open_design_full_walkthrough_self_hosted_alternative_ai_stack_engineer,
  "open-design-in-20-minutes-coding-menace": e_open_design_in_20_minutes_coding_menace,
  "open-design-install-demo-systems-chase-ai": e_open_design_install_demo_systems_chase_ai,
  "open-design-local-setup-ollama-alternative-ai-automation-station": e_open_design_local_setup_ollama_alternative_ai_automation_station,
  "open-design-open-design-vs-claude-design-demo-justyn-the-ai-guy": e_open_design_open_design_vs_claude_design_demo_justyn_the_ai_guy,
  "open-design-open-design-vs-claude-design-first-look-community": e_open_design_open_design_vs_claude_design_first_look_community,
  "open-design-open-design-vs-claude-design-free-alternative-ai-fusion": e_open_design_open_design_vs_claude_design_free_alternative_ai_fusion,
  "open-design-open-design-vs-claude-design-landing-page-roy-shavit": e_open_design_open_design_vs_claude_design_landing_page_roy_shavit,
  "open-design-open-design-vs-claude-design-setup-eli-rigobeli-ai": e_open_design_open_design_vs_claude_design_setup_eli_rigobeli_ai,
  "open-design-open-source-alternative-claude-design-nyndra-ai": e_open_design_open_source_alternative_claude_design_nyndra_ai,
  "open-design-open-source-alternative-claude-design-tony-xhepa": e_open_design_open_source_alternative_claude_design_tony_xhepa,
  "open-design-open-source-alternative-comparison-where-do-i-click": e_open_design_open_source_alternative_comparison_where_do_i_click,
  "open-design-open-source-alternative-vs-claude-design-ai-teaches-better": e_open_design_open_source_alternative_vs_claude_design_ai_teaches_better,
  "open-design-open-source-claude-alternative-aicodeking": e_open_design_open_source_claude_alternative_aicodeking,
  "open-design-open-source-tools-roundup-chase-ai": e_open_design_open_source_tools_roundup_chase_ai,
  "open-design-overview-worldofai": e_open_design_overview_worldofai,
  "open-design-replacing-claude-design-jack-roberts": e_open_design_replacing_claude_design_jack_roberts,
  "open-design-revolutionary-approach-01coder": e_open_design_revolutionary_approach_01coder,
  "open-design-setup-gemini-cli-free-credits-sandeep-singh": e_open_design_setup_gemini_cli_free_credits_sandeep_singh,
  "open-design-vibe-coders-dream-sean-kochel": e_open_design_vibe_coders_dream_sean_kochel,
  "open-design-vs-claude-design-better-stack": e_open_design_vs_claude_design_better_stack,
  "open-design-vs-claude-design-comparison-panda-making-money": e_open_design_vs_claude_design_comparison_panda_making_money,
  "open-design-windows-wsl-installation-setup-ai-automation": e_open_design_windows_wsl_installation_setup_ai_automation,
  "open-design-open-design-vs-claude-design-jeremy-de-campos": e_open_design_open_design_vs_claude_design_jeremy_de_campos,
  "open-design-claude-design-rebuild-beginner-assets-parth-jadav": e_open_design_claude_design_rebuild_beginner_assets_parth_jadav,
  "open-design-claude-alternative-wordpress-design-dan-davies": e_open_design_claude_alternative_wordpress_design_dan_davies,
  "open-design-free-open-source-alternative-code-a-program": e_open_design_free_open_source_alternative_code_a_program,
  "open-design-cloud-deployment-sealos-sealos": e_open_design_cloud_deployment_sealos_sealos,
  "open-design-instalacao-alternativa-gratis-fabricando-sua-ideia-tutoriais": e_open_design_instalacao_alternativa_gratis_fabricando_sua_ideia_tutoriais,
  "open-design-open-source-ai-design-overview-ai": e_open_design_open_source_ai_design_overview_ai,
  "open-design-install-setup-free-alternative-ai-unlocked": e_open_design_install_setup_free_alternative_ai_unlocked,
  "open-design-alternativa-gratis-claude-design-maestros-da-ia": e_open_design_alternativa_gratis_claude_design_maestros_da_ia,
};

export function getLocalizedTutorial(
  slug: string,
  locale: string,
): LocalizedTutorialContent | undefined {
  return tutorialsLongformI18n[slug]?.[locale];
}

/**
 * Catálogo curado de heróis do Dota 2 (subconjunto popular).
 * IDs e nomes seguem o padrão oficial / OpenDota, então as imagens da CDN
 * da Valve resolvem direto pelo `slug`.
 *
 * A imagem fica em:
 *   https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/<slug>.png
 */

export type PrimaryAttr = "STRENGTH" | "AGILITY" | "INTELLIGENCE" | "UNIVERSAL";

export interface HeroSeed {
  id: number;
  npc: string; // npc_dota_hero_*
  localizedName: string;
  slug: string;
  primaryAttr: PrimaryAttr;
  roles: string[];
  complexity: 1 | 2 | 3;
}

export const HEROES: HeroSeed[] = [
  { id: 1, npc: "npc_dota_hero_antimage", localizedName: "Anti-Mage", slug: "antimage", primaryAttr: "AGILITY", roles: ["Carry", "Escape", "Nuker"], complexity: 1 },
  { id: 8, npc: "npc_dota_hero_juggernaut", localizedName: "Juggernaut", slug: "juggernaut", primaryAttr: "AGILITY", roles: ["Carry", "Pusher", "Escape"], complexity: 1 },
  { id: 11, npc: "npc_dota_hero_nevermore", localizedName: "Shadow Fiend", slug: "nevermore", primaryAttr: "AGILITY", roles: ["Carry", "Nuker"], complexity: 2 },
  { id: 44, npc: "npc_dota_hero_phantom_assassin", localizedName: "Phantom Assassin", slug: "phantom_assassin", primaryAttr: "AGILITY", roles: ["Carry", "Escape"], complexity: 1 },
  { id: 6, npc: "npc_dota_hero_drow_ranger", localizedName: "Drow Ranger", slug: "drow_ranger", primaryAttr: "AGILITY", roles: ["Carry", "Disabler", "Pusher"], complexity: 1 },
  { id: 35, npc: "npc_dota_hero_sniper", localizedName: "Sniper", slug: "sniper", primaryAttr: "AGILITY", roles: ["Carry", "Nuker"], complexity: 1 },
  { id: 67, npc: "npc_dota_hero_spectre", localizedName: "Spectre", slug: "spectre", primaryAttr: "AGILITY", roles: ["Carry", "Durable", "Escape"], complexity: 1 },
  { id: 41, npc: "npc_dota_hero_faceless_void", localizedName: "Faceless Void", slug: "faceless_void", primaryAttr: "AGILITY", roles: ["Carry", "Initiator", "Disabler"], complexity: 2 },
  { id: 48, npc: "npc_dota_hero_luna", localizedName: "Luna", slug: "luna", primaryAttr: "AGILITY", roles: ["Carry", "Pusher", "Nuker"], complexity: 1 },
  { id: 93, npc: "npc_dota_hero_slark", localizedName: "Slark", slug: "slark", primaryAttr: "AGILITY", roles: ["Carry", "Escape", "Disabler"], complexity: 2 },

  { id: 17, npc: "npc_dota_hero_storm_spirit", localizedName: "Storm Spirit", slug: "storm_spirit", primaryAttr: "INTELLIGENCE", roles: ["Carry", "Escape", "Nuker"], complexity: 3 },
  { id: 13, npc: "npc_dota_hero_puck", localizedName: "Puck", slug: "puck", primaryAttr: "INTELLIGENCE", roles: ["Initiator", "Escape", "Nuker"], complexity: 3 },
  { id: 74, npc: "npc_dota_hero_invoker", localizedName: "Invoker", slug: "invoker", primaryAttr: "UNIVERSAL", roles: ["Carry", "Nuker", "Disabler"], complexity: 3 },
  { id: 22, npc: "npc_dota_hero_zuus", localizedName: "Zeus", slug: "zuus", primaryAttr: "INTELLIGENCE", roles: ["Carry", "Nuker"], complexity: 1 },
  { id: 25, npc: "npc_dota_hero_lina", localizedName: "Lina", slug: "lina", primaryAttr: "UNIVERSAL", roles: ["Carry", "Support", "Nuker"], complexity: 2 },
  { id: 5, npc: "npc_dota_hero_crystal_maiden", localizedName: "Crystal Maiden", slug: "crystal_maiden", primaryAttr: "INTELLIGENCE", roles: ["Support", "Disabler", "Nuker"], complexity: 1 },
  { id: 26, npc: "npc_dota_hero_lion", localizedName: "Lion", slug: "lion", primaryAttr: "INTELLIGENCE", roles: ["Support", "Disabler", "Nuker"], complexity: 1 },
  { id: 31, npc: "npc_dota_hero_lich", localizedName: "Lich", slug: "lich", primaryAttr: "INTELLIGENCE", roles: ["Support", "Nuker"], complexity: 1 },
  { id: 64, npc: "npc_dota_hero_jakiro", localizedName: "Jakiro", slug: "jakiro", primaryAttr: "INTELLIGENCE", roles: ["Support", "Nuker", "Pusher"], complexity: 1 },
  { id: 86, npc: "npc_dota_hero_rubick", localizedName: "Rubick", slug: "rubick", primaryAttr: "INTELLIGENCE", roles: ["Support", "Disabler", "Nuker"], complexity: 3 },

  { id: 14, npc: "npc_dota_hero_pudge", localizedName: "Pudge", slug: "pudge", primaryAttr: "STRENGTH", roles: ["Disabler", "Initiator", "Durable"], complexity: 2 },
  { id: 2, npc: "npc_dota_hero_axe", localizedName: "Axe", slug: "axe", primaryAttr: "STRENGTH", roles: ["Initiator", "Durable", "Disabler"], complexity: 1 },
  { id: 18, npc: "npc_dota_hero_sven", localizedName: "Sven", slug: "sven", primaryAttr: "STRENGTH", roles: ["Carry", "Disabler", "Initiator"], complexity: 1 },
  { id: 42, npc: "npc_dota_hero_skeleton_king", localizedName: "Wraith King", slug: "skeleton_king", primaryAttr: "STRENGTH", roles: ["Carry", "Durable", "Disabler"], complexity: 1 },
  { id: 7, npc: "npc_dota_hero_earthshaker", localizedName: "Earthshaker", slug: "earthshaker", primaryAttr: "STRENGTH", roles: ["Initiator", "Disabler", "Nuker"], complexity: 2 },
  { id: 29, npc: "npc_dota_hero_tidehunter", localizedName: "Tidehunter", slug: "tidehunter", primaryAttr: "STRENGTH", roles: ["Initiator", "Durable", "Disabler"], complexity: 1 },
  { id: 16, npc: "npc_dota_hero_sand_king", localizedName: "Sand King", slug: "sand_king", primaryAttr: "UNIVERSAL", roles: ["Initiator", "Disabler", "Nuker"], complexity: 2 },
  { id: 99, npc: "npc_dota_hero_bristleback", localizedName: "Bristleback", slug: "bristleback", primaryAttr: "STRENGTH", roles: ["Carry", "Durable", "Initiator"], complexity: 1 },
  { id: 104, npc: "npc_dota_hero_legion_commander", localizedName: "Legion Commander", slug: "legion_commander", primaryAttr: "STRENGTH", roles: ["Carry", "Initiator", "Durable"], complexity: 2 },
  { id: 129, npc: "npc_dota_hero_mars", localizedName: "Mars", slug: "mars", primaryAttr: "STRENGTH", roles: ["Initiator", "Durable", "Disabler"], complexity: 2 },

  { id: 9, npc: "npc_dota_hero_mirana", localizedName: "Mirana", slug: "mirana", primaryAttr: "UNIVERSAL", roles: ["Carry", "Support", "Escape"], complexity: 2 },
  { id: 21, npc: "npc_dota_hero_windrunner", localizedName: "Windranger", slug: "windrunner", primaryAttr: "UNIVERSAL", roles: ["Carry", "Support", "Disabler"], complexity: 2 },
  { id: 114, npc: "npc_dota_hero_monkey_king", localizedName: "Monkey King", slug: "monkey_king", primaryAttr: "UNIVERSAL", roles: ["Carry", "Escape", "Disabler"], complexity: 2 },
  { id: 136, npc: "npc_dota_hero_marci", localizedName: "Marci", slug: "marci", primaryAttr: "UNIVERSAL", roles: ["Support", "Initiator", "Carry"], complexity: 2 },
];

export const heroImageUrl = (slug: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/${slug}.png`;

export const heroIconUrl = (slug: string) =>
  `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/icons/${slug}.png`;

import type { DesignSystemSummary } from '../types';
import { BRAND_REFERENCES } from '../runtime/brand-references';
import { hostnameOf } from '../runtime/design-kit';

export function isUserSystem(system: DesignSystemSummary): boolean {
  return system.source === 'user' || system.isEditable === true;
}

function brandKey(value: string): string {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '');
}

const OFFICIAL_PRESET_DOMAINS: Record<string, string> = {
  airbnb: 'airbnb.com',
  airtable: 'airtable.com',
  ant: 'ant.design',
  apple: 'apple.com',
  arc: 'arc.net',
  binance: 'binance.com',
  bmw: 'bmw.com',
  'bmw-m': 'bmw-m.com',
  bugatti: 'bugatti.com',
  cal: 'cal.com',
  canva: 'canva.com',
  cisco: 'cisco.com',
  claude: 'claude.ai',
  clay: 'clay.com',
  clickhouse: 'clickhouse.com',
  cohere: 'cohere.com',
  coinbase: 'coinbase.com',
  composio: 'composio.dev',
  cursor: 'cursor.com',
  discord: 'discord.com',
  duolingo: 'duolingo.com',
  elevenlabs: 'elevenlabs.io',
  expo: 'expo.dev',
  ferrari: 'ferrari.com',
  figma: 'figma.com',
  framer: 'framer.com',
  github: 'github.com',
  hashicorp: 'hashicorp.com',
  huggingface: 'huggingface.co',
  ibm: 'ibm.com',
  intercom: 'intercom.com',
  kraken: 'kraken.com',
  lamborghini: 'lamborghini.com',
  'linear-app': 'linear.app',
  lingo: 'lingo.dev',
  loom: 'loom.com',
  lovable: 'lovable.dev',
  mastercard: 'mastercard.com',
  material: 'material.io',
  meta: 'meta.com',
  minimax: 'minimax.io',
  miro: 'miro.com',
  mistral: 'mistral.ai',
  'mistral-ai': 'mistral.ai',
  mongodb: 'mongodb.com',
  nike: 'nike.com',
  notion: 'notion.so',
  nvidia: 'nvidia.com',
  ollama: 'ollama.com',
  openai: 'openai.com',
  'opencode-ai': 'opencode.ai',
  perplexity: 'perplexity.ai',
  pinterest: 'pinterest.com',
  playstation: 'playstation.com',
  posthog: 'posthog.com',
  raycast: 'raycast.com',
  renault: 'renault.com',
  replicate: 'replicate.com',
  resend: 'resend.com',
  revolut: 'revolut.com',
  runwayml: 'runwayml.com',
  sanity: 'sanity.io',
  sentry: 'sentry.io',
  shadcn: 'ui.shadcn.com',
  shopify: 'shopify.com',
  slack: 'slack.com',
  spacex: 'spacex.com',
  spotify: 'spotify.com',
  starbucks: 'starbucks.com',
  stripe: 'stripe.com',
  supabase: 'supabase.com',
  superhuman: 'superhuman.com',
  tesla: 'tesla.com',
  theverge: 'theverge.com',
  'together-ai': 'together.ai',
  uber: 'uber.com',
  vercel: 'vercel.com',
  vodafone: 'vodafone.com',
  voltagent: 'voltagent.dev',
  warp: 'warp.dev',
  webex: 'webex.com',
  webflow: 'webflow.com',
  wechat: 'wechat.com',
  wired: 'wired.com',
  wise: 'wise.com',
  'x-ai': 'x.ai',
  xiaohongshu: 'xiaohongshu.com',
  zapier: 'zapier.com',
};

const REFERENCE_BRAND_DOMAINS = new Map(
  BRAND_REFERENCES.map((brand) => [brandKey(brand.name), brand.domain] as const),
);

export function designSystemLogoHost(system: DesignSystemSummary): string {
  const sourceUrl = system.provenance?.sourceUrls?.[0];
  if (sourceUrl) return hostnameOf(sourceUrl);
  const fromReference = REFERENCE_BRAND_DOMAINS.get(brandKey(system.title));
  if (fromReference) return fromReference;
  return OFFICIAL_PRESET_DOMAINS[system.id] ?? '';
}

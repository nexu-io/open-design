import { z } from 'zod';
import {
  OPEN_DESIGN_PLUGIN_SPEC_VERSION,
  OpenDesignSpecVersionSchema,
} from './manifest.js';

const MarketplaceEntryDistSchema = z.object({
  type:           z.string().optional(),
  archive:        z.string().optional(),
  integrity:      z.string().optional(),
  manifestDigest: z.string().optional(),
}).passthrough();

const MarketplacePluginVersionSchema = z.object({
  version:        z.string().min(1),
  source:         z.string().min(1).optional(),
  ref:            z.string().optional(),
  dist:           MarketplaceEntryDistSchema.optional(),
  integrity:      z.string().optional(),
  manifestDigest: z.string().optional(),
  deprecated:     z.union([z.boolean(), z.string()]).optional(),
  yanked:         z.boolean().optional(),
  yankedAt:       z.string().optional(),
  yankReason:     z.string().optional(),
}).passthrough();

export type MarketplacePluginVersion = z.infer<typeof MarketplacePluginVersionSchema>;

// `open-design-marketplace.json` schema (v1). Mirrors
// `docs/schemas/open-design.marketplace.v1.json`. The federated catalog
// format is intentionally permissive — community catalogs can carry extra
// fields (e.g. clawhub category tags) without breaking OD installs.
export const MarketplacePluginEntrySchema = z.object({
  name:        z.string().min(1),
  source:      z.string().min(1),
  version:     z.string().min(1),
  ref:         z.string().optional(),
  dist:        MarketplaceEntryDistSchema.optional(),
  versions:    z.array(MarketplacePluginVersionSchema).optional(),
  distTags:    z.record(z.string()).optional(),
  integrity:   z.string().optional(),
  manifestDigest: z.string().optional(),
  publisher: z.object({
    id:     z.string().optional(),
    github: z.string().optional(),
    url:    z.string().optional(),
  }).passthrough().optional(),
  homepage:    z.string().optional(),
  license:     z.string().optional(),
  capabilitiesSummary: z.array(z.string()).optional(),
  deprecated:  z.union([z.boolean(), z.string()]).optional(),
  yanked:      z.boolean().optional(),
  yankedAt:    z.string().optional(),
  yankReason:  z.string().optional(),
  tags:        z.array(z.string()).optional(),
  title:       z.string().optional(),
  description: z.string().optional(),
  icon:        z.string().optional(),
}).passthrough();

export type MarketplacePluginEntry = z.infer<typeof MarketplacePluginEntrySchema>;

export const MarketplaceManifestSchema = z.object({
  $schema:     z.string().optional(),
  specVersion: OpenDesignSpecVersionSchema.default(OPEN_DESIGN_PLUGIN_SPEC_VERSION),
  name:        z.string().min(1),
  version:     z.string().min(1),
  owner: z.object({
    name: z.string().optional(),
    url:  z.string().optional(),
  }).passthrough().optional(),
  metadata: z.object({
    description: z.string().optional(),
    version:     z.string().optional(),
  }).passthrough().optional(),
  plugins: z.array(MarketplacePluginEntrySchema),
}).passthrough();

export type MarketplaceManifest = z.infer<typeof MarketplaceManifestSchema>;

// Trust levels for both individual plugins and entire marketplace indexes.
// Spec §6: bundled / official-marketplace start trusted; everything else
// starts restricted unless an operator explicitly elevates it.
export const TrustTierSchema = z.enum(['bundled', 'trusted', 'restricted']);
export type TrustTier = z.infer<typeof TrustTierSchema>;

export const MarketplaceTrustSchema = z.enum(['official', 'trusted', 'restricted']);
export type MarketplaceTrust = z.infer<typeof MarketplaceTrustSchema>;

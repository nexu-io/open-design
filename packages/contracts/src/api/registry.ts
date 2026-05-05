export interface AgentModelOption {
  id: string;
  label: string;
}

export interface AgentInfo {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  path?: string;
  version?: string | null;
  models?: AgentModelOption[];
  reasoningOptions?: AgentModelOption[];
}

export interface AgentsResponse {
  agents: AgentInfo[];
}

export interface SkillSummary {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  mode:
    | 'prototype'
    | 'deck'
    | 'template'
    | 'design-system'
    | 'image'
    | 'video'
    | 'audio';
  surface?: 'web' | 'image' | 'video' | 'audio';
  platform?: 'desktop' | 'mobile' | null;
  scenario?: string | null;
  previewType: string;
  designSystemRequired: boolean;
  defaultFor: string[];
  upstream: string | null;
  featured?: number | null;
  fidelity?: 'wireframe' | 'high-fidelity' | null;
  speakerNotes?: boolean | null;
  animations?: boolean | null;
  craftRequires?: string[];
  hasBody: boolean;
  examplePrompt: string;
}

export interface SkillDetail extends SkillSummary {
  body: string;
}

export interface SkillsResponse {
  skills: SkillSummary[];
}

export interface SkillResponse {
  skill: SkillDetail;
}

export interface DesignSystemSummary {
  id: string;
  title: string;
  category: string;
  summary: string;
  swatches?: string[];
  surface?: 'web' | 'image' | 'video' | 'audio';
}

export interface DesignSystemDetail extends DesignSystemSummary {
  body: string;
}

export interface DesignSystemsResponse {
  designSystems: DesignSystemSummary[];
}

export interface DesignSystemResponse {
  designSystem: DesignSystemDetail;
}

export interface HealthResponse {
  ok: true;
  service?: 'daemon';
  version?: string;
}

// A pet packaged by the upstream Codex `hatch-pet` skill. Each pet is a
// folder under `${CODEX_HOME:-$HOME/.codex}/pets/<id>/` that contains a
// `pet.json` manifest and a `spritesheet.<png|webp>` atlas. The daemon
// surfaces these so the web pet settings can offer one-click adoption
// of recently-hatched pets without asking the user to re-upload the
// file by hand.
export interface CodexPetSummary {
  id: string;
  displayName: string;
  description: string;
  // URL on the daemon that serves the raw spritesheet bytes.
  spritesheetUrl: string;
  // File extension reported by the on-disk spritesheet (png / webp /
  // gif). Useful only as a hint to the client renderer.
  spritesheetExt: string;
  // Unix milliseconds for the spritesheet file's mtime — lets the
  // client sort "most recently hatched" without re-listing.
  hatchedAt: number;
  // True when the pet ships in the repo under `assets/community-pets/`
  // rather than the user's `~/.codex/pets/`. Surfaced so the UI can
  // tag the card with a small "Bundled" pill and avoid prompting the
  // user to re-sync something that is already on disk.
  bundled?: boolean;
}

export interface CodexPetsResponse {
  pets: CodexPetSummary[];
  // Absolute path of the directory we scanned. Surfaced so the UI can
  // tell the user where their pets live (and where to look if a pet
  // they expect is missing).
  rootDir: string;
}

// Body for `POST /api/codex-pets/sync` — triggers the daemon-side port
// of `scripts/sync-community-pets.ts`. Both fields are optional so the
// default call (`syncCommunityPets({})`) downloads every catalog and
// skips pets that already exist on disk.
export interface SyncCommunityPetsRequest {
  // Which catalog(s) to download. Defaults to 'all'.
  source?: 'all' | 'petshare' | 'hatchery';
  // Re-download pets that already have a folder on disk.
  force?: boolean;
}

// Daemon response after a community sync. Matches the script's stdout
// summary so the web UI can show the same "wrote/skipped/failed" line.
export interface SyncCommunityPetsResponse {
  wrote: number;
  skipped: number;
  failed: number;
  total: number;
  rootDir: string;
  // Up to ~10 surfaced error messages (the daemon log keeps the rest).
  errors: string[];
}

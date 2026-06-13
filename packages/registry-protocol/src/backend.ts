import type {
  RegistryBackendKind,
  RegistryDoctorReport,
  RegistryEntry,
  RegistryListFilter,
  RegistryPublishOutcome,
  RegistryPublishRequest,
  RegistrySearchQuery,
  RegistrySearchResult,
  RegistryTrust,
  RegistryYankOutcome,
  ResolvedRegistryEntry,
} from './schemas.js';

export interface RegistryBackend {
  readonly id: string;
  readonly kind: RegistryBackendKind;
  readonly trust: RegistryTrust;

  list(filter?: RegistryListFilter): Promise<RegistryEntry[]>;
  search(query: RegistrySearchQuery): Promise<RegistrySearchResult[]>;
  resolve(name: string, range?: string): Promise<ResolvedRegistryEntry | null>;
  manifest(name: string, version: string): Promise<RegistryEntry | null>;
  doctor(): Promise<RegistryDoctorReport>;

  publish?(request: RegistryPublishRequest): Promise<RegistryPublishOutcome>;
  yank?(name: string, version: string, reason: string): Promise<RegistryYankOutcome>;
}

export interface RegistryBackendFactory<TConfig = unknown> {
  readonly kind: RegistryBackendKind;
  create(config: TConfig): RegistryBackend;
}

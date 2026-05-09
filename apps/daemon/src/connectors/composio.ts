import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import type { BoundedJsonObject, BoundedJsonValue } from '../live-artifacts/schema.js';
import { defineConnectorTool, type ConnectorCatalogDefinition, type ConnectorCatalogToolDefinition } from './catalog.js';
import { deleteComposioAuthConfigId, readComposioConfig, setComposioAuthConfigId } from './composio-config.js';
import { COMPOSIO_CURATION_OVERLAY } from './composio-curation.js';
import { getComposioToolkitMetadata } from './composio-descriptions.js';
import { ConnectorServiceError, type ConnectorCredentialMaterial } from './service.js';

const DEFAULT_COMPOSIO_BASE_URL = 'https://backend.composio.dev';
const DEFAULT_COMPOSIO_TIMEOUT_MS = 30_000;
const DEFAULT_COMPOSIO_USER_ID = 'open-design-local-user';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const DISCOVERY_CACHE_TTL_MS = 60_000;
const CUSTOM_AUTH_REQUIRED_MESSAGE = 'Composio does not have managed credentials for this toolkit.';
const PERSISTED_CATALOG_REFRESH_MS = 24 * 60 * 60 * 1000;

interface ComposioToolkitCatalogEntry {
  name: string;
  slug: string;
  category?: string;
}

interface PersistedComposioCatalogCache {
  schemaVersion: 1;
  fetchedAt: string;
  provider: 'composio';
  definitions: ConnectorCatalogDefinition[];
}

let composioCatalogCacheFilePath = path.join(process.cwd(), '.od', 'connectors', 'composio-catalog-cache.json');

const FEATURED_COMPOSIO_CATALOG: ConnectorCatalogDefinition[] = [
  {
    id: 'github',
    name: 'GitHub',
    provider: 'composio',
    category: 'Developer',
    description: 'Search and inspect GitHub repositories, issues, and pull requests.',
    providerConnectorId: 'GITHUB',
    authentication: 'composio',
    tools: [
      defineConnectorTool({
        name: 'github.github_search_repositories',
        providerToolId: 'GITHUB_SEARCH_REPOSITORIES',
        title: 'Search repositories',
        description: 'Search public and private repositories.',
        inputSchemaJson: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
        outputSchemaJson: { type: 'object', additionalProperties: true },
        requiredScopes: ['read'],
      }),
      defineConnectorTool({
        name: 'github.github_get_issue',
        providerToolId: 'GITHUB_GET_ISSUE',
        title: 'Get issue',
        description: 'Read a GitHub issue by owner, repository, and issue number.',
        inputSchemaJson: { type: 'object', properties: { owner: { type: 'string' }, repo: { type: 'string' }, issue_number: { type: 'number' } }, required: ['owner', 'repo', 'issue_number'], additionalProperties: false },
        outputSchemaJson: { type: 'object', additionalProperties: true },
        requiredScopes: ['issues:read'],
      }),
    ],
    allowedToolNames: ['github.github_search_repositories', 'github.github_get_issue'],
    featuredToolNames: ['github.github_search_repositories', 'github.github_get_issue'],
    minimumApproval: 'auto',
    toolCount: 2,
  },
  {
    id: 'notion',
    name: 'Notion',
    provider: 'composio',
    category: 'Productivity',
    description: 'Search and read Notion pages and databases.',
    providerConnectorId: 'NOTION',
    authentication: 'composio',
    tools: [
      defineConnectorTool({
        name: 'notion.notion_search',
        providerToolId: 'NOTION_SEARCH',
        title: 'Search Notion',
        description: 'Search Notion pages and databases.',
        inputSchemaJson: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
        outputSchemaJson: { type: 'object', additionalProperties: true },
        requiredScopes: ['read'],
      }),
      defineConnectorTool({
        name: 'notion.notion_fetch_database',
        providerToolId: 'NOTION_FETCH_DATABASE',
        title: 'Fetch database',
        description: 'Read a Notion database by id.',
        inputSchemaJson: { type: 'object', properties: { database_id: { type: 'string' } }, required: ['database_id'], additionalProperties: false },
        outputSchemaJson: { type: 'object', additionalProperties: true },
        requiredScopes: ['databases:read'],
      }),
    ],
    allowedToolNames: ['notion.notion_search', 'notion.notion_fetch_database'],
    featuredToolNames: ['notion.notion_search', 'notion.notion_fetch_database'],
    minimumApproval: 'auto',
    toolCount: 48,
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    provider: 'composio',
    category: 'Storage',
    description: 'Search and read files from Google Drive.',
    providerConnectorId: 'GOOGLEDRIVE',
    authentication: 'composio',
    tools: [
      defineConnectorTool({
        name: 'google_drive.googledrive_search',
        providerToolId: 'GOOGLEDRIVE_SEARCH',
        title: 'Search Drive',
        description: 'Search files in Google Drive.',
        inputSchemaJson: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'], additionalProperties: false },
        outputSchemaJson: { type: 'object', additionalProperties: true },
        requiredScopes: ['drive.readonly'],
      }),
      defineConnectorTool({
        name: 'google_drive.googledrive_get_file',
        providerToolId: 'GOOGLEDRIVE_GET_FILE',
        title: 'Get file',
        description: 'Read Google Drive file metadata by id.',
        inputSchemaJson: { type: 'object', properties: { file_id: { type: 'string' } }, required: ['file_id'], additionalProperties: false },
        outputSchemaJson: { type: 'object', additionalProperties: true },
        requiredScopes: ['drive.readonly'],
      }),
    ],
    allowedToolNames: ['google_drive.googledrive_search', 'google_drive.googledrive_get_file'],
    featuredToolNames: ['google_drive.googledrive_search', 'google_drive.googledrive_get_file'],
    minimumApproval: 'auto',
    toolCount: 2,
  },
];

const DOCUMENTED_COMPOSIO_TOOLKITS: ComposioToolkitCatalogEntry[] = [
  { name: 'Airtable', slug: 'AIRTABLE' },
  { name: 'Apaleo', slug: 'APALEO' },
  { name: 'Asana', slug: 'ASANA' },
  { name: 'Attio', slug: 'ATTIO' },
  { name: 'Basecamp', slug: 'BASECAMP' },
  { name: 'Bitbucket', slug: 'BITBUCKET' },
  { name: 'Blackbaud', slug: 'BLACKBAUD' },
  { name: 'Boldsign', slug: 'BOLDSIGN' },
  { name: 'Box', slug: 'BOX' },
  { name: 'Cal', slug: 'CAL' },
  { name: 'Calendly', slug: 'CALENDLY' },
  { name: 'Canva', slug: 'CANVA' },
  { name: 'Capsule CRM', slug: 'CAPSULE_CRM' },
  { name: 'ClickUp', slug: 'CLICKUP' },
  { name: 'Confluence', slug: 'CONFLUENCE' },
  { name: 'Contentful', slug: 'CONTENTFUL' },
  { name: 'Convex', slug: 'CONVEX' },
  { name: 'Crowdin', slug: 'CROWDIN' },
  { name: 'Dart', slug: 'DART' },
  { name: 'Dialpad', slug: 'DIALPAD' },
  { name: 'DigitalOcean', slug: 'DIGITAL_OCEAN' },
  { name: 'Discord', slug: 'DISCORD' },
  { name: 'Discord Bot', slug: 'DISCORDBOT' },
  { name: 'Dropbox', slug: 'DROPBOX' },
  { name: 'Dub', slug: 'DUB' },
  { name: 'Dynamics 365', slug: 'DYNAMICS365' },
  { name: 'Eventbrite', slug: 'EVENTBRITE' },
  { name: 'Excel', slug: 'EXCEL' },
  { name: 'Exist', slug: 'EXIST' },
  { name: 'Facebook', slug: 'FACEBOOK' },
  { name: 'Fathom', slug: 'FATHOM' },
  { name: 'Figma', slug: 'FIGMA' },
  { name: 'Freeagent', slug: 'FREEAGENT' },
  { name: 'FreshBooks', slug: 'FRESHBOOKS' },
  { name: 'GitHub', slug: 'GITHUB' },
  { name: 'GitLab', slug: 'GITLAB' },
  { name: 'Gmail', slug: 'GMAIL' },
  { name: 'Google Ads', slug: 'GOOGLEADS' },
  { name: 'Google Analytics', slug: 'GOOGLE_ANALYTICS' },
  { name: 'Google BigQuery', slug: 'GOOGLEBIGQUERY' },
  { name: 'Google Calendar', slug: 'GOOGLECALENDAR' },
  { name: 'Google Classroom', slug: 'GOOGLE_CLASSROOM' },
  { name: 'Google Docs', slug: 'GOOGLEDOCS' },
  { name: 'Google Drive', slug: 'GOOGLEDRIVE' },
  { name: 'Google Maps', slug: 'GOOGLE_MAPS' },
  { name: 'Google Meet', slug: 'GOOGLEMEET' },
  { name: 'Google Photos', slug: 'GOOGLEPHOTOS' },
  { name: 'Google Search Console', slug: 'GOOGLE_SEARCH_CONSOLE' },
  { name: 'Google Sheets', slug: 'GOOGLESHEETS' },
  { name: 'Google Slides', slug: 'GOOGLESLIDES' },
  { name: 'Google Super', slug: 'GOOGLESUPER' },
  { name: 'Google Tasks', slug: 'GOOGLETASKS' },
  { name: 'Gorgias', slug: 'GORGIAS' },
  { name: 'Gumroad', slug: 'GUMROAD' },
  { name: 'Harvest', slug: 'HARVEST' },
  { name: 'HubSpot', slug: 'HUBSPOT' },
  { name: 'Hugging Face', slug: 'HUGGING_FACE' },
  { name: 'Instagram', slug: 'INSTAGRAM' },
  { name: 'Intercom', slug: 'INTERCOM' },
  { name: 'Jira', slug: 'JIRA' },
  { name: 'Kit', slug: 'KIT' },
  { name: 'Linear', slug: 'LINEAR' },
  { name: 'LinkedIn', slug: 'LINKEDIN' },
  { name: 'Linkhut', slug: 'LINKHUT' },
  { name: 'Mailchimp', slug: 'MAILCHIMP' },
  { name: 'Microsoft Teams', slug: 'MICROSOFT_TEAMS' },
  { name: 'Miro', slug: 'MIRO' },
  { name: 'Monday', slug: 'MONDAY' },
  { name: 'Moneybird', slug: 'MONEYBIRD' },
  { name: 'Mural', slug: 'MURAL' },
  { name: 'Notion', slug: 'NOTION' },
  { name: 'Omnisend', slug: 'OMNISEND' },
  { name: 'OneDrive', slug: 'ONE_DRIVE' },
  { name: 'Outlook', slug: 'OUTLOOK' },
  { name: 'PagerDuty', slug: 'PAGERDUTY' },
  { name: 'Prisma', slug: 'PRISMA' },
  { name: 'Productboard', slug: 'PRODUCTBOARD' },
  { name: 'Pushbullet', slug: 'PUSHBULLET' },
  { name: 'QuickBooks', slug: 'QUICKBOOKS' },
  { name: 'Reddit', slug: 'REDDIT' },
  { name: 'Reddit Ads', slug: 'REDDIT_ADS' },
  { name: 'Roam', slug: 'ROAM' },
  { name: 'Salesforce', slug: 'SALESFORCE' },
  { name: 'Sentry', slug: 'SENTRY' },
  { name: 'Servicem8', slug: 'SERVICEM8' },
  { name: 'SharePoint', slug: 'SHARE_POINT' },
  { name: 'Shippo', slug: 'SHIPPO' },
  { name: 'Slack', slug: 'SLACK' },
  { name: 'Slackbot', slug: 'SLACKBOT' },
  { name: 'Splitwise', slug: 'SPLITWISE' },
  { name: 'Square', slug: 'SQUARE' },
  { name: 'Stack Exchange', slug: 'STACK_EXCHANGE' },
  { name: 'Strava', slug: 'STRAVA' },
  { name: 'Stripe', slug: 'STRIPE' },
  { name: 'Supabase', slug: 'SUPABASE' },
  { name: 'Ticketmaster', slug: 'TICKETMASTER' },
  { name: 'Ticktick', slug: 'TICKTICK' },
  { name: 'Timely', slug: 'TIMELY' },
  { name: 'Todoist', slug: 'TODOIST' },
  { name: 'Toneden', slug: 'TONEDEN' },
  { name: 'Trello', slug: 'TRELLO' },
  { name: 'Typeform', slug: 'TYPEFORM' },
  { name: 'WakaTime', slug: 'WAKATIME' },
  { name: 'Webex', slug: 'WEBEX' },
  { name: 'WhatsApp', slug: 'WHATSAPP' },
  { name: 'Wrike', slug: 'WRIKE' },
  { name: 'Yandex', slug: 'YANDEX' },
  { name: 'YNAB', slug: 'YNAB' },
  { name: 'YouTube', slug: 'YOUTUBE' },
  { name: 'Zendesk', slug: 'ZENDESK' },
  { name: 'Zoho', slug: 'ZOHO' },
  { name: 'Zoho Bigin', slug: 'ZOHO_BIGIN' },
  { name: 'Zoho Books', slug: 'ZOHO_BOOKS' },
  { name: 'Zoho Desk', slug: 'ZOHO_DESK' },
  { name: 'Zoho Inventory', slug: 'ZOHO_INVENTORY' },
  { name: 'Zoho Invoice', slug: 'ZOHO_INVOICE' },
  { name: 'Zoho Mail', slug: 'ZOHO_MAIL' },
  { name: 'Zoom', slug: 'ZOOM' },
  { name: 'Apify MCP', slug: 'APIFY_MCP' },
  { name: 'BambooHR', slug: 'BAMBOOHR' },
  { name: 'Beeminder', slug: 'BEEMINDER' },
  { name: 'Bitwarden', slug: 'BITWARDEN' },
  { name: 'Blackboard', slug: 'BLACKBOARD' },
  { name: 'Borneo', slug: 'BORNEO' },
  { name: 'Brevo', slug: 'BREVO' },
  { name: 'Brex', slug: 'BREX' },
  { name: 'Canvas', slug: 'CANVAS' },
  { name: 'Clockify', slug: 'CLOCKIFY' },
  { name: 'Coupa', slug: 'COUPA' },
  { name: 'D2L Brightspace', slug: 'D2LBRIGHTSPACE' },
  { name: 'Databricks', slug: 'DATABRICKS' },
  { name: 'Datadog', slug: 'DATADOG' },
  { name: 'DocuSign', slug: 'DOCUSIGN' },
  { name: 'Dropbox Sign', slug: 'DROPBOX_SIGN' },
  { name: 'Egnyte', slug: 'EGNYTE' },
  { name: 'Epic Games', slug: 'EPIC_GAMES' },
  { name: 'Fly', slug: 'FLY' },
  { name: 'Follow Up Boss', slug: 'FOLLOW_UP_BOSS' },
  { name: 'Gong', slug: 'GONG' },
  { name: 'Google Admin', slug: 'GOOGLE_ADMIN' },
  { name: 'Google Chat', slug: 'GOOGLE_CHAT' },
  { name: 'Googlecontacts', slug: 'GOOGLECONTACTS' },
  { name: 'Googleforms', slug: 'GOOGLEFORMS' },
  { name: 'Granola MCP', slug: 'GRANOLA_MCP' },
  { name: 'Gusto', slug: 'GUSTO' },
  { name: 'Help Scout', slug: 'HELP_SCOUT' },
  { name: 'Highlevel', slug: 'HIGHLEVEL' },
  { name: 'Insighto.ai', slug: 'INSIGHTO_AI' },
  { name: 'Klaviyo', slug: 'KLAVIYO' },
  { name: 'Kommo', slug: 'KOMMO' },
  { name: 'Lever', slug: 'LEVER' },
  { name: 'Linkedin Ads', slug: 'LINKEDIN_ADS' },
  { name: 'Lodgify', slug: 'LODGIFY' },
  { name: 'Matterport', slug: 'MATTERPORT' },
  { name: 'Meta Ads', slug: 'METAADS' },
  { name: 'Monday MCP', slug: 'MONDAY_MCP' },
  { name: 'Netsuite', slug: 'NETSUITE' },
  { name: 'Parma', slug: 'PARMA' },
  { name: 'Pinecone', slug: 'PINECONE' },
  { name: 'Pipedrive', slug: 'PIPEDRIVE' },
  { name: 'Ramp', slug: 'RAMP' },
  { name: 'Razorpay', slug: 'RAZORPAY' },
  { name: 'Recruitee', slug: 'RECRUITEE' },
  { name: 'Salesforce Service Cloud', slug: 'SALESFORCE_SERVICE_CLOUD' },
  { name: 'Scheduleonce', slug: 'SCHEDULEONCE' },
  { name: 'Sendloop', slug: 'SENDLOOP' },
  { name: 'ServiceNow', slug: 'SERVICENOW' },
  { name: 'Shopify', slug: 'SHOPIFY' },
  { name: 'Snapchat', slug: 'SNAPCHAT' },
  { name: 'Snowflake', slug: 'SNOWFLAKE' },
  { name: 'Spotify', slug: 'SPOTIFY' },
  { name: 'Storyblok', slug: 'STORYBLOK' },
  { name: 'SurveyMonkey', slug: 'SURVEY_MONKEY' },
  { name: 'Tally', slug: 'TALLY' },
  { name: 'Tavily MCP', slug: 'TAVILY_MCP' },
  { name: 'Tiktok', slug: 'TIKTOK' },
  { name: 'TinyFish MCP', slug: 'TINYFISH_MCP' },
  { name: 'Twitter', slug: 'TWITTER' },
  { name: 'Webflow', slug: 'WEBFLOW' },
  { name: 'Xero', slug: 'XERO' },
  { name: 'Zoominfo', slug: 'ZOOMINFO' },
];

const STATIC_COMPOSIO_CATALOG: ConnectorCatalogDefinition[] = buildStaticComposioCatalog();

interface ComposioConnectedAccountResponse {
  id?: unknown;
  nanoid?: unknown;
  connected_account_id?: unknown;
  connectedAccountId?: unknown;
  status?: unknown;
  redirect_url?: unknown;
  redirectUrl?: unknown;
  user_id?: unknown;
  userId?: unknown;
  account_id?: unknown;
  accountId?: unknown;
  account_label?: unknown;
  accountLabel?: unknown;
  name?: unknown;
  email?: unknown;
  auth_config?: { id?: unknown };
  toolkit?: { slug?: unknown };
  metadata?: unknown;
}

interface ComposioAuthConfigResponse {
  id?: unknown;
  status?: unknown;
  toolkit?: { slug?: unknown };
  toolkit_slug?: unknown;
  toolkitSlug?: unknown;
  auth_config?: { id?: unknown };
}

interface ComposioToolkitResponse {
  slug?: unknown;
  name?: unknown;
  logo?: unknown;
  description?: unknown;
  categories?: unknown;
  meta?: {
    description?: unknown;
    categories?: unknown;
    tools_count?: unknown;
    toolsCount?: unknown;
  };
}

interface ComposioToolResponse {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  human_description?: unknown;
  humanDescription?: unknown;
  input_parameters?: unknown;
  inputParameters?: unknown;
  tags?: unknown;
  scopes?: unknown;
  oauth_scopes?: unknown;
  oauthScopes?: unknown;
  auth_scopes?: unknown;
  authScopes?: unknown;
  toolkit?: { slug?: unknown };
}

interface ComposioToolsPage {
  items: ComposioToolResponse[];
  nextCursor?: string;
  totalItems?: number;
}

interface ComposioToolExecuteResponse {
  data?: unknown;
  error?: unknown;
  successful?: unknown;
  session_info?: unknown;
  sessionInfo?: unknown;
  log_id?: unknown;
  logId?: unknown;
}

export interface ComposioConnectionStart {
  kind: 'redirect_required' | 'pending' | 'connected';
  redirectUrl?: string;
  providerConnectionId?: string;
  expiresAt?: string;
  accountLabel?: string;
  credentials?: ConnectorCredentialMaterial;
}

export interface ComposioPendingConnection {
  connectorId: string;
  state: string;
  providerConnectionId?: string;
  expiresAtMs: number;
}

export interface ComposioConnectionCompletion {
  connectorId: string;
  accountLabel: string;
  credentials: ConnectorCredentialMaterial;
}

interface ComposioAuthConfigResolution {
  authConfigId: string;
  fromCache: boolean;
}

export type ComposioAuthConfigPrepareResult =
  | { status: 'ready'; authConfigId: string }
  | { status: 'custom_required'; message: string }
  | { status: 'error'; message: string };

export class ComposioConnectorProvider {
  private discoveredAuthConfigIds: Record<string, string> | undefined;
  private readonly locallyCreatedAuthConfigs = new Map<string, { authConfigId: string; toolkitSlug: string }>();
  private readonly definitionsCache = new Map<string, { definitions: ConnectorCatalogDefinition[]; expiresAtMs: number }>();
  private readonly definitionsPromises = new Map<string, Promise<ConnectorCatalogDefinition[]>>();
  private definitionsGeneration = 0;
  private readonly authConfigCreationPromises = new Map<string, Promise<string>>();
  private readonly unsupportedManagedAuthConfigs = new Map<string, string>();
  private readonly pendingConnections = new Map<string, ComposioPendingConnection>();
  private persistedDefinitions: ConnectorCatalogDefinition[] | undefined;
  private persistedFetchedAt: string | undefined;
  private refreshTimer: NodeJS.Timeout | undefined;
  private refreshTimeout: NodeJS.Timeout | undefined;

  isConfigured(definition: ConnectorCatalogDefinition): boolean {
    return Boolean(this.getApiKey() && (this.getPersistedAuthConfigId(definition.id) || this.discoveredAuthConfigIds?.[definition.id]));
  }

  clearDiscoveryCache(): void {
    this.discoveredAuthConfigIds = undefined;
    this.locallyCreatedAuthConfigs.clear();
    this.invalidateDefinitionsCache();
    this.authConfigCreationPromises.clear();
    this.unsupportedManagedAuthConfigs.clear();
  }

  configureCatalogCache(dataDir: string): void {
    composioCatalogCacheFilePath = path.join(dataDir, 'connectors', 'composio-catalog-cache.json');
    this.loadPersistedCatalogCache();
  }

  startCatalogRefreshLoop(): void {
    this.stopCatalogRefreshLoop();
    if (this.isPersistedCatalogStale()) this.scheduleCatalogRefresh(0);
    this.refreshTimer = setInterval(() => {
      void this.refreshCatalogInBackground();
    }, PERSISTED_CATALOG_REFRESH_MS);
    this.refreshTimer.unref?.();
  }

  stopCatalogRefreshLoop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = undefined;
    }
  }

  getFastDefinitions(): ConnectorCatalogDefinition[] {
    return this.persistedDefinitions && this.persistedDefinitions.length > 0
      ? this.persistedDefinitions
      : getStaticComposioCatalogDefinitions();
  }

  getPersistedCatalogMetadata(): { fetchedAt?: string; stale: boolean } {
    return {
      ...(this.persistedFetchedAt === undefined ? {} : { fetchedAt: this.persistedFetchedAt }),
      stale: this.isPersistedCatalogStale(),
    };
  }

  async refreshCatalog(signal?: AbortSignal): Promise<ConnectorCatalogDefinition[]> {
    this.invalidateDefinitionsCache();
    const definitions = await this.listDefinitions(signal);
    this.setPersistedDefinitions(definitions, new Date().toISOString());
    return definitions;
  }

  private invalidateDefinitionsCache(): void {
    this.definitionsGeneration += 1;
    this.definitionsCache.clear();
    this.definitionsPromises.clear();
  }

  async listDefinitions(signal?: AbortSignal, options: { hydrateTools?: boolean } = {}): Promise<ConnectorCatalogDefinition[]> {
    const cacheKey = options.hydrateTools ? 'hydrated' : 'metadata';
    const now = Date.now();
    const cached = this.definitionsCache.get(cacheKey);
    if (cached && cached.expiresAtMs > now) {
      return cached.definitions;
    }
    const existing = this.definitionsPromises.get(cacheKey);
    if (existing) return existing;

    const generation = this.definitionsGeneration;
    const promise = this.fetchDefinitions(signal, Boolean(options.hydrateTools))
      .then((definitions) => {
        if (this.definitionsGeneration === generation) {
          this.definitionsCache.set(cacheKey, { definitions, expiresAtMs: Date.now() + DISCOVERY_CACHE_TTL_MS });
        }
        this.setPersistedDefinitions(definitions, new Date().toISOString());
        return definitions;
      })
      .finally(() => {
        if (this.definitionsPromises.get(cacheKey) === promise && this.definitionsGeneration === generation) this.definitionsPromises.delete(cacheKey);
      });
    this.definitionsPromises.set(cacheKey, promise);
    return promise;
  }

  private async fetchDefinitions(signal?: AbortSignal, hydrateTools = false): Promise<ConnectorCatalogDefinition[]> {
    const apiKey = this.getApiKey();
    const authConfigs = apiKey ? await this.listAuthConfigsSafe(signal) : [];
    const configuredByConnectorId = new Map<string, { authConfigId: string; toolkitSlug: string }>();
    const discoveredAuthConfigIds: Record<string, string> = {};
    for (const item of authConfigs) {
      const authConfigId = getComposioAuthConfigId(item);
      const toolkitSlug = getComposioToolkitSlug(item);
      const status = getString(item.status)?.toUpperCase();
      if (!authConfigId || !toolkitSlug || (status && status !== 'ENABLED')) continue;
      const connectorId = connectorIdForToolkitSlug(toolkitSlug);
      discoveredAuthConfigIds[connectorId] = authConfigId;
      if (!configuredByConnectorId.has(connectorId)) configuredByConnectorId.set(connectorId, { authConfigId, toolkitSlug });
    }
    for (const [connectorId, local] of this.locallyCreatedAuthConfigs) {
      discoveredAuthConfigIds[connectorId] = local.authConfigId;
      if (!configuredByConnectorId.has(connectorId)) configuredByConnectorId.set(connectorId, local);
    }
    this.discoveredAuthConfigIds = discoveredAuthConfigIds;
    const toolkits = apiKey ? await this.listToolkitsSafe(signal) : [];
    const toolkitBySlug = new Map(toolkits.map((toolkit) => [normalizeComposioSlug(getString(toolkit.slug) ?? ''), toolkit]));
    const definitions = await mapWithConcurrency(STATIC_COMPOSIO_CATALOG, 8, async (staticDefinition) => {
      const configuredEntry = configuredByConnectorId.get(staticDefinition.id);
      const toolkitSlug = configuredEntry?.toolkitSlug ?? staticDefinition.providerConnectorId ?? staticDefinition.id;
      const toolkit = toolkitBySlug.get(normalizeComposioSlug(toolkitSlug));
      return this.definitionFromToolkit(staticDefinition, toolkitSlug, toolkit, Boolean(apiKey && hydrateTools), signal);
    });
    return definitions;
  }

  private scheduleCatalogRefresh(delayMs: number): void {
    if (this.refreshTimeout) clearTimeout(this.refreshTimeout);
    const timeout = setTimeout(() => {
      if (this.refreshTimeout === timeout) this.refreshTimeout = undefined;
      void this.refreshCatalogInBackground();
    }, delayMs);
    this.refreshTimeout = timeout;
    timeout.unref?.();
  }

  private async refreshCatalogInBackground(): Promise<void> {
    if (!this.getApiKey()) return;
    try {
      await this.refreshCatalog();
    } catch {
      // Keep startup and background refresh best-effort only.
    }
  }

  private isPersistedCatalogStale(now = Date.now()): boolean {
    if (!this.persistedFetchedAt) return true;
    const fetchedAtMs = Date.parse(this.persistedFetchedAt);
    return !Number.isFinite(fetchedAtMs) || now - fetchedAtMs >= PERSISTED_CATALOG_REFRESH_MS;
  }

  private loadPersistedCatalogCache(): void {
    const parsed = readPersistedComposioCatalogCache(composioCatalogCacheFilePath);
    if (!parsed) {
      this.persistedDefinitions = undefined;
      this.persistedFetchedAt = undefined;
      return;
    }
    this.persistedDefinitions = parsed.definitions.map((definition) => cloneConnectorDefinition(definition));
    this.persistedFetchedAt = parsed.fetchedAt;
    if (this.isPersistedCatalogStale() && this.getApiKey()) this.scheduleCatalogRefresh(0);
  }

  private setPersistedDefinitions(definitions: ConnectorCatalogDefinition[], fetchedAt: string): void {
    this.persistedDefinitions = definitions.map((definition) => cloneConnectorDefinition(definition));
    this.persistedFetchedAt = fetchedAt;
    try {
      writePersistedComposioCatalogCache(composioCatalogCacheFilePath, {
        schemaVersion: 1,
        fetchedAt,
        provider: 'composio',
        definitions: this.persistedDefinitions,
      });
    } catch (error) {
      console.warn('[connectors] Failed to persist Composio catalog cache:', error);
    }
  }

  async getDefinition(connectorId: string, signal?: AbortSignal): Promise<ConnectorCatalogDefinition | undefined> {
    const discovered = (await this.listDefinitions(signal)).find((definition) => definition.id === connectorId);
    if (discovered) return discovered;
    return undefined;
  }

  async getHydratedDefinition(connectorId: string, signal?: AbortSignal): Promise<ConnectorCatalogDefinition | undefined> {
    const discovered = (await this.listDefinitions(signal, { hydrateTools: true })).find((definition) => definition.id === connectorId);
    if (discovered) return discovered;
    return undefined;
  }

  async getPreviewDefinition(connectorId: string, options: { toolsLimit: number; toolsCursor?: string; signal?: AbortSignal }): Promise<ConnectorCatalogDefinition | undefined> {
    const metadataDefinition = (await this.listDefinitions(options.signal)).find((definition) => definition.id === connectorId);
    if (!metadataDefinition) return undefined;
    const toolkitSlug = metadataDefinition.providerConnectorId ?? metadataDefinition.id;
    return this.definitionFromToolkit(metadataDefinition, toolkitSlug, undefined, true, options.signal, {
      toolsLimit: options.toolsLimit,
      ...(options.toolsCursor === undefined ? {} : { toolsCursor: options.toolsCursor }),
    });
  }

  async connect(definition: ConnectorCatalogDefinition, callbackUrl: string, signal?: AbortSignal): Promise<ComposioConnectionStart> {
    this.pruneExpiredPendingConnections();

    let authConfig = await this.getOrCreateManagedAuthConfigId(definition, signal);

    const state = crypto.randomBytes(24).toString('base64url');
    const expiresAtMs = Date.now() + OAUTH_STATE_TTL_MS;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const callbackUrlWithState = appendOAuthStateToCallbackUrl(callbackUrl, state);
    let response: ComposioConnectedAccountResponse;
    try {
      response = await this.createConnectedAccountLink(authConfig.authConfigId, state, callbackUrlWithState, signal);
    } catch (error) {
      if (!authConfig.fromCache) throw error;
      deleteComposioAuthConfigId(definition.id);
      authConfig = await this.getOrCreateManagedAuthConfigId(definition, signal, { ignoreCache: true });
      response = await this.createConnectedAccountLink(authConfig.authConfigId, state, callbackUrlWithState, signal);
    }

    const providerConnectionId = getComposioConnectionId(response);
    const redirectUrl = getString(response.redirect_url) ?? getString(response.redirectUrl);
    const status = getString(response.status)?.toUpperCase();
    this.pendingConnections.set(state, { connectorId: definition.id, state, ...(providerConnectionId ? { providerConnectionId } : {}), expiresAtMs });

    const validatedConnection = status === 'ACTIVE' && providerConnectionId
      ? await this.getValidatedConnectedAccount(definition, providerConnectionId, authConfig.authConfigId, signal)
      : undefined;
    if (validatedConnection) this.pendingConnections.delete(state);

    return {
      kind: redirectUrl ? 'redirect_required' : status === 'ACTIVE' ? 'connected' : 'pending',
      ...(redirectUrl ? { redirectUrl } : {}),
      ...(providerConnectionId ? { providerConnectionId } : {}),
      expiresAt,
      ...(validatedConnection ? this.connectionToCredentials(definition, providerConnectionId!, validatedConnection) : {}),
    };
  }

  async prepareAuthConfig(definition: ConnectorCatalogDefinition, signal?: AbortSignal): Promise<ComposioAuthConfigPrepareResult> {
    if (definition.authentication !== 'composio') return { status: 'error', message: 'connector is not backed by Composio' };
    const unsupported = this.unsupportedManagedAuthConfigs.get(definition.id);
    if (unsupported) return { status: 'custom_required', message: unsupported };
    try {
      const resolution = await this.getOrCreateManagedAuthConfigId(definition, signal);
      return { status: 'ready', authConfigId: resolution.authConfigId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isCustomAuthRequiredMessage(message)) {
        const customMessage = normalizeCustomAuthRequiredMessage(message);
        this.unsupportedManagedAuthConfigs.set(definition.id, customMessage);
        return { status: 'custom_required', message: customMessage };
      }
      return { status: 'error', message };
    }
  }

  cancelPendingConnections(connectorId: string): number {
    this.pruneExpiredPendingConnections();
    let cancelled = 0;
    for (const [state, pending] of this.pendingConnections.entries()) {
      if (pending.connectorId !== connectorId) continue;
      this.pendingConnections.delete(state);
      cancelled += 1;
    }
    return cancelled;
  }

  async completeConnection(input: { definition: ConnectorCatalogDefinition; state: string; providerConnectionId?: string; status?: string; signal?: AbortSignal }): Promise<ComposioConnectionCompletion> {
    this.pruneExpiredPendingConnections();

    const connectorId = input.definition.id;
    const pending = this.pendingConnections.get(input.state);
    this.pendingConnections.delete(input.state);
    if (!pending || pending.connectorId !== connectorId || pending.expiresAtMs < Date.now()) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio OAuth state is missing or expired', 400, { connectorId });
    }
    if (input.status && input.status.toLowerCase() !== 'success') {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio OAuth did not complete successfully', 400, { connectorId });
    }
    const providerConnectionId = input.providerConnectionId ?? pending.providerConnectionId;
    if (input.providerConnectionId && pending.providerConnectionId && input.providerConnectionId !== pending.providerConnectionId) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio callback connection id did not match pending connection', 403, { connectorId });
    }
    if (!providerConnectionId) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio callback did not include a connection id', 400, { connectorId });
    }
    const expectedAuthConfigId = await this.getAuthConfigId(input.definition, input.signal);
    const response = await this.getValidatedConnectedAccount(input.definition, providerConnectionId, expectedAuthConfigId, input.signal);
    const authConfigId = getString(response.auth_config?.id);
    if (authConfigId) this.storeAuthConfigId(input.definition, authConfigId, getString(response.toolkit?.slug) ?? input.definition.providerConnectorId);
    return this.connectionToCredentials(input.definition, providerConnectionId, response);
  }

  private pruneExpiredPendingConnections(now = Date.now()): void {
    for (const [state, pending] of this.pendingConnections.entries()) {
      if (pending.expiresAtMs <= now) this.pendingConnections.delete(state);
    }
  }

  private async getValidatedConnectedAccount(definition: ConnectorCatalogDefinition, providerConnectionId: string, expectedAuthConfigId: string | undefined, signal?: AbortSignal): Promise<ComposioConnectedAccountResponse> {
    const connectorId = definition.id;
    const response = await this.requestJson<ComposioConnectedAccountResponse>(`/api/v3/connected_accounts/${encodeURIComponent(providerConnectionId)}`, {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    });
    const providerUserId = getString(response.user_id) ?? getString(response.userId);
    if (providerUserId && providerUserId !== this.getUserId()) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio account belongs to a different user', 403, { connectorId });
    }
    const providerAuthConfigId = getString(response.auth_config?.id);
    if (expectedAuthConfigId && providerAuthConfigId && expectedAuthConfigId !== providerAuthConfigId) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio account belongs to a different auth configuration', 403, { connectorId, expectedAuthConfigId, providerAuthConfigId });
    }
    const expectedToolkitSlug = definition.providerConnectorId;
    const providerToolkitSlug = getString(response.toolkit?.slug);
    if (expectedToolkitSlug && providerToolkitSlug && connectorIdForToolkitSlug(expectedToolkitSlug) !== connectorIdForToolkitSlug(providerToolkitSlug)) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio account belongs to a different toolkit', 403, { connectorId });
    }
    return response;
  }

  async disconnect(credentials: ConnectorCredentialMaterial | undefined, signal?: AbortSignal): Promise<void> {
    const providerConnectionId = credentials ? getString(credentials.providerConnectionId) : undefined;
    if (!providerConnectionId || !this.getApiKey()) return;
    const response = await this.request(`/api/v3/connected_accounts/${encodeURIComponent(providerConnectionId)}`, { method: 'DELETE', ...(signal === undefined ? {} : { signal }) });
    if (!response.ok && response.status !== 404) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', `Composio disconnect failed with HTTP ${response.status}`, 502, { httpStatus: response.status });
    }
  }

  async execute(definition: ConnectorCatalogDefinition, tool: ConnectorCatalogToolDefinition, input: BoundedJsonObject, credentials: ConnectorCredentialMaterial | undefined, signal?: AbortSignal): Promise<BoundedJsonObject> {
    const providerConnectionId = credentials ? getString(credentials.providerConnectionId) : undefined;
    if (!providerConnectionId) {
      throw new ConnectorServiceError('CONNECTOR_NOT_CONNECTED', 'Composio connector is not connected', 403, { connectorId: definition.id });
    }
    const providerToolId = tool.providerToolId ?? tool.name;
    const response = await this.requestJson<ComposioToolExecuteResponse>(`/api/v3.1/tools/execute/${encodeURIComponent(providerToolId)}`, {
      method: 'POST',
      body: JSON.stringify({
        connected_account_id: providerConnectionId,
        user_id: this.getUserId(),
        arguments: input,
      }),
      ...(signal === undefined ? {} : { signal }),
    });
    if (response.successful === false || response.error) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio tool execution failed', 502, {
        connectorId: definition.id,
        toolName: tool.name,
        error: toBoundedJsonValue(response.error),
      });
    }
    const output = toBoundedJsonValue(response.data);
    return {
      toolName: tool.name,
      providerToolId,
      data: output,
      ...(getString(response.log_id) ?? getString(response.logId) ? { providerExecutionId: (getString(response.log_id) ?? getString(response.logId))! } : {}),
      ...(toBoundedJsonValue(response.session_info ?? response.sessionInfo) !== null ? { sessionInfo: toBoundedJsonValue(response.session_info ?? response.sessionInfo) } : {}),
    };
  }

  private async getAuthConfigId(definition: ConnectorCatalogDefinition, signal?: AbortSignal): Promise<string | undefined> {
    const persisted = this.getPersistedAuthConfigId(definition.id);
    if (persisted) return persisted;
    if (!this.discoveredAuthConfigIds) this.discoveredAuthConfigIds = await this.discoverAuthConfigIds(signal);
    return this.discoveredAuthConfigIds[definition.id];
  }

  private async getOrCreateManagedAuthConfigId(definition: ConnectorCatalogDefinition, signal?: AbortSignal, options: { ignoreCache?: boolean } = {}): Promise<ComposioAuthConfigResolution> {
    if (!options.ignoreCache) {
      const persisted = this.getPersistedAuthConfigId(definition.id);
      if (persisted) {
        return { authConfigId: persisted, fromCache: true };
      }
      const discovered = this.discoveredAuthConfigIds?.[definition.id];
      if (discovered) {
        return { authConfigId: discovered, fromCache: true };
      }
    }

    const existing = await this.getAuthConfigIdForToolkit(definition, signal);
    if (existing) {
      this.storeAuthConfigId(definition, existing);
      return { authConfigId: existing, fromCache: false };
    }

    const inFlight = this.authConfigCreationPromises.get(definition.id);
    if (inFlight) {
      const authConfigId = await inFlight;
      return { authConfigId, fromCache: false };
    }

    const promise = this.createAndStoreManagedAuthConfigId(definition, signal)
      .finally(() => {
        if (this.authConfigCreationPromises.get(definition.id) === promise) this.authConfigCreationPromises.delete(definition.id);
      });
    this.authConfigCreationPromises.set(definition.id, promise);
    const authConfigId = await promise;
    return { authConfigId, fromCache: false };
  }

  private async createAndStoreManagedAuthConfigId(definition: ConnectorCatalogDefinition, signal?: AbortSignal): Promise<string> {
    const created = await this.createManagedAuthConfig(definition, signal);
    const authConfigId = getComposioAuthConfigId(created);
    const toolkitSlug = getComposioToolkitSlug(created) ?? definition.providerConnectorId;
    if (!authConfigId || !toolkitSlug) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio auth config response was missing an id or toolkit slug', 502, {
        connectorId: definition.id,
      });
    }

    const connectorId = connectorIdForToolkitSlug(toolkitSlug);
    if (connectorId !== definition.id) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio created an auth config for a different toolkit', 502, {
        connectorId: definition.id,
        toolkitSlug,
      });
    }

    this.storeAuthConfigId(definition, authConfigId, toolkitSlug);
    this.invalidateDefinitionsCache();
    return authConfigId;
  }

  private async createManagedAuthConfig(definition: ConnectorCatalogDefinition, signal?: AbortSignal): Promise<ComposioAuthConfigResponse> {
    const toolkitSlug = definition.providerConnectorId;
    if (!toolkitSlug) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio connector is missing a toolkit slug', 500, { connectorId: definition.id });
    }
    return this.requestJson<ComposioAuthConfigResponse>('/api/v3.1/auth_configs', {
      method: 'POST',
      body: JSON.stringify({
        toolkit: { slug: toolkitSlug },
        auth_config: { type: 'use_composio_managed_auth' },
      }),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  private async getAuthConfigIdForToolkit(definition: ConnectorCatalogDefinition, signal?: AbortSignal): Promise<string | undefined> {
    const toolkitSlug = definition.providerConnectorId;
    if (!toolkitSlug) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio connector is missing a toolkit slug', 500, { connectorId: definition.id });
    }
    const items = await this.listAuthConfigsSafe(signal, toolkitSlug);
    for (const item of items) {
      const authConfigId = getComposioAuthConfigId(item);
      const itemToolkitSlug = getComposioToolkitSlug(item) ?? toolkitSlug;
      const status = getString(item.status)?.toUpperCase();
      if (!authConfigId || (status && status !== 'ENABLED')) continue;
      if (connectorIdForToolkitSlug(itemToolkitSlug) !== definition.id) continue;
      return authConfigId;
    }
    return undefined;
  }

  private async createConnectedAccountLink(authConfigId: string, state: string, callbackUrl: string, signal?: AbortSignal): Promise<ComposioConnectedAccountResponse> {
    return this.requestJson<ComposioConnectedAccountResponse>('/api/v3.1/connected_accounts/link', {
      method: 'POST',
      body: JSON.stringify({
        auth_config_id: authConfigId,
        user_id: this.getUserId(),
        connection_data: { state_prefix: state },
        callback_url: callbackUrl,
      }),
      ...(signal === undefined ? {} : { signal }),
    });
  }

  private getPersistedAuthConfigId(connectorId: string): string | undefined {
    return getString(readComposioConfig().authConfigIds[connectorId]);
  }

  private storeAuthConfigId(definition: ConnectorCatalogDefinition, authConfigId: string, toolkitSlug = definition.providerConnectorId): void {
    this.discoveredAuthConfigIds = {
      ...(this.discoveredAuthConfigIds ?? {}),
      [definition.id]: authConfigId,
    };
    if (toolkitSlug) this.locallyCreatedAuthConfigs.set(definition.id, { authConfigId, toolkitSlug });
    setComposioAuthConfigId(definition.id, authConfigId);
  }

  private async discoverAuthConfigIds(signal?: AbortSignal): Promise<Record<string, string>> {
    if (!this.getApiKey()) return {};
    const items = await this.listAuthConfigsSafe(signal);
    const discovered: Record<string, string> = {};
    for (const item of items) {
      const authConfigId = getComposioAuthConfigId(item);
      const toolkitSlug = getComposioToolkitSlug(item);
      const status = getString(item.status)?.toUpperCase();
      if (!authConfigId || !toolkitSlug || (status && status !== 'ENABLED')) continue;
      discovered[connectorIdForToolkitSlug(toolkitSlug)] = authConfigId;
    }
    for (const [connectorId, local] of this.locallyCreatedAuthConfigs) discovered[connectorId] = local.authConfigId;
    return discovered;
  }

  private async listAuthConfigs(signal?: AbortSignal, toolkitSlug?: string): Promise<ComposioAuthConfigResponse[]> {
    const path = toolkitSlug
      ? `/api/v3/auth_configs?${new URLSearchParams({ toolkit_slug: toolkitSlug }).toString()}`
      : '/api/v3/auth_configs';
    const response = await this.request(path, { method: 'GET', ...(signal === undefined ? {} : { signal }) });
    if (!response.ok) return [];
    const payload = await response.json() as { items?: unknown; data?: unknown };
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.data) ? payload.data : [];
    return items.filter((item): item is ComposioAuthConfigResponse => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  }

  private async listAuthConfigsSafe(signal?: AbortSignal, toolkitSlug?: string): Promise<ComposioAuthConfigResponse[]> {
    try {
      return await this.listAuthConfigs(signal, toolkitSlug);
    } catch {
      return [];
    }
  }

  private async listToolkits(signal?: AbortSignal): Promise<ComposioToolkitResponse[]> {
    const response = await this.request('/api/v3.1/toolkits?limit=1000', { method: 'GET', ...(signal === undefined ? {} : { signal }) });
    if (!response.ok) return [];
    const payload = await response.json() as { items?: unknown; data?: unknown };
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.data) ? payload.data : [];
    return items.filter((item): item is ComposioToolkitResponse => Boolean(item && typeof item === 'object' && !Array.isArray(item)));
  }

  private async listToolkitsSafe(signal?: AbortSignal): Promise<ComposioToolkitResponse[]> {
    try {
      return await this.listToolkits(signal);
    } catch {
      return [];
    }
  }

  private async listToolsPage(toolkitSlug: string, options: { limit?: number; cursor?: string; signal?: AbortSignal } = {}): Promise<ComposioToolsPage> {
    const searchParams = new URLSearchParams({ toolkit_slug: toolkitSlug.toLowerCase(), limit: String(options.limit ?? 1000) });
    if (options.cursor) searchParams.set('cursor', options.cursor);
    const response = await this.request(`/api/v3.1/tools?${searchParams.toString()}`, { method: 'GET', ...(options.signal === undefined ? {} : { signal: options.signal }) });
    if (!response.ok) {
      const message = await getComposioErrorMessage(response);
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', message ?? `Composio tools request failed with HTTP ${response.status}`, response.status === 401 ? 401 : 502, { httpStatus: response.status });
    }
    const payload = await response.json() as { items?: unknown; data?: unknown; next_cursor?: unknown; nextCursor?: unknown; total_items?: unknown; totalItems?: unknown };
    const items = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.data) ? payload.data : [];
    const nextCursor = getString(payload.next_cursor) ?? getString(payload.nextCursor);
    const totalItems = getNonNegativeInteger(payload.total_items) ?? getNonNegativeInteger(payload.totalItems);
    return {
      items: items.filter((item): item is ComposioToolResponse => Boolean(item && typeof item === 'object' && !Array.isArray(item))),
      ...(nextCursor === undefined ? {} : { nextCursor }),
      ...(totalItems === undefined ? {} : { totalItems }),
    };
  }

  private async listTools(toolkitSlug: string, signal?: AbortSignal): Promise<ComposioToolResponse[]> {
    return (await this.listToolsPage(toolkitSlug, { limit: 1000, ...(signal === undefined ? {} : { signal }) })).items;
  }

  private async listToolsSafe(toolkitSlug: string, signal?: AbortSignal): Promise<ComposioToolResponse[]> {
    try {
      return await this.listTools(toolkitSlug, signal);
    } catch {
      return [];
    }
  }

  private async definitionFromToolkit(
    staticDefinition: ConnectorCatalogDefinition,
    toolkitSlug: string,
    toolkit: ComposioToolkitResponse | undefined,
    hydrateTools: boolean,
    signal?: AbortSignal,
    toolPageOptions: { toolsLimit?: number; toolsCursor?: string } = {},
  ): Promise<ConnectorCatalogDefinition> {
    const connectorId = staticDefinition.id;
    const toolPage = hydrateTools && toolPageOptions.toolsLimit !== undefined
      ? await this.listToolsPage(toolkitSlug, {
        limit: toolPageOptions.toolsLimit,
        ...(toolPageOptions.toolsCursor === undefined ? {} : { cursor: toolPageOptions.toolsCursor }),
        ...(signal === undefined ? {} : { signal }),
      })
      : undefined;
    const liveTools = hydrateTools
      ? (toolPage?.items ?? await this.listToolsSafe(toolkitSlug, signal))
        .filter((tool) => {
          const toolToolkitSlug = getString(tool.toolkit?.slug);
          return !toolToolkitSlug || normalizeComposioSlug(toolToolkitSlug) === normalizeComposioSlug(toolkitSlug);
        })
        .map((tool) => this.toolDefinitionFromComposioTool(connectorId, tool))
      : [];
    const liveToolsByName = new Map(liveTools.map((tool) => [tool.name, tool]));
    const staticToolNames = new Set(staticDefinition.tools.map((tool) => tool.name));
    const tools = [
      ...staticDefinition.tools.map((tool) => mergeToolDefinition(tool, liveToolsByName.get(tool.name))),
      ...liveTools.filter((tool) => !staticToolNames.has(tool.name)),
    ];
    const autoAllowedLiveToolNames = liveTools
      .filter((tool) => tool.refreshEligible)
      .map((tool) => tool.name);
    const allowedToolNames = [...new Set([...staticDefinition.allowedToolNames, ...autoAllowedLiveToolNames])];
    // `curatedToolNames` mirrors the static catalog ONLY — it
    // intentionally never picks up `autoAllowedLiveToolNames`. The
    // wire detail and the connector card / drawer header badge read
    // this so the "N tools" summary stays at the catalog baseline
    // (e.g. 2 for GitHub) instead of inflating by the tens of
    // read-only auto-approved tools that show up after Composio
    // discovery (issue #748). The execution-time gate keeps using
    // `allowedToolNames`, so the dynamic auto-allow behavior is
    // preserved end-to-end.
    const curatedToolNames = [...staticDefinition.allowedToolNames];
    const name = getString(toolkit?.name) ?? staticDefinition.name;
    const category = firstCategoryName(toolkit?.meta?.categories) ?? firstCategoryName(toolkit?.categories) ?? staticDefinition.category;
    const liveDescription = getComposioToolkitDescription(toolkit);
    const description = liveDescription ?? staticDefinition.description;
    const liveToolCount = getComposioToolkitToolCount(toolkit);
    const toolCount = toolPage?.totalItems ?? liveToolCount ?? staticDefinition.toolCount ?? (tools.length > 0 ? tools.length : undefined);
    return {
      ...staticDefinition,
      id: connectorId,
      name,
      providerConnectorId: staticDefinition.providerConnectorId ?? toolkitSlug,
      category,
      ...(description === undefined ? {} : { description }),
      tools,
      ...(toolCount === undefined ? {} : { toolCount }),
      ...(toolPage?.nextCursor === undefined ? {} : { toolsNextCursor: toolPage.nextCursor }),
      ...(toolPage === undefined ? {} : { toolsHasMore: toolPage.nextCursor !== undefined }),
      allowedToolNames,
      curatedToolNames,
      ...(staticDefinition.featuredToolNames === undefined
        ? tools.length > 0 ? { featuredToolNames: tools.slice(0, 3).map((tool) => tool.name) } : {}
        : { featuredToolNames: staticDefinition.featuredToolNames }),
    };
  }

  private toolDefinitionFromComposioTool(connectorId: string, tool: ComposioToolResponse): ConnectorCatalogToolDefinition {
    const providerToolId = getString(tool.slug) ?? getString(tool.name) ?? `${connectorId.toUpperCase()}_TOOL`;
    const description = getString(tool.description) ?? getString(tool.human_description) ?? getString(tool.humanDescription) ?? '';
    const requiredScopes = getStringArray(tool.scopes ?? tool.oauth_scopes ?? tool.oauthScopes ?? tool.auth_scopes ?? tool.authScopes ?? tool.tags);
    return applyComposioToolCuration(defineConnectorTool({
      name: `${connectorId}.${normalizeToolName(providerToolId)}`,
      providerToolId,
      title: getString(tool.name) ?? titleFromSlug(providerToolId),
      ...(description ? { description } : {}),
      inputSchemaJson: toBoundedJsonObject(tool.input_parameters ?? tool.inputParameters) ?? { type: 'object', additionalProperties: true },
      outputSchemaJson: { type: 'object', additionalProperties: true },
      requiredScopes,
    }), connectorId, providerToolId);
  }

  private connectionToCredentials(_definition: ConnectorCatalogDefinition, providerConnectionId: string, response: ComposioConnectedAccountResponse): ComposioConnectionCompletion {
    const accountLabel = getString(response.account_label)
      ?? getString(response.accountLabel)
      ?? getString(response.email)
      ?? getString(response.name)
      ?? providerConnectionId;
    const accountId = getString(response.account_id) ?? getString(response.accountId);
    return {
      connectorId: _definition.id,
      accountLabel,
      credentials: {
        provider: 'composio',
        providerConnectionId,
        ...(accountId ? { accountId } : {}),
      },
    };
  }

  private async requestJson<T extends object>(path: string, input: { method: string; body?: string; signal?: AbortSignal }): Promise<T> {
    const response = await this.request(path, input);
    if (!response.ok) {
      const message = await getComposioErrorMessage(response);
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', message ?? `Composio request failed with HTTP ${response.status}`, response.status === 401 ? 401 : 502, { httpStatus: response.status });
    }
    const value = await response.json() as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio returned an invalid response', 502);
    }
    return value as T;
  }

  private async request(path: string, input: { method: string; body?: string; signal?: AbortSignal }): Promise<Response> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new ConnectorServiceError('CONNECTOR_EXECUTION_FAILED', 'Composio provider is not configured', 503, { setting: 'apiKey' });
    }
    const timeout = AbortSignal.timeout(DEFAULT_COMPOSIO_TIMEOUT_MS);
    const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
    return fetch(`${this.getBaseUrl().replace(/\/+$/, '')}${path}`, {
      method: input.method,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'OpenDesign/0.1 ComposioConnectorProvider',
        'x-api-key': apiKey,
      },
      ...(input.body ? { body: input.body } : {}),
      signal,
    });
  }

  private getApiKey(): string | undefined {
    return readComposioConfig().apiKey || undefined;
  }

  private getBaseUrl(): string {
    return DEFAULT_COMPOSIO_BASE_URL;
  }

  private getUserId(): string {
    return DEFAULT_COMPOSIO_USER_ID;
  }
}

function mergeToolDefinition(staticTool: ConnectorCatalogToolDefinition, liveTool: ConnectorCatalogToolDefinition | undefined): ConnectorCatalogToolDefinition {
  if (!liveTool) return staticTool;
  return {
    ...staticTool,
    ...(liveTool.description === undefined ? {} : { description: liveTool.description }),
    ...(liveTool.inputSchemaJson === undefined ? {} : { inputSchemaJson: liveTool.inputSchemaJson }),
    ...(liveTool.outputSchemaJson === undefined ? {} : { outputSchemaJson: liveTool.outputSchemaJson }),
    ...(liveTool.providerToolId === undefined ? {} : { providerToolId: liveTool.providerToolId }),
    requiredScopes: liveTool.requiredScopes.length > 0 ? liveTool.requiredScopes : staticTool.requiredScopes,
    safety: liveTool.safety,
    refreshEligible: liveTool.refreshEligible,
    ...((liveTool.curation ?? staticTool.curation) === undefined ? {} : { curation: liveTool.curation ?? staticTool.curation }),
  };
}

export const composioConnectorProvider = new ComposioConnectorProvider();

function buildStaticComposioCatalog(): ConnectorCatalogDefinition[] {
  const definitions = new Map<string, ConnectorCatalogDefinition>();
  for (const definition of FEATURED_COMPOSIO_CATALOG) {
    definitions.set(definition.id, {
      ...definition,
      tools: definition.tools.map((tool) => applyComposioToolCuration(tool, definition.providerConnectorId ?? definition.id, tool.providerToolId)),
    });
  }
  for (const toolkit of DOCUMENTED_COMPOSIO_TOOLKITS) {
    const id = connectorIdForToolkitSlug(toolkit.slug);
    if (definitions.has(id)) continue;
    definitions.set(id, createComposioCatalogDefinition(toolkit));
  }
  return [...definitions.values()];
}

function createComposioCatalogDefinition(toolkit: ComposioToolkitCatalogEntry): ConnectorCatalogDefinition {
  const curated = getComposioToolkitMetadata(toolkit.slug);
  // Prefer a hand-authored description when offline. Live Composio toolkit
  // metadata still wins during discovery, as long as it is not the legacy
  // generic "Connect to X through Composio." placeholder.
  const description = curated?.description ?? fallbackComposioDescription(toolkit.name, curated?.category ?? toolkit.category);
  const category = curated?.category ?? toolkit.category ?? 'Integration';
  return {
    id: connectorIdForToolkitSlug(toolkit.slug),
    name: toolkit.name,
    provider: 'composio',
    category,
    description,
    providerConnectorId: toolkit.slug,
    authentication: 'composio',
    tools: [],
    allowedToolNames: [],
    minimumApproval: 'auto',
    ...(curated?.toolCount === undefined ? {} : { toolCount: curated.toolCount }),
  };
}

export function getStaticComposioCatalogDefinitions(): ConnectorCatalogDefinition[] {
  return STATIC_COMPOSIO_CATALOG.map((definition) => ({
    ...cloneConnectorDefinition(definition),
  }));
}

function cloneConnectorDefinition(definition: ConnectorCatalogDefinition): ConnectorCatalogDefinition {
  return {
    ...definition,
    tools: definition.tools.map((tool) => ({
      name: tool.name,
      title: tool.title,
      ...(tool.description === undefined ? {} : { description: tool.description }),
      ...(tool.inputSchemaJson === undefined ? {} : { inputSchemaJson: toBoundedJsonObject(tool.inputSchemaJson)! }),
      ...(tool.outputSchemaJson === undefined ? {} : { outputSchemaJson: toBoundedJsonObject(tool.outputSchemaJson)! }),
      safety: { ...tool.safety },
      refreshEligible: tool.refreshEligible,
      ...(tool.curation === undefined ? {} : { curation: { ...(tool.curation.useCases === undefined ? {} : { useCases: [...tool.curation.useCases] }), ...(tool.curation.reason === undefined ? {} : { reason: tool.curation.reason }) } }),
      requiredScopes: [...tool.requiredScopes],
      ...(tool.providerToolId === undefined ? {} : { providerToolId: tool.providerToolId }),
    })),
    allowedToolNames: [...definition.allowedToolNames],
    ...(definition.toolCount === undefined ? {} : { toolCount: definition.toolCount }),
    ...(definition.featuredToolNames === undefined ? {} : { featuredToolNames: [...definition.featuredToolNames] }),
  };
}

function normalizePersistedConnectorDefinition(value: unknown): ConnectorCatalogDefinition | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string' || typeof record.provider !== 'string' || typeof record.category !== 'string') return undefined;
  const tools = Array.isArray(record.tools)
    ? record.tools.map(normalizePersistedConnectorToolDefinition).filter((tool): tool is ConnectorCatalogToolDefinition => tool !== undefined)
    : [];
  const definition: ConnectorCatalogDefinition = {
    id: record.id,
    name: record.name,
    provider: record.provider,
    category: record.category,
    tools,
    allowedToolNames: Array.isArray(record.allowedToolNames) ? record.allowedToolNames.filter((item): item is string => typeof item === 'string') : [],
  };
  if (typeof record.description === 'string') definition.description = record.description;
  if (record.authentication === 'local' || record.authentication === 'none' || record.authentication === 'oauth' || record.authentication === 'composio') {
    definition.authentication = record.authentication;
  }
  if (typeof record.providerConnectorId === 'string') definition.providerConnectorId = record.providerConnectorId;
  if (Array.isArray(record.featuredToolNames)) definition.featuredToolNames = record.featuredToolNames.filter((item): item is string => typeof item === 'string');
  if (typeof record.toolCount === 'number' && Number.isFinite(record.toolCount) && record.toolCount >= 0) {
    definition.toolCount = record.toolCount;
  }
  if (record.minimumApproval === 'auto' || record.minimumApproval === 'confirm' || record.minimumApproval === 'disabled') {
    definition.minimumApproval = record.minimumApproval;
  }
  if (typeof record.disabled === 'boolean') definition.disabled = record.disabled;
  return definition;
}

function normalizePersistedConnectorToolDefinition(value: unknown): ConnectorCatalogToolDefinition | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.name !== 'string' || typeof record.title !== 'string') return undefined;
  if (!record.safety || typeof record.safety !== 'object' || Array.isArray(record.safety)) return undefined;
  const safetyRecord = record.safety as Record<string, unknown>;
  if (typeof safetyRecord.sideEffect !== 'string' || typeof safetyRecord.approval !== 'string' || typeof safetyRecord.reason !== 'string') return undefined;
  return {
    name: record.name,
    title: record.title,
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
    ...(toBoundedJsonObject(record.inputSchemaJson) === undefined ? {} : { inputSchemaJson: toBoundedJsonObject(record.inputSchemaJson)! }),
    ...(toBoundedJsonObject(record.outputSchemaJson) === undefined ? {} : { outputSchemaJson: toBoundedJsonObject(record.outputSchemaJson)! }),
    safety: {
      sideEffect: safetyRecord.sideEffect as ConnectorCatalogToolDefinition['safety']['sideEffect'],
      approval: safetyRecord.approval as ConnectorCatalogToolDefinition['safety']['approval'],
      reason: safetyRecord.reason,
    },
    refreshEligible: Boolean(record.refreshEligible),
    ...(record.curation && typeof record.curation === 'object' && !Array.isArray(record.curation)
      ? {
        curation: {
          ...(((record.curation as Record<string, unknown>).useCases && Array.isArray((record.curation as Record<string, unknown>).useCases))
            ? { useCases: ((record.curation as Record<string, unknown>).useCases as unknown[]).filter((item): item is 'personal_daily_digest' => item === 'personal_daily_digest') }
            : {}),
          ...(typeof (record.curation as Record<string, unknown>).reason === 'string' ? { reason: (record.curation as Record<string, unknown>).reason as string } : {}),
        },
      }
      : {}),
    requiredScopes: Array.isArray(record.requiredScopes) ? record.requiredScopes.filter((item): item is string => typeof item === 'string') : [],
    ...(typeof record.providerToolId === 'string' ? { providerToolId: record.providerToolId } : {}),
  };
}

function readPersistedComposioCatalogCache(filePath: string): PersistedComposioCatalogCache | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    const record = parsed as Record<string, unknown>;
    if (record.schemaVersion !== 1 || record.provider !== 'composio' || typeof record.fetchedAt !== 'string' || !Array.isArray(record.definitions)) return undefined;
    return {
      schemaVersion: 1,
      provider: 'composio',
      fetchedAt: record.fetchedAt,
      definitions: record.definitions.map(normalizePersistedConnectorDefinition).filter((definition): definition is ConnectorCatalogDefinition => definition !== undefined),
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
    return undefined;
  }
}

function writePersistedComposioCatalogCache(filePath: string, cache: PersistedComposioCatalogCache): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(cache, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function getNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

async function mapWithConcurrency<T, U>(items: readonly T[], concurrency: number, mapper: (item: T, index: number) => Promise<U>): Promise<U[]> {
  const results = new Array<U>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]!, index);
    }
  }));
  return results;
}

function getComposioToolkitDescription(toolkit: ComposioToolkitResponse | undefined): string | undefined {
  const description = getString(toolkit?.meta?.description) ?? getString(toolkit?.description);
  if (!description || isGenericComposioDescription(description)) return undefined;
  return description;
}

function getComposioToolkitToolCount(toolkit: ComposioToolkitResponse | undefined): number | undefined {
  return getNonNegativeInteger(toolkit?.meta?.tools_count) ?? getNonNegativeInteger(toolkit?.meta?.toolsCount);
}

function isGenericComposioDescription(description: string): boolean {
  return /^connect to .+ through composio\.?$/i.test(description.trim())
    || /^.+ integration via composio\.?$/i.test(description.trim());
}

function fallbackComposioDescription(name: string, category: string | undefined): string {
  const normalizedCategory = category?.trim().toLowerCase();
  if (normalizedCategory?.includes('project')) return `Coordinate ${name} projects, tasks, and workflow data inside Open Design.`;
  if (normalizedCategory?.includes('communication')) return `Bring ${name} conversations, channels, and collaboration context into Open Design.`;
  if (normalizedCategory?.includes('documentation')) return `Search and reuse ${name} knowledge, pages, and documentation in Open Design.`;
  if (normalizedCategory?.includes('storage')) return `Find and reference ${name} files, folders, and document metadata from Open Design.`;
  if (normalizedCategory?.includes('developer')) return `Inspect ${name} developer resources, activity, and operational context from Open Design.`;
  if (normalizedCategory?.includes('crm') || normalizedCategory?.includes('sales')) return `Use ${name} customer, deal, and account context in Open Design artifacts.`;
  if (normalizedCategory?.includes('marketing')) return `Analyze ${name} campaigns, audiences, and marketing activity from Open Design.`;
  if (normalizedCategory?.includes('finance') || normalizedCategory?.includes('commerce')) return `Work with ${name} business, billing, and transaction data in Open Design.`;
  if (normalizedCategory?.includes('observability')) return `Surface ${name} incidents, metrics, and operational signals in Open Design.`;
  if (normalizedCategory?.includes('data')) return `Query ${name} datasets and platform metadata for data-backed Open Design artifacts.`;
  return `Use ${name} tools and data directly from Open Design.`;
}

function getComposioAuthConfigId(response: ComposioAuthConfigResponse): string | undefined {
  return getString(response.id) ?? getString(response.auth_config?.id);
}

function getComposioToolkitSlug(response: ComposioAuthConfigResponse): string | undefined {
  return getString(response.toolkit?.slug) ?? getString(response.toolkit_slug) ?? getString(response.toolkitSlug);
}

function getComposioConnectionId(response: ComposioConnectedAccountResponse): string | undefined {
  return getString(response.connected_account_id) ?? getString(response.connectedAccountId) ?? getString(response.id) ?? getString(response.nanoid);
}

function appendOAuthStateToCallbackUrl(callbackUrl: string, state: string): string {
  const url = new URL(callbackUrl);
  url.searchParams.set('state', state);
  return url.toString();
}

function connectorIdForToolkitSlug(toolkitSlug: string): string {
  const normalized = normalizeComposioSlug(toolkitSlug);
  if (normalized === 'googledrive' || normalized === 'gdrive' || normalized === 'drive') return 'google_drive';
  return normalized;
}

function normalizeComposioSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizeToolName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'tool';
}

function normalizeProviderToolId(value: string): string {
  return normalizeToolName(value);
}

function applyComposioToolCuration(
  tool: ConnectorCatalogToolDefinition,
  connectorId: string,
  providerToolId: string | undefined,
): ConnectorCatalogToolDefinition {
  const connectorKey = normalizeComposioSlug(connectorId);
  const overlay = COMPOSIO_CURATION_OVERLAY[connectorKey];
  const toolKey = providerToolId ? normalizeProviderToolId(providerToolId) : undefined;
  const curation = toolKey ? overlay?.[toolKey] : undefined;
  return curation === undefined ? tool : { ...tool, curation: { ...(tool.curation ?? {}), ...curation } };
}

function titleFromSlug(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (word) => `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}`);
}

function firstCategoryName(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) return item.trim();
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const record = item as Record<string, unknown>;
      const name = getString(record.name) ?? getString(record.slug);
      if (name) return name;
    }
  }
  return undefined;
}

function isCustomAuthRequiredMessage(message: string): boolean {
  return /default auth config not found/i.test(message) || /does not have managed credentials/i.test(message);
}

function normalizeCustomAuthRequiredMessage(message: string): string {
  return message || CUSTOM_AUTH_REQUIRED_MESSAGE;
}

async function getComposioErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const payload = await response.json() as unknown;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return undefined;
    const record = payload as Record<string, unknown>;
    const error = record.error && typeof record.error === 'object' && !Array.isArray(record.error)
      ? record.error as Record<string, unknown>
      : undefined;
    return getString(record.message)
      ?? getString(error?.message)
      ?? getString(record.error)
      ?? getString(record.detail)
      ?? getString(error?.suggested_fix);
  } catch {
    return undefined;
  }
}

function toBoundedJsonValue(value: unknown): BoundedJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => toBoundedJsonValue(item));
  if (value && typeof value === 'object') {
    const output: BoundedJsonObject = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = toBoundedJsonValue(child);
    return output;
  }
  return null;
}

function toBoundedJsonObject(value: unknown): BoundedJsonObject | undefined {
  const bounded = toBoundedJsonValue(value);
  return bounded && typeof bounded === 'object' && !Array.isArray(bounded) ? bounded : undefined;
}

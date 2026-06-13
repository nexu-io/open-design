// Curated metadata overrides for Composio toolkits.
//
// The Composio public toolkit list is long and the default description we
// used to ship (`Connect to <name> through Composio.`) is uninformative.
// This module hosts hand-written overrides for the most common toolkits so
// each connector card surfaces an accurate, category-specific description
// and a better category tag than the generic "Composio" bucket.
//
// Keep keys in sync with the slugs in DOCUMENTED_COMPOSIO_TOOLKITS. If a
// toolkit is missing from this map, composio.ts falls back to a neutral
// description generated from the display name.

export interface ComposioToolkitMetadata {
  /** Human-authored description tailored to the SaaS/tool. */
  description: string;
  /** Preferred category tag for the connector card. */
  category: string;
  /** Snapshot count for first paint before live toolkit metadata loads. */
  toolCount?: number;
}

export const COMPOSIO_TOOLKIT_METADATA: Record<string, ComposioToolkitMetadata> = {
  // Developer tooling
  GITHUB: {
    description:
      'Browse repositories, read issues and pull requests, inspect commits, and search code across GitHub.',
    category: 'Developer',
    toolCount: 2,
  },
  GITLAB: {
    description:
      'Inspect GitLab projects, issues, merge requests, and pipelines for engineering workflows.',
    category: 'Developer',
  },
  BITBUCKET: {
    description:
      'Read Bitbucket repositories, pull requests, and pipelines to feed code-aware artifacts.',
    category: 'Developer',
  },
  LINEAR: {
    description:
      'Query Linear issues, projects, cycles, and teams to ground planning artifacts in live product data.',
    category: 'Project management',
  },
  JIRA: {
    description:
      'Search Jira issues, sprints, epics, and boards to build status reports and roadmap artifacts.',
    category: 'Project management',
  },
  CONFLUENCE: {
    description:
      'Search and read Confluence spaces and pages for internal documentation context.',
    category: 'Documentation',
  },
  SENTRY: {
    description:
      'Inspect Sentry issues, events, and release health to surface production incidents.',
    category: 'Observability',
  },
  DATADOG: {
    description:
      'Query Datadog monitors, dashboards, and metrics for live reliability dashboards.',
    category: 'Observability',
  },
  PAGERDUTY: {
    description:
      'Read PagerDuty incidents, services, and schedules to power on-call runbooks.',
    category: 'Observability',
  },
  DATABRICKS: {
    description:
      'Access Databricks workspaces, clusters, and SQL warehouses for data-driven artifacts.',
    category: 'Data platform',
  },
  SNOWFLAKE: {
    description:
      'Run read-only queries against Snowflake warehouses to pull analytics into live artifacts.',
    category: 'Data platform',
  },
  SUPABASE: {
    description:
      'Inspect Supabase projects, tables, and storage buckets for prototypes grounded in real data.',
    category: 'Data platform',
  },
  CONVEX: {
    description: 'Query Convex tables and functions for realtime-backed live artifacts.',
    category: 'Data platform',
  },
  PRISMA: {
    description: 'Inspect Prisma schema and data models for database-driven prototypes.',
    category: 'Developer',
  },
  PINECONE: {
    description: 'Query Pinecone indexes and namespaces for retrieval-augmented artifacts.',
    category: 'AI infrastructure',
  },
  DIGITAL_OCEAN: {
    description: 'Inspect DigitalOcean droplets, databases, and spaces for infra dashboards.',
    category: 'Developer',
  },
  FLY: {
    description: 'Read Fly.io apps, machines, and volumes to power infra status artifacts.',
    category: 'Developer',
  },
  APIFY_MCP: {
    description: 'Run Apify actors to scrape, crawl, and enrich data for live artifacts.',
    category: 'Automation',
    toolCount: 8,
  },
  TAVILY_MCP: {
    description: 'Run Tavily web search and extraction for research-grounded artifacts.',
    category: 'Research',
  },
  GRANOLA_MCP: {
    description: 'Pull Granola meeting notes and summaries into briefing artifacts.',
    category: 'Productivity',
  },
  TINYFISH_MCP: {
    description: 'Run TinyFish browsing agents to capture structured web data into artifacts.',
    category: 'Automation',
  },

  // Productivity / docs
  NOTION: {
    description:
      'Search Notion pages and databases, read page content, and pull structured records into artifacts.',
    category: 'Productivity',
    toolCount: 48,
  },
  GOOGLEDOCS: {
    description: 'Read Google Docs content and comments to source text for live artifacts.',
    category: 'Productivity',
  },
  GOOGLESHEETS: {
    description:
      'Read and search Google Sheets spreadsheets to power tables, charts, and dashboards.',
    category: 'Spreadsheets',
  },
  EXCEL: {
    description:
      'Read Excel workbooks, worksheets, and ranges to pull numbers into live artifacts.',
    category: 'Spreadsheets',
  },
  GOOGLESLIDES: {
    description: 'Read Google Slides presentations for reference in new decks.',
    category: 'Presentations',
  },
  GOOGLEDRIVE: {
    description: 'Search and read files and folders stored in Google Drive.',
    category: 'Storage',
    toolCount: 2,
  },
  DROPBOX: {
    description: 'Search and read files stored in Dropbox for document-grounded artifacts.',
    category: 'Storage',
  },
  BOX: {
    description: 'Browse and read Box files and folders for enterprise document workflows.',
    category: 'Storage',
  },
  ONE_DRIVE: {
    description: 'Search and read files in OneDrive for Microsoft 365 document workflows.',
    category: 'Storage',
  },
  SHARE_POINT: {
    description: 'Browse SharePoint sites and lists to pull structured enterprise content.',
    category: 'Storage',
  },
  EGNYTE: {
    description: 'Read Egnyte folders and files for regulated document workflows.',
    category: 'Storage',
  },
  GOOGLECALENDAR: {
    description: 'Read calendar events and availability from Google Calendar.',
    category: 'Calendar',
  },
  OUTLOOK: {
    description: 'Read Outlook mailboxes, calendars, and contacts for Microsoft 365 workflows.',
    category: 'Email',
  },
  GMAIL: {
    description: 'Search and read Gmail threads to surface inbox context in artifacts.',
    category: 'Email',
  },
  GOOGLE_CHAT: {
    description: 'Read Google Chat spaces and messages for team-comms grounded artifacts.',
    category: 'Communication',
  },
  SLACK: {
    description: 'Search Slack channels, read messages, and list users and channels.',
    category: 'Communication',
  },
  SLACKBOT: {
    description: 'Use a Slack bot identity to read channels and messages in a workspace.',
    category: 'Communication',
  },
  DISCORD: {
    description: 'Read Discord servers, channels, and messages for community analytics.',
    category: 'Communication',
  },
  DISCORDBOT: {
    description: 'Use a Discord bot identity to read servers, channels, and messages.',
    category: 'Communication',
  },
  MICROSOFT_TEAMS: {
    description: 'Read Microsoft Teams channels, chats, and meetings for workplace context.',
    category: 'Communication',
  },
  WEBEX: {
    description: 'Read Webex rooms, messages, and meeting metadata.',
    category: 'Communication',
  },
  ZOOM: {
    description: 'Read Zoom meetings, recordings, and participant metadata.',
    category: 'Meetings',
  },
  GOOGLEMEET: {
    description: 'Read Google Meet meeting and participant metadata.',
    category: 'Meetings',
  },
  WHATSAPP: {
    description: 'Read WhatsApp Business conversations and message metadata.',
    category: 'Communication',
  },

  // Project mgmt / tasks / collaboration
  ASANA: {
    description: 'Query Asana projects, tasks, and teams for delivery artifacts.',
    category: 'Project management',
  },
  MONDAY: {
    description: 'Read monday.com boards, items, and updates.',
    category: 'Project management',
  },
  MONDAY_MCP: {
    description: 'Run monday.com actions through the MCP integration.',
    category: 'Project management',
  },
  CLICKUP: {
    description: 'Query ClickUp spaces, lists, and tasks for planning artifacts.',
    category: 'Project management',
  },
  TRELLO: {
    description: 'Read Trello boards, lists, and cards for kanban-style artifacts.',
    category: 'Project management',
  },
  BASECAMP: {
    description: 'Read Basecamp projects, todos, and messages.',
    category: 'Project management',
  },
  WRIKE: {
    description: 'Query Wrike folders, tasks, and custom fields.',
    category: 'Project management',
  },
  TODOIST: {
    description: 'Read Todoist projects and tasks for personal productivity artifacts.',
    category: 'Tasks',
  },
  TICKTICK: {
    description: 'Read TickTick lists and tasks for personal productivity artifacts.',
    category: 'Tasks',
  },
  DART: {
    description: 'Query Dart workspaces, tasks, and docs for engineering planning.',
    category: 'Project management',
  },
  PRODUCTBOARD: {
    description: 'Read Productboard features, notes, and roadmaps.',
    category: 'Product',
  },
  GOOGLETASKS: {
    description: 'Read Google Tasks lists and tasks.',
    category: 'Tasks',
  },
  ROAM: {
    description: 'Read Roam Research graphs and pages for networked-note artifacts.',
    category: 'Documentation',
  },

  // Design / whiteboards
  FIGMA: {
    description:
      'Read Figma files, pages, frames, and components to reference real design context.',
    category: 'Design',
  },
  MIRO: {
    description: 'Read Miro boards and sticky notes for whiteboard-based artifacts.',
    category: 'Whiteboard',
  },
  MURAL: {
    description: 'Read Mural boards and widgets for workshop-grounded artifacts.',
    category: 'Whiteboard',
  },
  CANVA: {
    description: 'Read Canva designs and brand assets.',
    category: 'Design',
  },
  MATTERPORT: {
    description: 'Read Matterport spaces and captures for 3D-grounded artifacts.',
    category: 'Design',
  },

  // CRM / sales
  HUBSPOT: {
    description: 'Query HubSpot contacts, companies, deals, and tickets.',
    category: 'CRM',
  },
  SALESFORCE: {
    description: 'Query Salesforce objects, reports, and dashboards.',
    category: 'CRM',
  },
  SALESFORCE_SERVICE_CLOUD: {
    description: 'Query Salesforce Service Cloud cases, accounts, and knowledge articles.',
    category: 'Support',
  },
  PIPEDRIVE: {
    description: 'Read Pipedrive deals, contacts, and activities.',
    category: 'CRM',
  },
  ATTIO: {
    description: 'Query Attio lists, records, and attributes for modern CRM workflows.',
    category: 'CRM',
  },
  CAPSULE_CRM: {
    description: 'Read Capsule CRM contacts, opportunities, and tasks.',
    category: 'CRM',
  },
  KOMMO: {
    description: 'Read Kommo leads, contacts, and pipelines.',
    category: 'CRM',
  },
  ZOHO: {
    description: 'Query Zoho CRM modules, records, and reports.',
    category: 'CRM',
  },
  ZOHO_BIGIN: {
    description: 'Read Zoho Bigin pipelines, deals, and contacts.',
    category: 'CRM',
  },
  ZOHO_BOOKS: {
    description: 'Read Zoho Books invoices, customers, and ledgers.',
    category: 'Finance',
  },
  ZOHO_DESK: {
    description: 'Query Zoho Desk tickets, agents, and departments.',
    category: 'Support',
  },
  ZOHO_INVENTORY: {
    description: 'Read Zoho Inventory items, orders, and warehouses.',
    category: 'Commerce',
  },
  ZOHO_INVOICE: {
    description: 'Read Zoho Invoice invoices, estimates, and customers.',
    category: 'Finance',
  },
  ZOHO_MAIL: {
    description: 'Search Zoho Mail folders and messages.',
    category: 'Email',
  },
  FOLLOW_UP_BOSS: {
    description: 'Read Follow Up Boss contacts, deals, and activities for real estate CRM.',
    category: 'CRM',
  },
  HIGHLEVEL: {
    description: 'Query HighLevel contacts, pipelines, and campaigns.',
    category: 'CRM',
  },
  PARMA: {
    description: 'Read Parma personal CRM contacts and interactions.',
    category: 'CRM',
  },
  INSIGHTO_AI: {
    description: 'Read Insighto.ai voice agent conversations and analytics.',
    category: 'AI agents',
  },
  LEVER: {
    description: 'Query Lever opportunities, candidates, and postings.',
    category: 'Recruiting',
  },
  RECRUITEE: {
    description: 'Read Recruitee candidates, jobs, and pipelines.',
    category: 'Recruiting',
  },
  GONG: {
    description: 'Read Gong call recordings, transcripts, and sales insights.',
    category: 'Sales intelligence',
  },

  // Support / helpdesk
  INTERCOM: {
    description: 'Query Intercom conversations, users, and articles.',
    category: 'Support',
  },
  ZENDESK: {
    description: 'Read Zendesk tickets, users, and help center articles.',
    category: 'Support',
  },
  GORGIAS: {
    description: 'Read Gorgias tickets, customers, and macros for ecommerce support.',
    category: 'Support',
  },
  HELP_SCOUT: {
    description: 'Query Help Scout mailboxes, conversations, and customers.',
    category: 'Support',
  },
  SERVICENOW: {
    description: 'Read ServiceNow incidents, change requests, and CMDB records.',
    category: 'ITSM',
  },
  FRESHBOOKS: {
    description: 'Read FreshBooks invoices, clients, and expenses.',
    category: 'Finance',
  },

  // Finance / accounting / payments
  STRIPE: {
    description: 'Read Stripe customers, charges, subscriptions, and payouts.',
    category: 'Payments',
  },
  QUICKBOOKS: {
    description: 'Query QuickBooks customers, invoices, and accounts.',
    category: 'Accounting',
  },
  XERO: {
    description: 'Read Xero invoices, contacts, and ledgers.',
    category: 'Accounting',
  },
  NETSUITE: {
    description: 'Query NetSuite records, saved searches, and reports.',
    category: 'ERP',
  },
  RAMP: {
    description: 'Read Ramp transactions, cards, and vendors.',
    category: 'Finance',
  },
  BREX: {
    description: 'Read Brex transactions, cards, and budgets.',
    category: 'Finance',
  },
  RAZORPAY: {
    description: 'Read Razorpay payments, orders, and settlements.',
    category: 'Payments',
  },
  MONEYBIRD: {
    description: 'Read Moneybird invoices, contacts, and administrations.',
    category: 'Accounting',
  },
  FREEAGENT: {
    description: 'Read FreeAgent invoices, expenses, and timeslips.',
    category: 'Accounting',
  },
  COUPA: {
    description: 'Read Coupa suppliers, invoices, and requisitions.',
    category: 'Procurement',
  },
  SPLITWISE: {
    description: 'Read Splitwise groups, expenses, and balances.',
    category: 'Finance',
  },
  YNAB: {
    description: 'Read YNAB budgets, accounts, and transactions.',
    category: 'Finance',
  },
  BEEMINDER: {
    description: 'Read Beeminder goals and datapoints.',
    category: 'Personal',
  },

  // Marketing / ads / email
  MAILCHIMP: {
    description: 'Read Mailchimp audiences, campaigns, and reports.',
    category: 'Marketing',
  },
  BREVO: {
    description: 'Read Brevo contacts, campaigns, and SMS metrics.',
    category: 'Marketing',
  },
  KLAVIYO: {
    description: 'Read Klaviyo lists, segments, flows, and campaign metrics.',
    category: 'Marketing',
  },
  OMNISEND: {
    description: 'Read Omnisend campaigns, automations, and audiences.',
    category: 'Marketing',
  },
  SENDLOOP: {
    description: 'Read Sendloop lists and campaigns.',
    category: 'Marketing',
  },
  KIT: {
    description: 'Read Kit (ConvertKit) subscribers, sequences, and broadcasts.',
    category: 'Marketing',
  },
  GOOGLEADS: {
    description: 'Read Google Ads campaigns, ad groups, and performance reports.',
    category: 'Advertising',
  },
  METAADS: {
    description: 'Read Meta (Facebook/Instagram) Ads campaigns and insights.',
    category: 'Advertising',
  },
  REDDIT_ADS: {
    description: 'Read Reddit Ads campaigns and performance.',
    category: 'Advertising',
  },
  LINKEDIN_ADS: {
    description: 'Read LinkedIn Ads campaigns, creatives, and analytics.',
    category: 'Advertising',
  },
  GOOGLE_ANALYTICS: {
    description: 'Query Google Analytics 4 reports, metrics, and audiences.',
    category: 'Analytics',
  },
  GOOGLE_SEARCH_CONSOLE: {
    description: 'Query Google Search Console pages, queries, and performance metrics.',
    category: 'Analytics',
  },
  GOOGLEBIGQUERY: {
    description: 'Run read-only BigQuery SQL for analytics-grounded artifacts.',
    category: 'Analytics',
  },

  // Social
  LINKEDIN: {
    description: 'Read LinkedIn profiles, posts, and company pages.',
    category: 'Social',
  },
  TWITTER: {
    description: 'Read Twitter/X timelines, tweets, users, and searches.',
    category: 'Social',
    toolCount: 72,
  },
  FACEBOOK: {
    description: 'Read Facebook pages, posts, and insights.',
    category: 'Social',
  },
  INSTAGRAM: {
    description: 'Read Instagram media, profiles, and insights.',
    category: 'Social',
  },
  REDDIT: {
    description: 'Read Reddit subreddits, posts, and comments.',
    category: 'Social',
  },
  TIKTOK: {
    description: 'Read TikTok videos, profiles, and analytics.',
    category: 'Social',
  },
  SNAPCHAT: {
    description: 'Read Snapchat Ads Manager campaigns and audience insights.',
    category: 'Advertising',
  },
  YOUTUBE: {
    description: 'Read YouTube channels, videos, comments, and analytics.',
    category: 'Video',
  },
  SPOTIFY: {
    description: 'Read Spotify playlists, tracks, and listener metadata.',
    category: 'Media',
  },
  STRAVA: {
    description: 'Read Strava activities, athletes, and segments.',
    category: 'Fitness',
  },
  GUMROAD: {
    description: 'Read Gumroad products, sales, and customers.',
    category: 'Commerce',
  },
  DUB: {
    description: 'Read Dub links, domains, and analytics.',
    category: 'Marketing',
  },
  EVENTBRITE: {
    description: 'Read Eventbrite events, attendees, and orders.',
    category: 'Events',
  },
  TICKETMASTER: {
    description: 'Read Ticketmaster events, venues, and attractions.',
    category: 'Events',
  },
  EPIC_GAMES: {
    description: 'Read Epic Games store and developer portal data.',
    category: 'Gaming',
  },

  // HR / people
  BAMBOOHR: {
    description: 'Read BambooHR employees, time off, and directories.',
    category: 'HR',
  },
  GUSTO: {
    description: 'Read Gusto employees, payroll runs, and benefits.',
    category: 'HR',
  },

  // Scheduling / signing
  CAL: {
    description: 'Read Cal.com event types, bookings, and availability.',
    category: 'Scheduling',
  },
  CALENDLY: {
    description: 'Read Calendly event types, bookings, and users.',
    category: 'Scheduling',
  },
  SCHEDULEONCE: {
    description: 'Read ScheduleOnce bookings, calendars, and event types.',
    category: 'Scheduling',
  },
  CLOCKIFY: {
    description: 'Read Clockify time entries, projects, and reports.',
    category: 'Time tracking',
    toolCount: 75,
  },
  HARVEST: {
    description: 'Read Harvest time entries, projects, and invoices.',
    category: 'Time tracking',
  },
  TIMELY: {
    description: 'Read Timely time entries and memories.',
    category: 'Time tracking',
  },
  WAKATIME: {
    description: 'Read WakaTime coding time, languages, and projects.',
    category: 'Time tracking',
  },
  FATHOM: {
    description: 'Read Fathom call recordings and summaries.',
    category: 'Meetings',
  },
  DIALPAD: {
    description: 'Read Dialpad calls, contacts, and rooms.',
    category: 'Communication',
  },
  DOCUSIGN: {
    description: 'Read DocuSign envelopes, signers, and templates.',
    category: 'Signing',
  },
  DROPBOX_SIGN: {
    description: 'Read Dropbox Sign (HelloSign) signature requests and templates.',
    category: 'Signing',
  },
  BOLDSIGN: {
    description: 'Read BoldSign envelopes, templates, and signers.',
    category: 'Signing',
  },

  // Forms / surveys / feedback
  TYPEFORM: {
    description: 'Read Typeform forms, responses, and analytics.',
    category: 'Forms',
  },
  TALLY: {
    description: 'Read Tally forms and submissions.',
    category: 'Forms',
  },
  GOOGLEFORMS: {
    description: 'Read Google Forms forms and responses.',
    category: 'Forms',
  },
  SURVEY_MONKEY: {
    description: 'Read SurveyMonkey surveys and responses.',
    category: 'Surveys',
  },

  // Content / CMS / data-stores
  AIRTABLE: {
    description: 'Query Airtable bases, tables, and records for structured data artifacts.',
    category: 'Database',
    toolCount: 25,
  },
  CONTENTFUL: {
    description: 'Read Contentful content types, entries, and assets.',
    category: 'CMS',
  },
  STORYBLOK: {
    description: 'Read Storyblok stories, spaces, and components.',
    category: 'CMS',
  },
  WEBFLOW: {
    description: 'Read Webflow sites, collections, and items.',
    category: 'CMS',
  },
  SHOPIFY: {
    description: 'Read Shopify products, orders, and customers.',
    category: 'Commerce',
  },
  SQUARE: {
    description: 'Read Square payments, catalog, and locations.',
    category: 'Payments',
  },
  SHIPPO: {
    description: 'Read Shippo shipments, tracking, and labels.',
    category: 'Logistics',
  },
  LODGIFY: {
    description: 'Read Lodgify properties, bookings, and rates.',
    category: 'Hospitality',
  },
  SERVICEM8: {
    description: 'Read ServiceM8 jobs, staff, and clients.',
    category: 'Field service',
  },

  // Education / LMS / knowledge
  CANVAS: {
    description: 'Read Canvas LMS courses, assignments, and submissions.',
    category: 'Education',
    toolCount: 574,
  },
  D2LBRIGHTSPACE: {
    description: 'Read D2L Brightspace courses, enrollments, and gradebooks.',
    category: 'Education',
  },
  GOOGLE_CLASSROOM: {
    description: 'Read Google Classroom courses, coursework, and rosters.',
    category: 'Education',
  },
  BLACKBOARD: {
    description: 'Read Blackboard courses, assignments, and users.',
    category: 'Education',
  },
  BLACKBAUD: {
    description: 'Read Blackbaud constituents, gifts, and campaigns.',
    category: 'Nonprofit',
  },
  CROWDIN: {
    description: 'Read Crowdin projects, strings, and translations.',
    category: 'Localization',
  },
  HUGGING_FACE: {
    description: 'Read Hugging Face models, datasets, and spaces metadata.',
    category: 'AI infrastructure',
  },
  YANDEX: {
    description: 'Query Yandex services such as search and translate.',
    category: 'Search',
  },
  GOOGLE_MAPS: {
    description: 'Query Google Maps places, routes, and geocoding.',
    category: 'Maps',
  },
  GOOGLEPHOTOS: {
    description: 'Read Google Photos albums and media metadata.',
    category: 'Media',
  },
  GOOGLECONTACTS: {
    description: 'Read Google Contacts people and groups.',
    category: 'Contacts',
  },
  GOOGLE_ADMIN: {
    description: 'Read Google Workspace admin directory, users, and groups.',
    category: 'Admin',
  },
  GOOGLESUPER: {
    description: 'Unified Google Workspace access across Gmail, Drive, Calendar, and Docs.',
    category: 'Productivity',
  },

  // Security / misc
  BITWARDEN: {
    description: 'Read Bitwarden organization vaults and metadata (no secret values).',
    category: 'Security',
  },
  BORNEO: {
    description: 'Read Borneo data discovery findings and policies.',
    category: 'Security',
  },
  APALEO: {
    description: 'Read Apaleo property, reservation, and folio data for hospitality workflows.',
    category: 'Hospitality',
  },
  EXIST: {
    description: 'Read Exist personal analytics and correlations.',
    category: 'Personal',
  },
  PUSHBULLET: {
    description: 'Read Pushbullet pushes and devices.',
    category: 'Personal',
  },
  STACK_EXCHANGE: {
    description: 'Search Stack Exchange questions, answers, and tags across sites.',
    category: 'Research',
  },
  LINKHUT: {
    description: 'Read Linkhut bookmarks and tags.',
    category: 'Personal',
  },
  ZOOMINFO: {
    description: 'Query ZoomInfo companies, contacts, and intent signals.',
    category: 'Sales intelligence',
  },
  TONEDEN: {
    description: 'Read ToneDen campaigns and audiences for music marketing.',
    category: 'Marketing',
  },
};

/**
 * Resolve curated metadata for a toolkit slug. Returns undefined when the
 * toolkit has not been manually described yet — callers should fall back
 * to a generic description in that case.
 */
export function getComposioToolkitMetadata(slug: string): ComposioToolkitMetadata | undefined {
  return COMPOSIO_TOOLKIT_METADATA[slug];
}

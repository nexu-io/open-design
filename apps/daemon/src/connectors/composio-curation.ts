import type { ConnectorToolCuration } from './catalog.js';

const DAILY_DIGEST_CURATION: ConnectorToolCuration = {
  useCases: ['personal_daily_digest'],
};

export const COMPOSIO_CURATION_OVERLAY: Readonly<Record<string, Readonly<Record<string, ConnectorToolCuration>>>> = {
  gmail: {
    gmail_fetch_recent_emails: { ...DAILY_DIGEST_CURATION, reason: 'Recent inbox activity is useful for a personal digest.' },
    gmail_search_emails: { ...DAILY_DIGEST_CURATION, reason: 'Bounded email search can summarize recent personal activity.' },
  },
  googlecalendar: {
    googlecalendar_list_events: { ...DAILY_DIGEST_CURATION, reason: 'Upcoming and recent calendar events fit a daily briefing.' },
    googlecalendar_get_events: { ...DAILY_DIGEST_CURATION, reason: 'Calendar event retrieval supports recent schedule summaries.' },
  },
  googledrive: {
    googledrive_search: { ...DAILY_DIGEST_CURATION, reason: 'Drive search can surface recently changed personal files.' },
    googledrive_get_file: { ...DAILY_DIGEST_CURATION, reason: 'File metadata helps summarize recent document changes.' },
    googledrive_list_files: { ...DAILY_DIGEST_CURATION, reason: 'File listings can be bounded to recent user file activity.' },
    googledrive_list_changes: { ...DAILY_DIGEST_CURATION, reason: 'Recent Drive changes are a strong daily digest source.' },
  },
  googledocs: {
    googledocs_list_documents: { ...DAILY_DIGEST_CURATION, reason: 'Recent document listings support personal work recaps.' },
    googledocs_get_document: { ...DAILY_DIGEST_CURATION, reason: 'Document metadata can summarize recent user-authored docs.' },
    googledocs_search_documents: { ...DAILY_DIGEST_CURATION, reason: 'Bounded document search is useful for a daily digest.' },
  },
  googlesheets: {
    googlesheets_list_spreadsheets: { ...DAILY_DIGEST_CURATION, reason: 'Recent spreadsheet activity fits a daily recap.' },
    googlesheets_get_spreadsheet: { ...DAILY_DIGEST_CURATION, reason: 'Spreadsheet metadata can summarize recent user changes.' },
    googlesheets_search_spreadsheets: { ...DAILY_DIGEST_CURATION, reason: 'Bounded spreadsheet search helps find recent activity.' },
  },
  slack: {
    slack_list_channels: { ...DAILY_DIGEST_CURATION, reason: 'Conversation discovery is useful when selecting recent message sources.' },
    slack_list_conversations: { ...DAILY_DIGEST_CURATION, reason: 'Conversation discovery is useful when selecting recent message sources.' },
    slack_get_channel_history: { ...DAILY_DIGEST_CURATION, reason: 'Recent Slack history is useful for a personal digest.' },
    slack_fetch_conversation_history: { ...DAILY_DIGEST_CURATION, reason: 'Recent Slack history is useful for a personal digest.' },
    slack_search_messages: { ...DAILY_DIGEST_CURATION, reason: 'Bounded Slack message search can surface recent personal activity.' },
    slack_list_messages: { ...DAILY_DIGEST_CURATION, reason: 'Recent Slack messages are suitable for a daily digest.' },
  },
  github: {
    github_get_issue: { ...DAILY_DIGEST_CURATION, reason: 'Repo-scoped issue detail supports a personal digest.' },
    github_list_pull_requests: { ...DAILY_DIGEST_CURATION, reason: 'Repo-scoped PR listing fits a digest when bounded to owned repos.' },
    github_get_pull_request: { ...DAILY_DIGEST_CURATION, reason: 'PR detail is digest-friendly and repo-scoped.' },
    github_list_issues: { ...DAILY_DIGEST_CURATION, reason: 'Repo-scoped issue listing fits a digest when bounded.' },
    github_list_notifications: { ...DAILY_DIGEST_CURATION, reason: 'Authenticated-user notifications are directly digest-relevant.' },
    github_list_events: { ...DAILY_DIGEST_CURATION, reason: 'Recent repo/account events can support a digest when bounded.' },
    github_list_commits: { ...DAILY_DIGEST_CURATION, reason: 'Repo-scoped commit history is digest-friendly.' },
  },
  notion: {
    notion_search: { ...DAILY_DIGEST_CURATION, reason: 'Searching Notion pages and databases is useful for a daily recap.' },
    notion_fetch_database: { ...DAILY_DIGEST_CURATION, reason: 'Database reads can summarize recent tasks and notes.' },
    notion_query_database: { ...DAILY_DIGEST_CURATION, reason: 'Database queries support recent activity summaries.' },
  },
  linear: {
    linear_list_issues: { ...DAILY_DIGEST_CURATION, reason: 'Recent issue updates are useful in a daily digest.' },
    linear_get_issue: { ...DAILY_DIGEST_CURATION, reason: 'Issue detail supports a concise task recap.' },
    linear_search_issues: { ...DAILY_DIGEST_CURATION, reason: 'Bounded issue search can surface current work.' },
  },
  jira: {
    jira_get_issue: { ...DAILY_DIGEST_CURATION, reason: 'Issue detail is useful for personal work summaries.' },
    jira_search_issues: { ...DAILY_DIGEST_CURATION, reason: 'Bounded issue search can surface recent assigned work.' },
    jira_list_issues: { ...DAILY_DIGEST_CURATION, reason: 'Recent issues are suitable for a personal digest.' },
  },
  asana: {
    asana_get_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Recent task activity is useful for a daily digest.' },
    asana_list_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Recent task activity is useful for a daily digest.' },
    asana_search_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Bounded task search can surface current work.' },
  },
  todoist: {
    todoist_get_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Task lists are a natural daily digest source.' },
    todoist_list_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Task lists are a natural daily digest source.' },
  },
  googletasks: {
    googletasks_list_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Recent Google Tasks activity fits a personal digest.' },
    googletasks_get_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Recent Google Tasks activity fits a personal digest.' },
  },
  outlook: {
    outlook_list_messages: { ...DAILY_DIGEST_CURATION, reason: 'Recent Outlook email activity is useful for a digest.' },
    outlook_search_emails: { ...DAILY_DIGEST_CURATION, reason: 'Bounded Outlook mail search can surface recent activity.' },
    outlook_list_events: { ...DAILY_DIGEST_CURATION, reason: 'Recent Outlook calendar events fit a daily briefing.' },
  },
  microsoftteams: {
    microsoftteams_list_messages: { ...DAILY_DIGEST_CURATION, reason: 'Recent Teams messages are useful for a personal digest.' },
    microsoftteams_get_messages: { ...DAILY_DIGEST_CURATION, reason: 'Recent Teams messages are useful for a personal digest.' },
    microsoftteams_search_messages: { ...DAILY_DIGEST_CURATION, reason: 'Bounded Teams search can surface recent conversation activity.' },
  },
  discord: {
    discord_list_messages: { ...DAILY_DIGEST_CURATION, reason: 'Recent Discord messages can contribute to a personal digest.' },
    discord_get_messages: { ...DAILY_DIGEST_CURATION, reason: 'Recent Discord messages can contribute to a personal digest.' },
    discord_search_messages: { ...DAILY_DIGEST_CURATION, reason: 'Bounded Discord search can surface recent conversation activity.' },
  },
  figma: {
    figma_get_file: { ...DAILY_DIGEST_CURATION, reason: 'Recent file activity is useful in a design-focused digest.' },
    figma_list_files: { ...DAILY_DIGEST_CURATION, reason: 'Recent file activity is useful in a design-focused digest.' },
    figma_get_comments: { ...DAILY_DIGEST_CURATION, reason: 'Comment activity highlights review work for the day.' },
  },
  sentry: {
    sentry_list_issues: { ...DAILY_DIGEST_CURATION, reason: 'Recent issues are strong operational digest material.' },
    sentry_get_issue: { ...DAILY_DIGEST_CURATION, reason: 'Issue detail supports concise operational summaries.' },
    sentry_list_events: { ...DAILY_DIGEST_CURATION, reason: 'Recent events fit an engineering daily digest.' },
  },
  gitlab: {
    gitlab_list_merge_requests: { ...DAILY_DIGEST_CURATION, reason: 'Recent merge requests fit a personal digest.' },
    gitlab_get_merge_request: { ...DAILY_DIGEST_CURATION, reason: 'Merge request detail supports concise summaries.' },
    gitlab_list_issues: { ...DAILY_DIGEST_CURATION, reason: 'Recent issue activity is suitable for a daily digest.' },
    gitlab_list_commits: { ...DAILY_DIGEST_CURATION, reason: 'Recent commits are useful for a personal digest.' },
  },
  clickup: {
    clickup_get_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Task activity is useful for a daily recap.' },
    clickup_list_tasks: { ...DAILY_DIGEST_CURATION, reason: 'Task activity is useful for a daily recap.' },
  },
  trello: {
    trello_get_cards: { ...DAILY_DIGEST_CURATION, reason: 'Card activity is suitable for a personal digest.' },
    trello_list_cards: { ...DAILY_DIGEST_CURATION, reason: 'Card activity is suitable for a personal digest.' },
    trello_search_cards: { ...DAILY_DIGEST_CURATION, reason: 'Bounded card search can surface current work.' },
  },
  hubspot: {
    hubspot_list_contacts: { ...DAILY_DIGEST_CURATION, reason: 'Recent contact activity may be useful for CRM digests.' },
    hubspot_list_deals: { ...DAILY_DIGEST_CURATION, reason: 'Recent deal activity may be useful for CRM digests.' },
    hubspot_list_activities: { ...DAILY_DIGEST_CURATION, reason: 'Recent CRM activities can support a daily digest.' },
  },
};

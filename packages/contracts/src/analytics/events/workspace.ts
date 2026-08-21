/**
 * @module analytics/events/workspace
 * Incremental analytics contract for the Workspace information architecture.
 *
 * Workspace names, member emails, project titles, prompt/comment content and
 * raw URLs/errors are deliberately absent. `workspace_key` is the opaque,
 * stable workspace id used for PostHog group analytics.
 */

export type TrackingWorkspaceType = 'personal' | 'team';
export type TrackingWorkspaceRole = 'owner' | 'admin' | 'member';
export type TrackingWorkspaceScope = 'official' | 'personal' | 'team' | 'unknown';
export type TrackingWorkspacePage =
  | 'home'
  | 'community'
  | 'drafts'
  | 'all_projects'
  | 'design_systems'
  | 'plugins'
  | 'workspace_settings'
  | 'project';

export interface TrackingWorkspaceDimensions {
  /** Opaque workspace id. Never a display name. */
  workspace_key?: string;
  workspace_type?: TrackingWorkspaceType;
  workspace_role?: TrackingWorkspaceRole;
  workspace_lifecycle?: string;
  billing_state?: string;
  plan_bucket?: 'free' | 'paid' | 'unknown';
  provider_mode?: string;
  seat_state?: 'available' | 'full' | 'unknown';
  /** Associates the event to the PostHog workspace group. */
  $groups?: { workspace: string };
}

export interface EntryNavigationClickProps extends TrackingWorkspaceDimensions {
  page_name: TrackingWorkspacePage;
  area: 'entry_nav';
  element:
    | 'nav_item'
    | 'search'
    | 'account_menu_trigger'
    | 'workspace_switcher_trigger'
    | 'invite_teammates'
    | 'create_team'
    | 'workspace_settings';
  target?: TrackingWorkspacePage | 'search' | 'account_menu' | 'workspace_switcher';
  entry_from?: 'sidebar' | 'workspace_switcher';
}

export interface AccountMenuClickProps extends TrackingWorkspaceDimensions {
  page_name: TrackingWorkspacePage;
  area: 'account_menu';
  element:
    | 'upgrade'
    | 'credits'
    | 'settings'
    | 'message_center'
    | 'github_help'
    | 'feature_request'
    | 'github'
    | 'discord'
    // Chinese locales swap the Discord link for the Feishu group invite; the
    // slot is the same social entry, so it stays in this union.
    | 'feishu'
    | 'twitter'
    | 'email'
    | 'logout';
  is_free_active?: boolean;
}

export interface WorkspaceSwitcherClickProps extends TrackingWorkspaceDimensions {
  page_name: TrackingWorkspacePage;
  area: 'workspace_switcher';
  element: 'workspace_option' | 'invite_teammates' | 'create_team';
  target_workspace_type?: TrackingWorkspaceType;
  is_current_workspace?: boolean;
}

export interface WorkspaceInviteClickProps extends TrackingWorkspaceDimensions {
  page_name: 'home' | 'all_projects';
  area: 'workspace_invite_dialog';
  element:
    | 'submit'
    | 'add_recipient_row'
    | 'remove_recipient_row'
    | 'role_select'
    | 'upgrade'
    | 'close';
  entry_from: 'workspace_switcher' | 'all_projects';
  invite_count_bucket?: TrackingCountBucket;
}

export type TrackingProjectCollectionPage = 'home' | 'drafts' | 'all_projects';
export type TrackingCountBucket = '0' | '1' | '2_5' | '6_10' | '11_plus';
export type TrackingProjectRelation = 'self' | 'other' | 'unknown';

export interface ProjectCollectionClickProps extends TrackingWorkspaceDimensions {
  page_name: TrackingProjectCollectionPage;
  area: 'project_collection';
  element:
    | 'project_open'
    | 'more_menu'
    | 'rename'
    | 'duplicate'
    | 'move_to_team'
    | 'move_to_personal'
    | 'delete'
    | 'multi_select_toggle'
    | 'bulk_move_to_team'
    | 'bulk_move_to_personal'
    | 'bulk_delete'
    | 'filter'
    | 'sort'
    | 'view_toggle'
    | 'invite_teammates';
  project_key?: string;
  project_relation?: TrackingProjectRelation;
  selection_count_bucket?: TrackingCountBucket;
  filter_type?: 'owner' | 'project_type';
  filter_value?: string;
  sort_value?: 'updated_desc' | 'updated_asc' | 'name_asc';
  view_value?: 'grid' | 'list';
}

export interface CommunityTemplateClickProps extends TrackingWorkspaceDimensions {
  page_name: 'community';
  area: 'community_templates';
  element: 'template_detail' | 'copy_prompt' | 'remix' | 'use_prompt' | 'filter';
  template_key?: string;
  template_type?: string;
  resource_scope?: TrackingWorkspaceScope;
  filter_type?: 'category' | 'subtype';
  filter_value?: string;
}

export interface ExtensionMarketplaceClickProps extends TrackingWorkspaceDimensions {
  page_name: 'plugins';
  area: 'extension_marketplace';
  element: 'details' | 'use' | 'add' | 'create' | 'filter';
  extension_key?: string;
  extension_kind: 'expert_plugin' | 'skill';
  resource_scope: TrackingWorkspaceScope;
}

export interface WorkspaceSurfaceViewProps extends TrackingWorkspaceDimensions {
  page_name: TrackingWorkspacePage;
  area: 'account_menu' | 'workspace_switcher' | 'workspace_invite_dialog';
  entry_from?: 'workspace_switcher' | 'all_projects';
}

export interface WorkspaceSwitchResultProps extends TrackingWorkspaceDimensions {
  page_name: TrackingWorkspacePage;
  area: 'workspace_switcher';
  result: 'success' | 'failed';
  target_workspace_type?: TrackingWorkspaceType;
  duration_ms: number;
  error_code?: string;
}

export interface WorkspaceInviteResultProps extends TrackingWorkspaceDimensions {
  page_name: 'home' | 'all_projects';
  area: 'workspace_invite_dialog';
  entry_from: 'workspace_switcher' | 'all_projects';
  result: 'success' | 'partial_success' | 'failed';
  requested_count: number;
  succeeded_count: number;
  failed_count: number;
  duration_ms: number;
  error_code?: string;
}

export interface WorkspaceProjectActionResultProps extends TrackingWorkspaceDimensions {
  page_name: TrackingProjectCollectionPage;
  area: 'project_collection';
  action:
    | 'duplicate'
    | 'move_to_team'
    | 'move_to_personal'
    | 'delete'
    | 'bulk_move_to_team'
    | 'bulk_move_to_personal'
    | 'bulk_delete';
  result: 'success' | 'partial_success' | 'failed';
  requested_count: number;
  succeeded_count: number;
  failed_count: number;
  duration_ms: number;
  error_code?: string;
}

export interface WorkspaceSharedProjectOpenResultProps extends TrackingWorkspaceDimensions {
  page_name: 'all_projects' | 'drafts' | 'home';
  area: 'project_collection';
  result: 'success' | 'failed';
  project_relation: TrackingProjectRelation;
  materialization: 'warm' | 'required' | 'unknown';
  duration_ms: number;
  error_code?: string;
}

export interface WorkspaceResourceActionResultProps extends TrackingWorkspaceDimensions {
  page_name: 'design_systems' | 'plugins';
  area: 'workspace_resource';
  resource_kind: 'design_system' | 'expert_plugin' | 'skill';
  resource_scope: TrackingWorkspaceScope;
  action:
    | 'share_to_team'
    | 'sync_to_team'
    | 'remove_from_team'
    | 'download_plugin'
    | 'add';
  result: 'success' | 'failed';
  duration_ms: number;
  error_code?: string;
}

export interface ProjectCommentCreateResultProps extends TrackingWorkspaceDimensions {
  page_name: 'artifact';
  area: 'comments';
  result: 'success';
  target_project_relation: TrackingProjectRelation;
  comment_level: 'top_level' | 'reply';
}

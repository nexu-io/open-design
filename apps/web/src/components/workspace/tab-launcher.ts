import type { IconName } from '../Icon';
import type { Dict } from '../../i18n/types';

// ---------------------------------------------------------------------------
// Extensible workspace "+" launcher registry.
//
// The launcher dropdown anchored to the tab strip's "+" button is the single
// place where new *kinds* of working surfaces are created. Opening an existing
// file is built into the menu directly (it is the common case and needs the
// project file list), but every other "create a new tab" affordance —
// Side Chat (Stage 2), Terminal (Stage 3), and the external Browser worktree —
// registers exactly ONE LauncherAction here. Adding a tab kind is therefore a
// two-line change: register an action below, and add a render branch in the
// `.ws-body` switch of `FileWorkspace.tsx`.
//
// Keep this module tiny and dependency-light. It owns *what can be created*,
// not *how it is rendered* — the dropdown (`TabLauncherMenu.tsx`) renders the
// actions and the file results; `FileWorkspace.tsx` supplies the context.
// ---------------------------------------------------------------------------

/** Everything an action needs to spin up (and focus) a new workspace tab. */
export interface LauncherContext {
  /** The project the workspace is currently scoped to. */
  projectId: string;
  /**
   * Focus an already-open or freshly-created tab by id. Most "create new"
   * actions will create their backing resource first (a conversation, a PTY
   * session, …) and then call this with the resulting `chat:<id>` /
   * `terminal:<id>` tab id.
   */
  openTab: (tabId: string) => void;
  /**
   * Create a new conversation seeded with the current chat's context and
   * resolve its id. Backs the "New Side Chat" action. Returns null when the
   * daemon could not create the conversation (the action then no-ops).
   */
  createSideChat?: () => Promise<string | null>;
  /**
   * Spawn a new PTY session for the project and resolve its terminal id. Backs
   * the "New Terminal" action. Returns null when the daemon could not start the
   * session (e.g. node-pty not compiled), so the action no-ops.
   */
  createTerminal?: () => Promise<string | null>;
  /**
   * Open a new in-workspace Browser tab (DesignBrowserPanel). Backs the
   * "New Browser" action. Synchronous — the browser tab needs no daemon
   * round-trip — so it returns void and creates/focuses the tab itself.
   */
  createBrowser?: () => void;
}

export interface LauncherAction {
  /** Stable id, also used as the React key in the menu. */
  id: string;
  /** Icon shown to the left of the label; any name from the shared icon set. */
  iconName: IconName;
  /** i18n key for the action label (e.g. workspace.newTerminal). */
  labelKey: keyof Dict;
  /** Optional i18n key for a secondary description line. */
  descriptionKey?: keyof Dict;
  /** Invoked when the user picks the action; the menu closes afterwards. */
  run: (ctx: LauncherContext) => void;
}

/**
 * Build the list of "create new" actions for the current context.
 *
 * Each tab kind contributes exactly one action. Stage 2 adds "New Side Chat":
 * it spins up a context-seeded conversation and opens it as a `chat:<id>` tab.
 * Stage 3 adds "New Terminal": it spawns a PTY session and opens it as a
 * `terminal:<id>` tab. The Browser action mounts this branch's
 * DesignBrowserPanel as a `__browser__:<n>` tab the same way, gated on context.
 */
export function buildLauncherActions(ctx: LauncherContext): LauncherAction[] {
  const actions: LauncherAction[] = [];
  if (ctx.createSideChat) {
    actions.push({
      id: 'new-side-chat',
      iconName: 'comment',
      labelKey: 'workspace.newSideChat',
      descriptionKey: 'workspace.newSideChatDescription',
      run: (runCtx) => {
        void runCtx.createSideChat?.().then((conversationId) => {
          if (conversationId) runCtx.openTab(`chat:${conversationId}`);
        });
      },
    });
  }
  if (ctx.createTerminal) {
    actions.push({
      id: 'new-terminal',
      iconName: 'terminal',
      labelKey: 'workspace.newTerminal',
      descriptionKey: 'workspace.newTerminalDescription',
      run: (runCtx) => {
        void runCtx.createTerminal?.().then((terminalId) => {
          if (terminalId) runCtx.openTab(`terminal:${terminalId}`);
        });
      },
    });
  }
  if (ctx.createBrowser) {
    actions.push({
      id: 'new-browser',
      iconName: 'globe',
      labelKey: 'workspace.newBrowser',
      descriptionKey: 'workspace.newBrowserDescription',
      // Browser tabs open synchronously and focus themselves, so there is no
      // id to thread through openTab here.
      run: (runCtx) => {
        runCtx.createBrowser?.();
      },
    });
  }
  return actions;
}

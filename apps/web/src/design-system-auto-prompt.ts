export const DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX =
  'Create this project as a complete OpenDesign design system workspace.';

export function isDesignSystemWorkspacePrompt(content: string): boolean {
  return content.trimStart().startsWith(DESIGN_SYSTEM_WORKSPACE_PROMPT_PREFIX);
}

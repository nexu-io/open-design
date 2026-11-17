/** UI-only continuation: reopening the same panel never authorizes a publish. */
export interface ShareLoginReturn {
  projectId: string;
  filePath: string;
  expiresAt: number;
}

export function shareLoginReturnMatches(
  request: ShareLoginReturn,
  projectId: string,
  filePath: string,
): boolean {
  return request.projectId === projectId && request.filePath === filePath && Date.now() <= request.expiresAt;
}

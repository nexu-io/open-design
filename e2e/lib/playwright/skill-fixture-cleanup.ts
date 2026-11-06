interface CleanupResponse {
  ok(): boolean;
  status(): number;
  statusText(): string;
}

interface CleanupOptions {
  importCompleted: boolean;
  skillName: string;
}

export async function cleanupSkillFixture(
  deleteFixture: () => Promise<CleanupResponse>,
  options: CleanupOptions,
): Promise<void> {
  const response = await deleteFixture();
  if (response.ok()) return;
  if (!options.importCompleted && response.status() === 404) return;
  throw new Error(
    `Skill fixture cleanup failed for ${options.skillName}: ${response.status()} ${response.statusText()}`,
  );
}

export type GuardContext = {
  repoRoot: string;
};

export type GuardCheck = {
  name: string;
  run: (context: GuardContext) => boolean | Promise<boolean>;
};

export async function runGuardChecks(
  checks: readonly GuardCheck[],
  context: GuardContext,
): Promise<boolean> {
  const results: boolean[] = [];
  for (const check of checks) {
    try {
      results.push(await check.run(context));
    } catch (error) {
      console.error(`Guard check failed unexpectedly: ${check.name}`);
      console.error(error);
      results.push(false);
    }
  }
  return results.every(Boolean);
}

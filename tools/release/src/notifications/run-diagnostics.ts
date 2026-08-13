type GitHubJobStep = {
  conclusion?: unknown;
  name?: unknown;
};

type GitHubJob = {
  conclusion?: unknown;
  html_url?: unknown;
  name?: unknown;
  steps?: unknown;
};

export type ReleaseRunFailure = {
  job: string;
  step: string;
  url: string;
};

const FAILED_CONCLUSIONS = new Set([
  "action_required",
  "failure",
  "stale",
  "startup_failure",
  "timed_out",
]);

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function runId(runUrl: string): string | null {
  try {
    const match = new URL(runUrl).pathname.match(/\/actions\/runs\/(\d+)(?:\/|$)/u);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function failedStep(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const steps = value as GitHubJobStep[];
  return text(steps.find((step) => FAILED_CONCLUSIONS.has(text(step.conclusion)))?.name);
}

export async function loadReleaseRunFailures(input: {
  fetchImpl?: typeof fetch;
  repository: string;
  runUrl: string;
  token: string;
}): Promise<ReleaseRunFailure[]> {
  const id = runId(input.runUrl);
  if (id == null || input.repository.length === 0 || input.token.length === 0) return [];
  const response = await (input.fetchImpl ?? fetch)(
    `https://api.github.com/repos/${input.repository}/actions/runs/${id}/jobs?filter=latest&per_page=100`,
    {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${input.token}`,
        "user-agent": "open-design-release-notifier",
        "x-github-api-version": "2022-11-28",
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub Actions jobs HTTP ${response.status}`);
  const payload = await response.json() as { jobs?: unknown };
  if (!Array.isArray(payload.jobs)) throw new Error("GitHub Actions jobs response is invalid");
  return (payload.jobs as GitHubJob[])
    .filter((job) => FAILED_CONCLUSIONS.has(text(job.conclusion)))
    .slice(0, 3)
    .map((job) => ({
      job: text(job.name) || "未命名 job",
      step: failedStep(job.steps),
      url: text(job.html_url) || input.runUrl,
    }));
}

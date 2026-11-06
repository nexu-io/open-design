import { buildProjectApiPath } from "../../utils/projectRouting";
// ---------------------------------------------------------------------------
// How this project came to exist, and roughly what shape it is.
//
// A crash report says what broke. It does not say what the user was working ON,
// and "a project made by /slideshow with 14 compositions and 60 assets"
// reproduces a crash that "Cannot read properties of undefined" never will.
//
// Held at module scope on purpose: a crash unmounts the React tree, so anything
// living in component state is gone by the time the crash prompt renders. This
// survives, because it was captured when the project loaded.
//
// PRIVACY: counts, a skill slug, and booleans. No file names, no paths, no
// project title. The user consented to a comment, not to an inventory of their
// work.
// ---------------------------------------------------------------------------

import type { FeedbackContext } from "./feedbackTrigger";
import { isMediaFile } from "../../utils/mediaTypes";
import { studioApiFetch } from "../../utils/studioApiFetch";

/** Written by `hyperframes init`; absent in a hand-made or copied project. */
const CONFIG_FILE = "hyperframes.json";

/** Matches the CLI's own slug gate, so a hand-edited value cannot leak text. */
const SKILL_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let snapshot: FeedbackContext = {};

function countMedia(files: string[]): number {
  return files.filter(isMediaFile).length;
}

/**
 * Record what we can see from the project listing, then fill in the authoring
 * skill from `hyperframes.json` if the project has one. Failure is silent and
 * partial: a report with the counts but no skill still beats no report.
 */
export async function captureProjectProvenance(
  projectId: string,
  files: string[],
  compositions: string[],
): Promise<void> {
  const scaffolded = files.includes(CONFIG_FILE);
  snapshot = {
    // False means the project was copied, hand-written, or predates init.
    // Those reproduce differently from a scaffolded one, so the flag matters
    // even when the skill below is missing.
    project_scaffolded: scaffolded,
    project_composition_count: compositions.length,
    project_file_count: files.length,
    project_media_count: countMedia(files),
  };
  if (!scaffolded) return;

  try {
    const res = await studioApiFetch(
      buildProjectApiPath(projectId, `/files/${encodeURIComponent(CONFIG_FILE)}`),
    );
    if (!res.ok) return;
    // The route answers with an envelope, not the file: {filename, content,
    // version}. The config is the `content` string inside it.
    const envelope: unknown = await res.json();
    const raw = (envelope as { content?: unknown }).content;
    if (typeof raw !== "string") return;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return;
    const skill = (parsed as { authoringSkill?: unknown }).authoringSkill;
    // The workflow that built this project: which of the creation skills the
    // agent ran. This is the closest thing to "how was it made" we can get.
    if (typeof skill === "string" && SKILL_SLUG.test(skill)) {
      snapshot.project_authoring_skill = skill;
    }
  } catch {
    // Missing, unreadable or corrupt config: keep the counts, drop the skill.
  }
}

export function projectProvenance(): FeedbackContext {
  return snapshot;
}

/** Test seam. */
export function resetProjectProvenance(): void {
  snapshot = {};
}

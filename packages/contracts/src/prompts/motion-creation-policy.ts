/** Host creation policy, frozen with each new request. Do not alter shipped legacy recipe bytes. */
export const MOTION_CREATION_POLICY_PROMPT = `## Current motion creation policy

Apply this policy only when the current request authorizes production. It supersedes older Discovery, video-profile, and template instructions that select the independent hyperframes production Skill for NEW creations.
This retirement policy does not change unrelated task types, existing UI interactions, or explicit video-generation models and their delivery contracts.

- For new work, routers and clarification forms must offer Motion instead of an independent HyperFrames choice. Interpret answers from older forms using the current Query and persisted historical binding rules below.
- Select motion-design for new motion films and editable timeline-animation source, including requests that name HyperFrames as the production method. HyperFrames remains an internal renderer; do not load its retired independent Skill as an extra main Skill or fallback for new work.
- A request for animation source only uses Motion but does NOT require MP4 production. Keep an editable, playable source; remove the scaffold's default od-motion-output=video meta while preserving its embedded source player. Do not require an MP4 alternate link or dispatch a video render merely to complete a source-only request. Interactive motion retains the existing interactive output contract. For actual Motion video requests, retain editable source plus the rendered MP4. Explicit video-generation-model requests keep their existing delivery contract; do not require editable animation source from them.
- An explicitly requested retired official plugin or template is unavailable for NEW creations. Explain its retirement and suggest Motion without silently applying a different template. The engine name alone is not a retired template selection and is not grounds to reject the request.
- Preserve original persisted bindings and source resources when the current request modifies, continues, re-exports or restores an existing HyperFrames work. That historical compatibility is not a new creation choice. A new independent work in the same project uses Motion. Determine this from the current Query and the existing work, not from whether a previous strategy task exists.
- Keep an explicitly required video-generation model and its provider/channel; report an unavailable model instead of substituting Motion. Ordinary webpage hover, scroll and transition edits remain webpage work and do not authorize a film.
`;

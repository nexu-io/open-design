# Test Report

Date: 2026-07-01

## Scope

Validated the new `$chat-motion-overlay` skill across:

- transcript -> spec generation
- config validation
- bundle preparation
- preset avatar asset copying
- uploaded avatar asset copying
- generated bundle sanitization for uploaded avatar paths
- collision-proof uploaded avatar asset names
- group chat participant-level avatar assignment
- bubble-only right-side alignment
- participant side consistency validation
- Remotion template type safety
- representative still rendering
- documented question strategy for incomplete requests

## Matrix Result

- Total cases: 18
- Passed: 18
- Failed: 0

## Covered Cases

1. `default_wechat_phone_preset_hidden`
2. `plain_bubbles_no_frame_first_message`
3. `telegram_no_frame_always`
4. `messenger_phone_hidden`
5. `upload_phone_always`
6. `mixed_wechat_phone_first_message`
7. `json_spec_only`
8. `group_multi_participant_distinct_presets`
9. `invalid_upload_missing_side`
10. `invalid_mixed_without_upload`
11. `invalid_upload_missing_file`
12. `invalid_participant_side_conflict`
13. `upload_slug_collision_unique_assets`

14. `invalid_transcript_avatar_key`
15. `invalid_preset_mode_upload_path`
16. `config_preset_overrides_transcript_avatar_hint`
17. `invalid_force_dangerous_output_dir`
18. `invalid_bubble_only_phone_frame`

## Issues Found And Fixed

1. `chatSpec.ts` generated readonly arrays while template types expected mutable arrays.
   - Fix: changed template `ChatSpec` types to use `ReadonlyArray`.

2. Config validation for `avatarMode=upload` and `avatarMode=mixed` was too loose.
   - Fix: added explicit validation in `build_chat_overlay_spec.py`.
   - Update: `avatarMode=upload` now requires uploaded avatar paths on participant configs.

3. New skill needed bundled preset avatar assets available in generated Remotion bundles.
   - Fix: added avatar library copying in `prepare_chat_overlay_bundle.py`.

4. User-facing output choices were too technical.
   - Fix: replaced direct `output` selection with `deliveryFormat`, then mapped it internally to render targets and artifact modes.

5. Incomplete user requests needed a consistent clarification strategy.
   - Fix: added a documented question policy with defaults, question limits, and user-facing wording.

6. Missing uploaded avatar files could silently fall back to preset avatars during bundle preparation.
   - Fix: made `prepare_chat_overlay_bundle.py` fail fast when a configured upload path does not exist, and added bundle-stage coverage for that case.

7. Group chats needed participant-level avatars instead of only side-level avatars.
   - Fix: replaced side-level avatar assignment with participant-level preset and upload assignment support.

8. One speaker could be interpreted on both sides if the transcript conflicted.
   - Fix: added participant side consistency validation.

9. Distinct participant names could normalize to the same slug and overwrite uploaded avatar assets.
   - Fix: generated stable unique participant ids and added a collision test with two uploaded avatars.

10. Bubble-only overlays needed explicit right-side row alignment.
    - Fix: split row alignment from avatar/bubble ordering, and added a style assertion for the plain bubble case.

11. Transcript-provided avatar keys that are not in the preset library could silently fall back to a default avatar.
    - Fix: validate transcript avatar hints against `PRESET_KEYS` before storing the participant.

12. `avatarMode=preset` configs with a participant `uploadPath` could render uploaded files instead of preset avatars.
    - Fix: reject `uploadPath` when `avatarMode` is `preset`, only carry upload paths for `upload` and `mixed` modes.

13. Transcript avatar hints took precedence over explicit participant config presets, so config could not override transcript-derived or OCR-derived hints.
    - Fix: changed avatar selection order to config-first (`configured.get("preset") or message["avatar"] or auto...`), consistent with `references/input-format.md`.

14. `--force` could recursively delete arbitrary existing directories when `--output-dir` was mistyped.
    - Fix: reject dangerous targets up front, and only allow `--force` overwrites for previously generated bundle directories marked with `.chat-motion-overlay-bundle`.

15. A failed uploaded-avatar copy could leave a partial bundle behind with `src/chatSpec.ts` still containing local `uploadPath` values.
    - Fix: validate upload sources before copying, delay `chatSpec.ts` writing until sanitization succeeds, and remove the generated bundle if preparation fails mid-run.

16. The documented MOV/WebM export commands and shipped package scripts omitted `src/index.ts`, so Remotion would treat the composition id as the entry file.
    - Fix: update both package scripts and `references/output-modes.md` to use `remotion render src/index.ts ChatMotionOverlay ...`, and keep that path checked in the matrix.

17. `container=none` could still be combined with `deviceFrame=iphone-dynamic-island`, which let a 1080x1920 bubble-only scene render into the smaller phone viewport and clip right-side content.
    - Fix: reject that unsupported combination during config validation, and document it in the config schema, visual rules, and matrix.

18. Bubble wrapping logic introduced `useMemo` calls after a frame-based early return, which could change hook order when playback crossed a message `appearAt` frame.
    - Fix: replace those `useMemo` calls with plain local calculations, and extend render coverage to include frames on both sides of the first message boundary.

## Verification Notes

- Representative bundles were rendered to still images successfully.
- Invalid config cases failed with the expected validation errors.
- Invalid uploaded-avatar file paths failed during bundle preparation with a clear error.
- Generated `chatSpec.ts` bundles kept only participant `uploadAsset` entries and did not leak local `uploadPath` values.
- Uploaded avatar assets stayed unique when participant display names slugified to the same base id.
- Group chat participants resolved to distinct participant avatars instead of sharing side-level avatars.
- Bubble-only transparent overlays explicitly align right-side rows to the right edge.
- Side conflicts for a single participant failed with a clear validation error.
- Bundle type checking passed with `tsc --noEmit`.
- Config participant presets correctly override transcript avatar hints.
- Transcript avatar hints that are not valid preset keys fail with a clear validation error.
- `avatarMode=preset` configs that include `uploadPath` fail with a clear validation error.
- Dangerous `--force` output targets are rejected before any recursive deletion occurs.
- Failed uploaded-avatar copies do not leave a generated `chatSpec.ts` containing local upload paths.
- Shipped Remotion render scripts keep `src/index.ts` before the composition id.
- `container=none + deviceFrame=iphone-dynamic-island` fails with a clear validation error before any bundle or render step.
- Representative render coverage now crosses a message `appearAt` frame boundary instead of checking only a later still.

## References

- Test matrix: `references/test-matrix.md`
- Test runner: `scripts/run_test_matrix.py`

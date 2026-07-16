# Test Matrix

This matrix covers the configurable surface of `$chat-motion-overlay`.

## Goals

- Validate transcript to spec generation
- Validate bundle preparation and asset copying
- Validate template type safety
- Validate representative rendering for each major scene family
- Catch invalid config combinations early
- Validate group chats can assign avatars per participant instead of only per side
- Validate uploaded avatar asset names remain unique when participant slugs collide
- Validate bubble-only overlays keep right-side rows explicitly right-aligned
- Lock down the question strategy so incomplete requests are handled consistently
- Validate transcript avatar hints are checked against preset keys before use
- Validate `uploadPath` is rejected when `avatarMode` is `preset`
- Validate config participant presets override transcript avatar hints
- Validate `--force` rejects dangerous output directories instead of deleting them
- Reject the unsupported bubble-only plus phone-frame combination before rendering
- Validate rendered frames across a message `appearAt` boundary, not only a later still
## Covered Dimensions

- `container`: `none`, `wechat`, `telegram`, `messenger`
- `avatarMode`: `preset`, `upload`, `mixed`
- `deviceFrame`: `none`, `iphone-dynamic-island`
- `nicknameMode`: `hidden`, `first-message-only`, `always`
- `deliveryFormat`: `mov`, `webm`, `json`, `remotion`, `hyperframe`, `preview`

## Cases

1. `default_wechat_phone_preset_hidden`
   - Container: `wechat`
   - Avatar mode: `preset`
   - Device frame: `iphone-dynamic-island`
   - Nickname mode: `hidden`
   - Delivery: `MOV（透明背景，可直接导入剪映 / PR / FCP 叠加）`
   - Render frames: `14`, `15`, `120` to cross the first message `appearAt`

2. `plain_bubbles_no_frame_first_message`
   - Container: `none`
   - Avatar mode: `preset`
   - Device frame: `none`
   - Nickname mode: `first-message-only`
   - Delivery: `Remotion 工程（适合继续编辑和拼装）`

3. `telegram_no_frame_always`
   - Container: `telegram`
   - Avatar mode: `preset`
   - Device frame: `none`
   - Nickname mode: `always`
   - Delivery: `WebM（透明背景，适合网页 / 浏览器播放）`

4. `messenger_phone_hidden`
   - Container: `messenger`
   - Avatar mode: `preset`
   - Device frame: `iphone-dynamic-island`
   - Nickname mode: `hidden`
   - Delivery: `MOV（透明背景，可直接导入剪映 / PR / FCP 叠加）`

5. `upload_phone_always`
   - Container: `wechat`
   - Avatar mode: `upload`
   - Device frame: `iphone-dynamic-island`
   - Nickname mode: `always`
   - Delivery: `MOV（透明背景，可直接导入剪映 / PR / FCP 叠加）`

6. `mixed_wechat_phone_first_message`
   - Container: `wechat`
   - Avatar mode: `mixed`
   - Device frame: `iphone-dynamic-island`
   - Nickname mode: `first-message-only`
   - Delivery: `Hyperframe 工程（适合作为模块继续复用）`

7. `json_spec_only`
   - Container: `wechat`
   - Avatar mode: `preset`
   - Device frame: `iphone-dynamic-island`
   - Nickname mode: `hidden`
   - Delivery: `JSON 数据（适合程序处理 / 自定义渲染）`

8. `group_multi_participant_distinct_presets`
   - Container: `wechat`
   - Avatar mode: `preset`
   - Four speakers across left and right sides
   - Expected: each participant can resolve to a distinct avatar

9. `invalid_upload_missing_side`
   - Avatar mode: `upload`
   - Missing one upload path
   - Expected: fail with validation error

10. `invalid_mixed_without_upload`
   - Avatar mode: `mixed`
   - No upload path
   - Expected: fail with validation error

11. `invalid_upload_missing_file`
   - Avatar mode: `upload`
   - Upload path points to a missing file
   - Expected: bundle preparation fails fast with a clear missing-file error and leaves no generated `chatSpec.ts` leaking local upload paths

12. `invalid_participant_side_conflict`
   - One participant appears on both left and right sides
   - Expected: fail with validation error and ask for consistent participant side

13. `upload_slug_collision_unique_assets`
   - Avatar mode: `upload`
   - Two distinct speaker names normalize to the same slug
   - Expected: generated participant ids and copied upload assets remain unique


14. `invalid_transcript_avatar_key`
   - Transcript line includes a non-preset avatar key
   - Expected: fail with validation error instead of silently falling back to a preset avatar

15. `invalid_preset_mode_upload_path`
   - Avatar mode: `preset` but a participant config carries `uploadPath`
   - Expected: fail with validation error

16. `config_preset_overrides_transcript_avatar_hint`
   - Config preset differs from transcript avatar hint for the same participant
   - Expected: generated spec uses the config preset, not the transcript hint

17. `invalid_force_dangerous_output_dir`
   - `--force` targets a dangerous existing directory such as the skill root
   - Expected: bundle preparation fails before any recursive deletion happens

18. `invalid_bubble_only_phone_frame`
   - Container: `none`
   - Device frame: `iphone-dynamic-island`
   - Expected: fail with a validation error instead of generating a clipped phone-frame scene

## Pass Criteria

- Valid cases generate JSON spec successfully
- Valid bundle cases prepare output bundle successfully
- Generated bundle sanitizes machine-local upload paths out of `src/chatSpec.ts`
- Generated bundle passes `tsc --noEmit`
- Representative valid cases render a still frame successfully
- Group chat cases assign avatars by participant, not only by left/right side
- Uploaded avatar assets remain collision-proof for participants with colliding slug bases
- Bubble-only overlays explicitly use right-side row alignment in the generated template
- Participant side conflicts fail instead of rendering one person on both sides
- Invalid cases fail with the expected validation error
- Invalid upload-path cases fail during bundle preparation instead of silently falling back to preset avatars

- Transcript-provided avatar keys that are not in the preset library fail with a clear validation error
- `avatarMode=preset` configs that include `uploadPath` fail with a clear validation error
- Config participant presets take precedence over transcript avatar hints when both are present
- `--force` rejects dangerous output directories before deleting anything
- Advertised Remotion render scripts keep `src/index.ts` before the composition id
- `container=none + deviceFrame=iphone-dynamic-island` fails with a clear validation error
- Representative render coverage crosses at least one message `appearAt` frame boundary
- Question policy is documented with defaults, triggers, and user-facing wording

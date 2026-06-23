# AMR Cloud Recovery is continuity, not billing ownership

Open Design treats AMR Cloud Recovery as continuity for an AMR Cloud run paused by billing readiness, while AMR Cloud remains the owner of payment and balance state. Automatic top-up can resume automatically; manual top-up resumes from Open Design by user action. If the local run can no longer be resumed, Open Design presents a restart path rather than treating the AMR payment operation as failed.

AMR Cloud Recovery is exposed as recovery state attached to the originating run or conversation, not as a new top-level run status or a global recovery center.

Open Design may register the AMR Cloud operation before the run starts so AMR Cloud can correlate billing and resume state, but the user-visible recovery state begins only when a balance-related pause occurs.

Pre-registered operations that end because of local runtime failures are closed as terminal operations without showing AMR Cloud Recovery to the user.

Automatic recovery is bounded: automatic top-up may resume a paused request, but repeated balance pauses or resume failures must surface a user-visible boundary instead of looping indefinitely.

Recovery state has two surfaces: a live overlay on run status for current observation and a persisted summary on the originating assistant message so the conversation can still present recovery or restart context after the live run expires.

Manual recovery should make clear that continuing the request may use AMR Cloud balance; automatic recovery does not require extra confirmation because it follows the user's automatic top-up mode.

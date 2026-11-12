# Crash and abnormal-exit attribution (OPEND-3716)

This additive definition accompanies `stability-metrics.md`. It implements local
observation, not product acceptance or an explanation of the reported historical
99.9% unknown / approximately 104,000 events across 12,000 installations. No
production data was queried for this change. Historical events are not relabeled.

## Exit classification

Existing `desktop_renderer_crash`, `desktop_child_process_crash`,
`desktop_unclean_exit`, `daemon_unclean_exit`, and `packaged_runtime_failed`
remain compatibility carriers. Native renderer `reason` and daemon `exit_class`
retain their meanings; `exit_reason` is additive where necessary. A new
`client_process_exit` event is a controlled projection through the shared
`buildClientTelemetryParams` / `parseClientMetricEvent` schema, using
`event_schema_version=4`, `metric_schema_version=1`.

| Normalized reason | Evidence and treatment |
| --- | --- |
| `crash` | Electron `crashed`/`abnormal-exit`, Node fatal report, or observed nonzero exit; not inferred from memory pressure |
| `oom` | Electron explicitly says OOM, or prior-session fatal report / bounded prior log contains OOM evidence |
| `killed` | A parent actually observes a termination signal (including SIGKILL/SIGTERM) during startup or after daemon ready; separate from OOM |
| `clean-exit` | Electron clean exit, observed zero daemon exit, completed graceful shutdown, or recorded OS shutdown/logoff/session end |
| `recovery-attempt` | Existing cooldown retry signal; excluded from crash counts |
| `unknown` | Missing completion marker without stronger evidence; includes silent force-kill/power loss, never automatically OOM |

An unfinished quit remains unknown: merely requesting quit is not proof of
successful teardown. Suspend alone is not proof of termination. Graceful daemon
shutdown (including updater sidecar retirement) still writes the clean marker;
a zero daemon exit that bypasses cleanup now produces a clean health summary instead
of `daemon_unclean_exit`. There is no attempt to infer a shutdown/update from a
missing marker. A SIGKILL cannot run a daemon exit listener. Packaged main now observes its
child after ready; without that parent evidence (for example, both processes
die), daemon restart still reports unknown.

The renderer breaker still parks after five deaths within 60 seconds. The
opening event carries `recovery_suppressed=true`; later repeated death reports
are suppressed. A quiet five-minute cooldown emits `reason=recovery-attempt`
before one reload. Killed renderers can require recovery without counting as
crashes. Clean exits do not feed the breaker. These flags do not estimate how
many suppressed crashes occurred.

## Replay, lifecycle and attribution

Desktop markers now retain the original launch attempt, session, active payload
version, observed main exit code (when available), and last observation time.
The main exit listener marks zero exits clean and preserves nonzero evidence;
silent native crashes or kills cannot run that listener. Main/renderer/child events use the same
launch IDs as startup metrics. Packaged main passes its original IDs in
`OD_APP_SESSION_ID` / `OD_LAUNCH_ATTEMPT_ID` to the daemon before spawning it;
these are observation context, not sidecar identity or user identity. The
telemetry route can bind the first valid desktop launch context in development.
A deferred headless window restore has no launch denominator and uses null.

Replay preserves `previous_app_version`, occurrence `app_version`,
`app_session_id`, and `launch_attempt_id`. The reporting version does not replace
the previous version, including when the latter is unknown (null). Channel is
derived from the occurrence version. Old markers have nullable association;
they cannot acquire the new launch's IDs or qualify for a linked crash rate.

A desktop missing-marker observation has no exact death timestamp. `occurred_at`
is the last recorded running observation (or legacy start), qualified by
`occurrence_time_source=last_checkpoint` (or `unknown`). Daemon checkpoint time
is similarly a last-known-alive bound; it can lag death by more than 60 seconds
when the process is blocked. `reported_at` is the upload time. Do not treat these
bounds as exact crash timestamps or use them unqualified for fine time cohorts.

Desktop replay IDs are stable hashes of original session IDs; queues deduplicate
sessions. Daemon replay retains the original boot insert ID and deduplicates
pending reports. The normalized projection uses the carrier ID plus `:exit`.
Successful local enqueue acknowledgements clear individual daemon pending
reports immediately; rejected sends remain pending. Remote delivery is best
effort, not exactly-once: interrupted acknowledgement can replay the same ID,
and backend queries must deduplicate `event_id` / `$insert_id`.

Only a checkpoint rotated from the current file is eligible for daemon replay.
When current is absent, an old previous file is not resurrected. This removes a
verified local path that could repeatedly report the same old unknown exit;
it does not prove how much of the historical production volume it explains.
Queues remain bounded to 20 desktop sessions and five daemon reports. Erased,
unwritable, or corrupt markers can lose evidence; there is no reconstructed rate.

## 本地服务内存终止的判定与证据链

| 分类 | 依据与限制 |
| --- | --- |
| `oom` | Node fatal report 的 `OOMError` / heap-out-of-memory 或同实例日志中的明确 V8 OOM 证据；RSS 高、堆比例高或 SIGKILL 本身均不足以判定 OOM |
| `killed` | 打包父进程在 daemon ready 后收到子进程退出信号，记录 `signal`、可空 `exit_code` 和父进程观测时刻；仅表示被信号终止，无法区分内存、用户结束或系统行为 |
| `unknown` | 前次运行未完成，且无父进程信号/退出码、fatal report 或明确 OOM 日志等更强证据；包括父进程也被结束、掉电、观测文件损坏或缺失 |

运行期上报使用安全通道的 `client_process_exit`，`process_role=daemon`，
`source_event=daemon_unclean_exit`。`occurred_at` 是父进程收到退出通知的时刻，
`occurrence_time_source=observed`，首次报告 `is_backfill=false`。非零退出码为
`crash`，零退出为 `clean-exit`；由本应用 Quit、更新替换或启动失败清理主动
请求的 daemon 停止（包括超时强制结束）归 `clean-exit`，不计入 killed。
没有收到退出通知时，单凭关闭意图不能证明进程已经退出。

父进程在 spawn 前创建随机 UUID，通过 `OD_DAEMON_PROCESS_INSTANCE_ID` 交给
该 daemon；它是观测关联字段，不改变 sidecar 的五字段身份协议。
该 UUID 同时作为 daemon boot ID、内存采样和退出事件的
`process_instance_id`。`app_session_id` / `launch_attempt_id` 沿用原启动上下文；
无真实启动上下文时保留 null，不借用下一次启动的 ID。
进程实例 ID 不包含 PID。内存采样追加可空 `heap_limit_bytes`（V8 的 JS 堆上限，
非 RSS 或操作系统内存额度）；不可获取、非有限值或非正上限用 null。
历史样本缺少此字段仍合法。原 `rss_bytes`、`heap_used_bytes` 保持不变。
真实 server session 入口在存在有效打包实例 ID 时自动绑定此采样上下文，
复用既有 60 秒 health 采样与安全 sink；不读取匿名指标开关。非打包启动仍可
通过显式采样 context 启用。

父进程只在收到死亡通知后，将受控观测写入由 daemon 数据根派生的 diagnostics
目录，随后尝试有时限的直接安全上报。成功 HTTP 回应会标记已送达；下次启动
按原进程实例匹配，跳过已送达报告，或将未送达的观测转入现有有界重放队列，
优先使用父进程证据而不降级为 unknown。重放的载体 insert ID 为
`<process_instance_id>-unclean-exit`，归一化事件始终使用该 ID 加 `:exit`，
与父进程首次报告一致。中断确认、同时启动或本地写失败仍可能重发/丢失；
网络交付并非 exactly-once，查询必须按 `(device_id, event_id)` / `$insert_id`
去重。同一死亡的载体与归一化事件不能相加。明确 fatal/log OOM 证据优先于
信号分类；父进程也检查同实例的这些证据，避免提前把 V8 OOM 固定为 killed。
若重放才发现更强 OOM 证据，仍复用原死亡 ID；补充证据是否被远端保留取决于
摄取端去重，不能据此保证分类已在远端更新。

推荐查询口径（仅取 `client_process_exit`，不与兼容载体混算）：

1. 按 `(device_id, event_id)` 去重，保留原死亡版本/会话/时间。若原始数据中
   同 ID 仍有多个版本，优先明确 OOM 证据，再取 observed，最后取 checkpoint；
   不把所有 replay 行都计作新死亡。
2. 对每个 `process_role=daemon` 且 reason 为 killed 或 unknown 的退出，以
   `(device_id, app_session_id, process_instance_id)` 关联
   `client_process_memory_sample`，限定同实例且 `sampled_at <= occurred_at`，
   取 `sampled_at` 最大的一条。禁止跨实例借用下一次启动或另一 daemon 的样本。
3. 输出 RSS（`rss_bytes`）、JS 堆使用（`heap_used_bytes`）、堆上限
   （`heap_limit_bytes`）、堆使用/堆上限比例，以及
   `occurred_at - sampled_at` 的时间间隔。上限缺失/为零、旧数据无实例 ID、
   无样本时返回 null 并单列缺失率，不补零、不推算系统内存不足。
4. 对 unknown 的 `last_checkpoint`，间隔只是最后存活观测与采样的差，
   不是精确死亡前时间。60 秒采样可能遗漏瞬时峰值，阻塞、短会话或离线也可能
   没有可用样本；RSS/堆比例只能作为证据，不能解释信号的来源。
5. **观测到的 OOM 为 0 时，须同时报告 unknown 占比**：同一时间、版本、平台
   及安全采集域内，去重后的 unknown daemon 退出数 / 全部 daemon 退出数
   （含 clean-exit），同时给出分子分母。另报 killed 占比、实例关联/采样覆盖率。
   旧版本缺少正常退出观测时应单列，不能把新旧采集覆盖差异当作改善，
   也不能用 OOM=0 宣称“系统因内存终止归零”。

## Denominators and safety delivery

Compute crash-session rate as distinct `(device_id, app_session_id)` with
normalized reason in `{crash, oom}` divided by distinct matching sessions with a
real `client_launch_attempt`, within the same version/channel/platform and
safety capture domain. A session with multiple renderer crashes contributes
once. Crash-attempt rate uses distinct `(device_id, launch_attempt_id)` over
real matching attempts instead. Startup failure rate joins failed
`client_launch_result` to attempts; `packaged_runtime_failed` is diagnostic
support and is not automatically a proven process crash.

Exclude clean exits, recovery attempts and killed events from the crash
numerator; publish unknown/killed separately. Missing identity, missing launch
association, legacy-only data, and a zero/missing denominator mean
**not calculable**. Never divide raw exit counts by installations or call that a
user rate. `device_id` is an installation, not an account or person. The legacy
synthetic packaged identity is null in the new metric and is ineligible.

稳定性埋点沿用安全通道，不受匿名指标开关控制（`telemetry.metrics`）。
This includes launch, memory, normalized exit events, legacy exit carriers and
`packaged_runtime_failed`. There is no desktop, ingestion, service or packaged
consent lookup for these events. Existing key/environment gates remain.
The new exit schema strips paths, URLs, content, prompts, raw PIDs and diagnostic
text. Existing scrubbed diagnostic payload fields retain their historical
compatibility semantics; this change adds none to the new metric.

## Memory P2 and overhead

`sampler.stop()` aborts in-flight HTTP and cancels remaining batch sends.
An already received event cannot be recalled. No consent fetch is needed.

Packaged main records Electron ready before sidecar boot and passes that
monotonic timestamp to desktop. First delay is `max(0, 30000 - elapsedSinceReady)`;
20 seconds of boot leaves 10 seconds, not 30. If registration occurs after the
30-second deadline, sample as soon as registered rather than fabricate a past
sample. Event-loop scheduling can delay actual collection. Subsequent cadence
remains 60 seconds, with no overlapping batches and at most 64 native entries.
Collection/transport CPU remains subject to the existing <1% budget; it has not
been reprofiled across native platforms in this task.

Exit processing adds one schema projection per accepted carrier, no polling.
Desktop HTTP remains bounded by five seconds. Packaged
legacy and normalized exit sends run together under their existing five-second
network cap, without adding a second sequential network wait. No startup success
path awaits telemetry delivery. Runtime daemon exit capture starts at the child
exit notification; managed shutdown flushes that same send with at most the
existing five-second network budget, with no polling or retry loop. Filesystem scheduling is outside network caps.

## Validation and remaining QA

Local tests inject real Node child zero/nonzero exit and SIGKILL/restart against
real checkpoint files; fixtures cover fatal OOM evidence, graceful shutdown,
stale-previous replay, failed acknowledgement, upgrades and null metadata.
Renderer handler tests exercise teardown, clean/killed/OOM/recovery reasons and
breaker suppression. HTTP/service tests check safety delivery after opt-out, projection and dedup IDs.
Packaged failure tests inject daemon/web startup failures and inspect captured
payloads; they do not launch a signed packaged application.

QA must run signed macOS and Windows candidates with isolated runtime data:

1. Opt in, launch cold/warm, record launch attempt/session/version. Inject a
   daemon startup failure and then a web startup failure using disposable
   candidates; verify one failed launch result per attempt and matching exit IDs.
2. Crash the main-window renderer (DevTools/native debug crash). Verify recovery,
   crash reason and shared IDs. Repeat five times within a minute: the fifth
   event is flagged suppressed, later deaths do not flood telemetry, and after
   five quiet minutes a recovery-attempt is excluded from the crash numerator.
3. Exit via Quit and updater restart; then log off/shut down the OS. Relaunch and
   verify expected shutdowns do not appear as crash/OOM. Force-kill main and
   daemon separately. Runtime daemon kills with a surviving parent must report
   killed once; without surviving parent evidence verify unknown. Relaunch and
   check original
   version/session/attempt, and stable replay ID when delivery was interrupted.
4. Upgrade between the killed session and restart. Confirm attribution remains
   on the killed version and legacy missing IDs remain null. Repeat with network
   disabled, reconnect/restart, and deduplicate by the original event ID.
5. Delay daemon/web boot by 20 seconds: observe first memory sample near ready+30
   seconds plus scheduling latency. Delay >30 seconds: sample promptly at sampler
   registration. Quit during held delivery and verify abort/no further sample.
6. Opt out, corrupt a previously saved config, and deny config reads separately.
   Repeat crash/restart and memory cases; verify safety events still report and
   normalized payloads contain no paths, URLs, content, prompts or raw PIDs.
   Confirm a product analytics event remains blocked.

7. macOS: launch a signed candidate, wait for ready and at least one daemon
   memory sample, then use Activity Monitor to Force Quit the daemon/local
   service child while leaving Open Design main alive. Verify one killed exit
   with signal, observed time and matching process/session/attempt IDs. Relaunch
   and confirm no second death; join the last memory sample including heap limit.
8. Windows: repeat with Task Manager → Details → End task on the local service
   process, leaving the app parent alive. Verify the native code/signal actually
   supplied by Node: a supplied signal means killed; a nonzero code without a
   signal means crash. Windows does not guarantee POSIX signal attribution.
   On both platforms repeat normal Quit and update replacement, including forced
   cleanup, and verify clean-exit rather than killed. Repeat offline then restart
   to verify original-ID replay and opt-out safety delivery.

Native main crashes, OS-specific shutdown/update behavior, real ingestion,
signed-platform QA, release, and seven-day before/after observation remain open.
The task does not establish that production crash rate or memory budget improved.

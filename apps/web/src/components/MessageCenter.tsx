import { Button } from '@open-design/components';
import { useCallback, useEffect, useId, useRef, useState, type RefObject , useSyncExternalStore} from 'react';
import { createPortal } from 'react-dom';

import { useI18n, type Locale } from '../i18n';
import { issueStatusObservation } from '../providers/status-observation';
import {
  clearAnonymousState,
  findGoPlanSunsetMessage,
  readAmrAuthMode,
  markAccountMessageRead,
  pullMessageCenter,
  readAnonymousMessages,
  readAnonymousReadIds,
  currentAnonymousWriteSeq,
  recordAnonymousRead,
  type MessageCenterMessage,
  writeAnonymousState,
} from '../message-center-client';
import {
  currentWorkspaceAccountGeneration,
  subscribeWorkspaceAccountGeneration,
} from '../collab/workspace-identity';
import { GoPlanSunsetDialog } from './GoPlanSunsetDialog';
import {
  adoptableSnapshot,
  issueSnapshotWriteToken,
  joinableSync,
  ownsLatestSnapshotWrite,
  publishInFlightSync,
  currentAuthModeEpoch,
  currentAuthoritativeLoggedIn,
  noteAuthoritativeAuthMode,
  subscribeAuthoritativeAuthMode,
  publishSnapshot,
  recordSnapshotRead,
  subscribeMessageCenterReads,
  retireInFlightSync,
  supersedeEarlierSnapshotWrites,
  type MessageCenterInFlightSync,
  type MessageCenterSnapshot,
} from './message-center-snapshot';
import { Icon } from './Icon';
import styles from './MessageCenter.module.css';

function unreadBadgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}

function formatPublishedDate(value: string, locale: Locale): string | null {
  const publishedAt = new Date(value);
  if (Number.isNaN(publishedAt.getTime())) return null;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(publishedAt);
}

interface Props {
  onOpenNotificationSettings?: () => void;
  /** Hide the built-in bell trigger — the host renders its own entry point
   *  (e.g. an account-menu row) and drives the panel via `open`/`onOpenChange`. */
  hideTrigger?: boolean;
  /** The still-mounted host control focus returns to when the panel closes.
   *  Required alongside `hideTrigger`: the built-in bell is what focus would
   *  otherwise return to, and a host that hides it owns that duty instead. */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Controlled open state; pair with `onOpenChange` when `hideTrigger` is set. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Streams the unread count so hosts can render their own badge (e.g. the
   *  rail avatar's red dot). */
  onUnreadCountChange?: (count: number) => void;
  /** Whether the Home shell currently grants the targeted announcement its
   *  modal slot. Detection still runs while false, so the notice can wait
   *  behind higher-priority business dialogs or a non-Home route. */
  priorityAnnouncementActive?: boolean;
  onPriorityAnnouncementPendingChange?: (pending: boolean) => void;
  priorityAnnouncementCurrentPlanId?: string | null;
  priorityAnnouncementMetricsConsent?: boolean;
}

type SyncState = 'loading' | 'ready' | 'error';

/**
 * The last successful sync, shared across mounts.
 *
 * `EntryNavRail` and `App` own two mutually-exclusive hosts for this panel —
 * the rail's cluster on the entry views, `WorkspaceTopRightAccountCluster` on a
 * project route — so every project↔home navigation unmounts one and mounts the
 * other. Without this, each of those remounts re-ran the whole sync:
 * `isAmrLoggedIn` plus a paginated `pullMessageCenter`, for a panel the user
 * has not opened and whose contents cannot have changed in the time it takes to
 * switch routes.
 *
 * Only the MOUNT sync consults this. The 60s interval, the visibility listener
 * and opening the panel all still fetch, so nothing that exists to observe a
 * change is weakened — the snapshot only answers "did we just fetch this?".
 *
 * Keyed on the account boundary: a sign-out/sign-in makes the previous
 * account's messages inadmissible no matter how recent they are.
 */
/** Stable identity for the empty view, so deriving it never churns children. */
const EMPTY_MESSAGES: MessageCenterMessage[] = [];

/**
 * Whether the authoritative answer moved while this run was awaiting.
 *
 * Every network answer here is authorised by the session that was valid when
 * the request went out, and a remote or expired session ends WITHOUT advancing
 * the workspace generation — so the generation checks that guard a workspace
 * switch cannot see it. A run that was overtaken must not touch host state,
 * shared state, or the read broadcast; refusing its snapshot afterwards cannot
 * take those writes back.
 *
 * Compared as an epoch rather than as "does my answer still match the current
 * one", because a run whose own answer is FRESHER than the last observation —
 * a mid-session login is the ordinary case — legitimately disagrees with it and
 * has to be allowed through.
 */
function overtakenByAuthorityChange(issuedAuthModeEpoch: number): boolean {
  return currentAuthModeEpoch() !== issuedAuthModeEpoch;
}

export function MessageCenter({
  onOpenNotificationSettings,
  hideTrigger = false,
  returnFocusRef,
  open: controlledOpen,
  onOpenChange,
  onUnreadCountChange,
  priorityAnnouncementActive = false,
  onPriorityAnnouncementPendingChange,
  priorityAnnouncementCurrentPlanId,
  priorityAnnouncementMetricsConsent = false,
}: Props) {
  const { locale, t } = useI18n();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const [openInternal, setOpenInternal] = useState(false);
  const open = controlledOpen ?? openInternal;
  const setOpen = useCallback(
    (next: boolean) => {
      setOpenInternal(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );
  const [messages, setMessages] = useState<MessageCenterMessage[]>([]);
  /**
   * The account the rows in `messages` were fetched for. Kept in state rather
   * than a ref because the answer is needed while RENDERING: clearing in an
   * effect happens after React has already committed, so the boundary render
   * still paints the previous account's rows and unread badge.
   */
  const [stateAccountGeneration, setStateAccountGeneration] = useState(
    currentWorkspaceAccountGeneration,
  );
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [loggedIn, setLoggedIn] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>('loading');
  const [priorityMessage, setPriorityMessage] = useState<MessageCenterMessage | null>(null);
  const loggedInRef = useRef(false);
  const messagesRef = useRef<MessageCenterMessage[]>([]);
  const readIdsRef = useRef<Set<string>>(new Set());
  const pendingReadIdsRef = useRef<Set<string>>(new Set());
  const syncRequestIdRef = useRef(0);
  // Reactive view of the account boundary. Capturing the generation inside
  // `sync` stops a stale RESPONSE from landing, but it cannot tell a host that
  // is already mounted that the account changed underneath it — the mount
  // effect's dependencies never mentioned the boundary, and
  // `notifyWorkspaceContextRefresh` retains the previous context while a
  // sign-in/sign-out resolves, so the host is not remounted either. The
  // previous account's rows and unread count simply stayed on screen until an
  // open, a visibility change, or the 60s poll happened along.
  const accountGeneration = useSyncExternalStore(
    subscribeWorkspaceAccountGeneration,
    currentWorkspaceAccountGeneration,
    currentWorkspaceAccountGeneration,
  );
  const seenAccountGenerationRef = useRef(accountGeneration);
  // Ending a session is the same kind of boundary as switching workspace, and
  // it needs the same treatment: a host that stays mounted across it must drop
  // what it fetched under the old authority instead of waiting for its next
  // scheduled sync.
  const authoritativeLoggedIn = useSyncExternalStore(
    subscribeAuthoritativeAuthMode,
    currentAuthoritativeLoggedIn,
    currentAuthoritativeLoggedIn,
  );
  const seenAuthoritativeRef = useRef(authoritativeLoggedIn);
  const priorityPendingCallbackRef = useRef(onPriorityAnnouncementPendingChange);
  priorityPendingCallbackRef.current = onPriorityAnnouncementPendingChange;

  // Fail closed DURING the boundary render, not after it. `useSyncExternalStore`
  // re-renders this component with the new generation while the state still
  // holds the previous account's rows; the effect that clears them runs only
  // once that render is committed. Deriving the view here means nothing from
  // the previous account is ever rendered for the new one, and the effect below
  // is left to do the refetch rather than the hiding.
  //
  // The Go Plan announcement is account-scoped too — it is picked out of the
  // signed-in pull — so it is derived the same way rather than being allowed to
  // stay on screen across a boundary.
  // Two boundaries, both render-time. The workspace generation moves on a
  // switch or a sign-in; a remote or expired session changes the AUTHORITY
  // without moving it, and `useSyncExternalStore` re-renders on that too — so
  // comparing the generation alone left one committed render still showing the
  // finished session's badge and announcement. `null` is "nothing observed
  // yet", which contradicts nothing.
  const rowsBelongToThisAccount = stateAccountGeneration === accountGeneration
    && (authoritativeLoggedIn === null || loggedIn === authoritativeLoggedIn);
  const visibleMessages = rowsBelongToThisAccount ? messages : EMPTY_MESSAGES;
  const visiblePriorityMessage = rowsBelongToThisAccount ? priorityMessage : null;

  const commitState = useCallback(
    (nextMessages: MessageCenterMessage[], nextReadIds: Set<string>, options?: { persistAnonymous?: boolean }) => {
      messagesRef.current = nextMessages;
      readIdsRef.current = nextReadIds;
      setMessages(nextMessages);
      setReadIds(nextReadIds);
      setStateAccountGeneration(currentWorkspaceAccountGeneration());
      if (options?.persistAnonymous) writeAnonymousState(window.localStorage, nextMessages, nextReadIds);
    },
    [],
  );

  const sync = useCallback(async () => {
    const requestId = syncRequestIdRef.current + 1;
    syncRequestIdRef.current = requestId;
    // Capture the account boundary the request is issued under. Reading it
    // again at completion would stamp a pre-boundary response with the new
    // account's generation, and a later mount would adopt the previous
    // account's messages as current.
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    const writeToken = issueSnapshotWriteToken();
    // Separate obligations, separate counters. The publication token orders
    // SNAPSHOT writes; the anonymous cache has its own writer sequence, because
    // the only thing that should stop this run from clearing that cache is a
    // newer ANONYMOUS write actually landing — not an unrelated sync moving the
    // publication token, which used to make both this run and the read decline
    // to clear and let a signed-out session survive the sign-in.
    const anonSeqAtStart = currentAnonymousWriteSeq();
    if (messagesRef.current.length === 0) setSyncState('loading');
    // Taken before the read goes out — which of two answers is newer is a
    // question about the requests, not about when they were consumed.
    const issuedStatusObservation = issueStatusObservation();
    let authMode = await readAmrAuthMode();
    let account = authMode === 'signed-in';
    // Before the writes, not after them. `account` describes the authority the
    // request was issued under; publishing it into component state once the
    // boundary has moved shows the previous account's signed-in state, and
    // nothing re-syncs on a generation change to correct it.
    if (currentWorkspaceAccountGeneration() !== issuedAccountGeneration) return;
    // The generation guard answers "is this still the right ACCOUNT"; it says
    // nothing about whether this run is still the right RUN. Refreshes overlap
    // routinely — open, visibility, the 60s interval, a remount joining and
    // then refreshing — so a held status answer can land after a newer run has
    // already captured the transition, and re-stamp the authority it moved on
    // from. The request-id check used to sit only after the pull, which is
    // after every mutation below.
    if (requestId !== syncRequestIdRef.current) return;
    const wasAccount = loggedInRef.current;
    // Publish only an ANSWER. `unavailable` is the daemon failing to ask, and
    // writing `false` for it spent the very transition marker the branch below
    // depends on: the outage set `loggedInRef` to false, so a genuine sign-out
    // arriving afterwards saw `wasAccount === false`, never ran the clear, and
    // let the signed-in overlay survive into the anonymous view. The last
    // authoritative mode is what carries across an outage.
    if (authMode !== 'unavailable') {
      // Recorded for every host, not just this one: snapshot admission needs the
      // latest authoritative answer, and a non-answer must not overwrite it.
      //
      // Ordered against the app's status reads as well as against this
      // component's own, because both publish here. If this read was overtaken
      // while it was on the wire it no longer describes the session, and the
      // rest of the run is working from it.
      // A refusal orders this answer; it does not say the answer was wrong.
      // Another host's read can be issued later and come back first with the
      // SAME mode, and abandoning the run there left a first mount with an
      // empty bell until the user opened the panel or the 60s poll came round —
      // `retrySync` sees a resolved promise, so nothing reports it or tries
      // again. Adopt what won instead: it is by definition the better answer,
      // and it costs no second request.
      if (!noteAuthoritativeAuthMode(account, issuedStatusObservation)) {
        account = currentAuthoritativeLoggedIn() ?? account;
        authMode = account ? 'signed-in' : 'signed-out';
      }
      loggedInRef.current = account;
      setLoggedIn(account);
    }
    // Captured AFTER this run's own note, so the run is never overtaken by
    // itself.
    const issuedAuthModeEpoch = currentAuthModeEpoch();
    // Only a real sign-out discards the signed-in overlay. `account` has
    // already collapsed `unavailable` into `false`, and taking this branch on
    // a 503 threw away `pendingReadIdsRef` — the optimistic reads the server
    // projection has not caught up on — so when the runtime came back before
    // the projection did, the badge returned for rows the user had read. The
    // public rows are still committed and shown; it is only the transition
    // that is withheld until someone actually answers.
    if (wasAccount && authMode === 'signed-out') {
      readIdsRef.current = new Set();
      pendingReadIdsRef.current = new Set();
      setPriorityMessage(null);
    }
    const pulled = await pullMessageCenter({ locale, loggedIn: account });
    if (requestId !== syncRequestIdRef.current) return;
    // Same rule again: `serverReadIds` below is the OLD authority's view of
    // what is read, and the filter it feeds mutates `pendingReadIdsRef`.
    if (currentWorkspaceAccountGeneration() !== issuedAccountGeneration) return;
    const serverReadIds = new Set(pulled.filter((message) => Boolean(message.readAt)).map((message) => message.id));
    if (account) {
      pendingReadIdsRef.current = new Set(
        [...pendingReadIdsRef.current].filter((messageId) => !serverReadIds.has(messageId)),
      );
    }
    const overlayReadIds = new Set([
      ...serverReadIds,
      ...(account ? pendingReadIdsRef.current : []),
      ...(!account ? readIdsRef.current : []),
    ]);
    const merged = pulled.map((message) => ({
      ...message,
      readAt: message.readAt ?? (overlayReadIds.has(message.id) ? new Date().toISOString() : null),
    }));
    // A sign-out/sign-in landed while this was in flight: the response
    // describes an authority that is no longer current, so it may neither be
    // committed nor published as a snapshot.
    if (currentWorkspaceAccountGeneration() !== issuedAccountGeneration) return;
    // Refs and React state are this host's own and its request id already
    // ordered them. The two SHARED sinks are the snapshot and the anonymous
    // localStorage cache, and both need the global ordering: an unmounted host
    // passes its own request id forever, so without this its stale rows
    // overwrite the cache a newer run just wrote, and a reload — or any
    // remount past the snapshot window — reads them back and resurrects
    // messages the user has already read.
    const ownsLatestWrite = ownsLatestSnapshotWrite(writeToken);
    // CLEARING is a write to that same shared cache, and the account boundary
    // does not cover it: `notifyWorkspaceContextRefresh` — the only thing that
    // advances the generation — runs on sign-IN (AmrLoginPill) and not on
    // sign-out (`handleActiveCloudSignOut`). So a run issued while signed in
    // resumes after a sign-out with its captured `account === true` still
    // looking current, and wipes the anonymous cache a newer signed-out run
    // has already written. For an anonymous reader those read ids exist
    // nowhere else, so the badges simply come back.
    // Ahead of the clear, not after it. This clear is a write to shared
    // storage, and a run that is about to be discarded must not make it: a
    // signed-in pull resuming after a remote sign-out erased the anonymous
    // messages and read ids and was only then thrown away, putting nothing
    // back. For an anonymous reader those read ids exist nowhere else.
    if (overtakenByAuthorityChange(issuedAuthModeEpoch)) return;
    if (account && currentAnonymousWriteSeq() === anonSeqAtStart) clearAnonymousState(window.localStorage);
    // Two more readings of the same collapsed boolean, found by walking the
    // rest of this function rather than waiting for them to be reported.
    //
    // Persisting on `unavailable` writes an overlay derived from the SIGNED-IN
    // session into the anonymous cache, which is the leak the clear above is
    // careful to avoid. And the announcement is picked out of a signed-in pull,
    // so blanking it during an outage makes a required notice vanish and
    // reappear — the regression fixed two rounds ago, by a different route.
    // Both wait for an answer; neither guesses from a non-answer.
    const authoritative = authMode !== 'unavailable';
    commitState(merged, overlayReadIds, {
      persistAnonymous: authMode === 'signed-out' && ownsLatestWrite,
    });
    if (authoritative) setPriorityMessage(account ? findGoPlanSunsetMessage(merged) : null);
    // `unavailable` is the daemon failing to ask, not an answer about the user,
    // and `readAmrAuthMode` is the only place that can still tell them apart —
    // by here it has already collapsed into `account === false`. Publishing a
    // snapshot on it would serve the PUBLIC feed to a signed-in reader for the
    // whole window, because a later mount adopts without re-asking. Committing
    // it to this host is still right: it is what we could actually load.
    if (ownsLatestWrite && authMode !== 'unavailable') {
      publishSnapshot({
        at: Date.now(),
        accountGeneration: issuedAccountGeneration,
        locale,
        loggedIn: account,
        messages: merged,
        readIds: overlayReadIds,
        pendingReadIds: new Set(pendingReadIdsRef.current),
      });
    }
    setSyncState('ready');
  }, [commitState, locale]);

  /**
   * Answers, and does not publish. It used to assign `loggedInRef` and call
   * `setLoggedIn` before returning, which put the write BEFORE the caller's
   * boundary check no matter where that check sat: a status request issued
   * under the old account could resolve after a sign-out, stamp `true`, and
   * only then be turned away. The next sync then read `wasAccount === true`,
   * took the signed-out transition, and cleared read ids the new account had
   * already recorded.
   */
  /**
   * Answers with the full three-valued mode, and does not publish.
   *
   * Returning a boolean here collapsed `unavailable` into `false`, so a
   * signed-in click during an outage took the ANONYMOUS write path: no account
   * POST, a write to the shared anonymous cache, and a snapshot delta recorded
   * as `account: false`. Publishing is still the caller's job, after its
   * boundary check.
   */
  const resolveAuthModeForWrite = useCallback(async () => readAmrAuthMode(), []);

  const retrySync = useCallback(() => {
    // Publish the run so a mount that lands mid-flight can wait for it instead
    // of starting a second identical sync. Keyed by the account boundary it was
    // started under, so a post-boundary mount never joins pre-boundary work.
    const generation = currentWorkspaceAccountGeneration();
    const entry: MessageCenterInFlightSync = {
      generation,
      locale,
      run: Promise.resolve(),
    };
    // `sync` claims its request id synchronously, before its first await, so
    // reading the ref straight after the call gives THIS run's id.
    const started = sync();
    const issuedRequestId = syncRequestIdRef.current;
    entry.run = started
      .catch(() => {
        // Only the run that is still this host's current request may report a
        // failure. An overlapping open/visibility retry — or a run issued under
        // a previous account — can reject after a newer one has already
        // succeeded, and painting the error banner then contradicts what is on
        // screen.
        if (issuedRequestId !== syncRequestIdRef.current) return;
        if (generation !== currentWorkspaceAccountGeneration()) return;
        setSyncState('error');
      })
      .finally(() => retireInFlightSync(entry));
    publishInFlightSync(entry);
    void entry.run;
  }, [sync]);

  const invalidateSyncResponses = useCallback(() => {
    syncRequestIdRef.current += 1;
  }, []);

  useEffect(() => {
    commitState(
      readAnonymousMessages(window.localStorage),
      readAnonymousReadIds(window.localStorage),
    );
  }, [commitState]);

  useEffect(() => {
    // A boundary crossed under a host that stayed mounted: drop the previous
    // account's rows before deciding anything, so they are never shown to
    // whoever signed in. Initialised to the current generation, so a first
    // mount does not wipe the anonymous state restored just above.
    // `null` means nothing authoritative has been observed yet, so the first
    // answer is not a boundary — treating it as one wiped the anonymous state
    // this host had just hydrated. Matches how the module decides the same
    // question.
    const authorityChanged = seenAuthoritativeRef.current !== null
      && seenAuthoritativeRef.current !== authoritativeLoggedIn;
    seenAuthoritativeRef.current = authoritativeLoggedIn;
    if (seenAccountGenerationRef.current !== accountGeneration || authorityChanged) {
      seenAccountGenerationRef.current = accountGeneration;
      messagesRef.current = [];
      readIdsRef.current = new Set();
      pendingReadIdsRef.current = new Set();
      setMessages([]);
      setReadIds(new Set());
      setPriorityMessage(null);
      setSyncState('loading');
    }
    // A remount that lands within the window adopts what the previous mount
    // already fetched; everything else below still goes to the network.
    let cancelled = false;
    const adopt = (snapshot: MessageCenterSnapshot) => {
      if (cancelled) return;
      loggedInRef.current = snapshot.loggedIn;
      setLoggedIn(snapshot.loggedIn);
      pendingReadIdsRef.current = new Set(snapshot.pendingReadIds);
      commitState(snapshot.messages, snapshot.readIds);
      // Derived here for the same reason `sync` derives it: the announcement is
      // a function of the rows and the signed-in state, both of which the
      // snapshot carries. Adopting the rows without it dropped the required
      // notice — and its `onPriorityAnnouncementPendingChange(true)` — for the
      // length of the window on every project<->home remount, which is also
      // long enough for a lower-priority campaign to take the screen instead.
      setPriorityMessage(snapshot.loggedIn ? findGoPlanSunsetMessage(snapshot.messages) : null);
      setSyncState('ready');
    };
    // A settled snapshot is shown FIRST when there is one, so a remount never
    // flashes empty — but it is not the end of the story. An in-flight run is
    // by definition fresher than the snapshot that preceded it, and nothing
    // pushes its result into a host that merely adopted: module state updates
    // and this component never hears about it, leaving it stale until an open,
    // a visibility change, or the 60s poll. So adopt AND then take that run's
    // result when it lands.
    const adopted = adoptableSnapshot(locale);
    if (adopted) adopt(adopted);
    const running = joinableSync(locale);
    if (running) {
      // Someone else's sync is already on the wire for this same data and the
      // same account; take its result rather than racing a second copy of it.
      if (!adopted && messagesRef.current.length === 0) setSyncState('loading');
      void running.run.then(() => {
        if (cancelled) return;
        const settled = adoptableSnapshot(locale);
        if (settled) adopt(settled);
        else if (!adopted) retrySync();
      });
    } else if (!adopted) {
      retrySync();
    }
    const interval = window.setInterval(retrySync, 60_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') retrySync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [retrySync, commitState, locale, accountGeneration, authoritativeLoggedIn]);

  // A read recorded by ANOTHER host — typically this host's predecessor,
  // finishing a write the user started just before navigating. Without this the
  // successor kept the row unread until some later refresh, which is the very
  // thing a remount is supposed to preserve.
  useEffect(() => subscribeMessageCenterReads((delta) => {
    // Account, yes; language, no. The id is the same row in either language, so
    // a host rendering en must still honour a read recorded under zh-CN.
    if (delta.accountGeneration !== currentWorkspaceAccountGeneration()) return;
    const rows = messagesRef.current;
    const target = rows.find((item) => item.id === delta.messageId);
    if (!target || target.readAt) return;
    if (delta.account) {
      pendingReadIdsRef.current = new Set(pendingReadIdsRef.current).add(delta.messageId);
    }
    const nextRows = rows.map((item) => (
      item.id === delta.messageId ? { ...item, readAt: item.readAt ?? delta.readAt } : item
    ));
    // Component state only: whoever recorded the delta already wrote both
    // shared sinks, and persisting again here would race their write.
    commitState(nextRows, new Set(readIdsRef.current).add(delta.messageId));
    // The announcement is derived state, like it is in `sync` and `adopt`, and
    // it is the fourth piece of read state this delta has to reach. Updating
    // the rows without it left a successor holding a modal for a notice the
    // predecessor's acknowledgement had already recorded, so the user had to
    // confirm the same thing twice. Deriving rather than comparing ids also
    // keeps a DIFFERENT unread targeted row on screen.
    if (loggedInRef.current) setPriorityMessage(findGoPlanSunsetMessage(nextRows));
  }), [commitState, locale]);

  useEffect(() => {
    if (open) retrySync();
  }, [open, retrySync]);

  const unreadCount = visibleMessages.filter((message) => !message.readAt).length;

  useEffect(() => {
    onUnreadCountChange?.(unreadCount);
  }, [unreadCount, onUnreadCountChange]);

  useEffect(() => {
    onPriorityAnnouncementPendingChange?.(visiblePriorityMessage != null);
  }, [onPriorityAnnouncementPendingChange, visiblePriorityMessage]);

  useEffect(() => () => {
    priorityPendingCallbackRef.current?.(false);
  }, []);

  /** The control keyboard focus must land on after the panel closes. Opening
   *  focuses the portaled dialog, so closing always unmounts the focused node —
   *  without a target here focus falls to the document and the user loses their
   *  place in the rail. The built-in bell owns it by default; under
   *  `hideTrigger` that button does not exist and the host's opener does. */
  const returnFocusTarget = (): HTMLElement | null =>
    triggerRef.current ?? returnFocusRef?.current ?? null;

  const closePanel = () => {
    setOpen(false);
    returnFocusTarget()?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus();
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) closePanel();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePanel();
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (priorityAnnouncementActive && visiblePriorityMessage != null && open) {
      setOpen(false);
    }
  }, [open, priorityAnnouncementActive, visiblePriorityMessage, setOpen]);

  const markRead = async (messageId: string, options?: { requireAccount?: boolean }) => {
    const message = messagesRef.current.find((item) => item.id === messageId);
    if (!message) {
      if (options?.requireAccount) throw new Error('Announcement message is no longer available');
      return;
    }
    if (message.readAt) {
      if (priorityMessage?.id === messageId) setPriorityMessage(null);
      return;
    }
    // Same rule as `sync`: capture the boundary this action began under. Two
    // awaits follow, and if a sign-out/sign-in lands across them this write
    // describes an account that is no longer current — it may not reach
    // component state, and it certainly may not stamp its rows over a snapshot
    // the new account has already published. Captured BEFORE the await, so the
    // announcement contract below still reports its own failure first.
    const issuedAccountGeneration = currentWorkspaceAccountGeneration();
    // The anonymous cache's own writer sequence, observed rather than claimed:
    // the question is "did a newer anonymous write land while this read was in
    // flight", and nothing about snapshot publication answers it.
    const anonSeqAtStart = currentAnonymousWriteSeq();
    // The write's own status read is a status read like any other: stamped
    // before it goes out, and published through the ordered authority so it is
    // refused if something newer answered first. Capturing the epoch AFTER this
    // await was too late — a sign-out observed while the read was on the wire
    // had already been counted by then, so the post-POST comparison saw no
    // change and let the write through for a session that had ended.
    const issuedStatusObservation = issueStatusObservation();
    const writeAuthMode = await resolveAuthModeForWrite();
    // `unavailable` is not an answer about the user, and every branch below
    // needs one: the account path would skip its POST, and the anonymous path
    // would write a signed-in user's read into shared anonymous state.
    //
    // How it declines depends on who asked. An ordinary row click is dropped —
    // a later click, once the runtime answers, records it properly. The
    // announcement path cannot be dropped silently: `GoPlanSunsetDialog` sets
    // `dismissing` before awaiting and reads a resolved promise as success, so
    // returning normally left the notice mounted with every control disabled
    // and no way back short of a remount. Its `catch` clears `dismissing` and
    // surfaces a retry, which is exactly the signal a non-answer should send.
    if (writeAuthMode === 'unavailable') {
      if (options?.requireAccount) {
        throw new Error('The AMR runtime is unavailable; the announcement could not be acknowledged');
      }
      return;
    }
    let account = writeAuthMode === 'signed-in';
    // Same adoption as `sync`, and here returning was actively harmful:
    // `GoPlanSunsetDialog` sets `dismissing` before awaiting and only clears it
    // if the promise REJECTS, so a silent success left the notice mounted with
    // every control disabled and no way back short of a remount. Adopting lets
    // the write finish when the winning answer agrees, and lets the
    // `requireAccount` contract below raise its own retryable error when it
    // does not.
    if (!noteAuthoritativeAuthMode(account, issuedStatusObservation)) {
      account = currentAuthoritativeLoggedIn() ?? account;
    }
    // Published only once the boundary is confirmed, below.
    if (options?.requireAccount && !account) {
      throw new Error('A signed-in account is required to acknowledge this announcement');
    }
    if (currentWorkspaceAccountGeneration() !== issuedAccountGeneration) return;
    // Captured after this write's own publication, so the write is never
    // overtaken by itself, and before the POST it guards.
    const issuedAuthModeEpoch = currentAuthModeEpoch();
    const readAt = new Date().toISOString();
    if (account) await markAccountMessageRead(messageId);
    // Immediately after the await, before ANY mutation. Bailing out further
    // down was too late: `pendingReadIdsRef` had already taken the old
    // account's message id — which the next sync replays, marking a
    // same-id message read for whoever signed in — and the anonymous cache
    // had already been cleared on the way out of a signed-in session.
    if (currentWorkspaceAccountGeneration() !== issuedAccountGeneration) return;
    // Same rule, same reason: the POST was authorised by the session that was
    // valid when it went out. Without this, a read that crossed the end of a
    // session took `loggedInRef` back to signed-in, added pending read ids,
    // cleared the anonymous cache and broadcast an account-scoped delta that
    // another same-generation host consumes.
    if (overtakenByAuthorityChange(issuedAuthModeEpoch)) return;
    loggedInRef.current = account;
    setLoggedIn(account);
    const nextIds = new Set(readIdsRef.current).add(messageId);
    const nextMessages = messagesRef.current.map((item) => (item.id === messageId ? { ...item, readAt } : item));
    if (account) {
      pendingReadIdsRef.current = new Set(pendingReadIdsRef.current).add(messageId);
      // Same rule as `sync`: a POST that started while signed in can resolve
      // after a sign-out, and clearing then destroys read ids a signed-out run
      // has since persisted. The token claimed at entry loses to any sync
      // issued since, which is the run that knows better.
      if (currentAnonymousWriteSeq() === anonSeqAtStart) clearAnonymousState(window.localStorage);
    }
    invalidateSyncResponses();
    // Component state only — the durable anonymous cache is shared, so it takes
    // a delta below rather than this host's whole row set. Persisting the full
    // array here dropped a read a successor had already written while this
    // continuation was awaiting.
    commitState(nextMessages, nextIds);
    if (!account) recordAnonymousRead(window.localStorage, messageId, readAt);
    // A durable read outranks every pull issued before it, and the snapshot
    // patch itself is a delta — both live in `message-center-snapshot` because
    // both are shared across hosts, unlike everything committed above.
    supersedeEarlierSnapshotWrites();
    recordSnapshotRead({
      messageId,
      readAt,
      accountGeneration: issuedAccountGeneration,
      account,
    });
    if (priorityMessage?.id === messageId) setPriorityMessage(null);
  };

  const openLabel = unreadCount > 0 ? `${t('messageCenter.openAria')} (${t('messageCenter.unreadCount', { count: unreadCount })})` : t('messageCenter.openAria');

  return <div className={styles.root}>
    {hideTrigger ? null : <button ref={triggerRef} type="button" className={`settings-icon-btn od-tooltip ${styles.trigger}`} onClick={() => setOpen(!open)} title={t('messageCenter.openAria')} data-tooltip={t('messageCenter.openAria')} data-tooltip-placement="bottom" aria-label={openLabel} aria-haspopup="dialog" aria-expanded={open} data-testid="message-center-trigger">
      <Icon name="bell" size={17} />{unreadCount > 0 ? <span className={styles.badge} aria-hidden>{unreadBadgeLabel(unreadCount)}</span> : null}
    </button>}
    {open ? createPortal(<div className={styles.backdrop} data-testid="message-center-backdrop"><aside ref={panelRef} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid="message-center-dialog">
      <header className={styles.header}><div className={styles.headerCopy}><h2 id={titleId}>{t('messageCenter.title')}</h2><p>{t('messageCenter.subtitle')}</p></div><Button size="icon" className={styles.close} onClick={closePanel} aria-label={t('messageCenter.close')}><Icon name="close" size={18} strokeWidth={2}/></Button></header>
      <div className={styles.list} aria-live="polite">
        {syncState === 'error' && visibleMessages.length > 0 ? (
          <div className={styles.syncStatus} role="status">
            <span>{t('settings.updateStatusFailed')}</span>
            <button type="button" onClick={retrySync}>
              {t('settings.updateRetry')}
            </button>
          </div>
        ) : null}
        {syncState === 'loading' && visibleMessages.length === 0 ? (
          <div className={styles.empty} role="status">
            <Icon name="spinner" size={20} className="icon-spin" />
            <strong>{t('settings.updateStatusChecking')}</strong>
          </div>
        ) : syncState === 'error' && visibleMessages.length === 0 ? (
          <div className={styles.empty}>
            <Icon name="bell" size={20}/>
            <div className={styles.emptyError} role="status">
              <span>{t('settings.updateStatusFailed')}</span>
              <button type="button" onClick={retrySync}>
                {t('settings.updateRetry')}
              </button>
            </div>
          </div>
        ) : visibleMessages.length === 0 ? <div className={styles.empty}><Icon name="bell" size={20}/><strong>{t('messageCenter.emptyAllTitle')}</strong><p>{t('messageCenter.emptyBody')}</p></div> : visibleMessages.map((message) => <MessageItem key={message.id} locale={locale} message={message} onRead={markRead} onError={() => setSyncState('error')}/>)}
      </div>
      <footer className={styles.footer}><p>{t('messageCenter.desktopSettingsHint')}</p>{onOpenNotificationSettings ? <Button variant="ghost" onClick={() => { closePanel(); onOpenNotificationSettings(); }}>{t('messageCenter.desktopSettings')}</Button> : null}</footer>
    </aside></div>, document.body) : null}
    {visiblePriorityMessage != null ? (
      <GoPlanSunsetDialog
        active={priorityAnnouncementActive}
        currentPlanId={priorityAnnouncementCurrentPlanId ?? 'unknown'}
        metricsConsent={priorityAnnouncementMetricsConsent}
        onDismiss={async () => {
          await markRead(visiblePriorityMessage.id, { requireAccount: true });
        }}
      />
    ) : null}
  </div>;
}

function MessageItem({
  locale,
  message,
  onRead,
  onError,
}: {
  locale: Locale;
  message: MessageCenterMessage;
  onRead: (id: string) => Promise<void>;
  onError: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const formatted = formatPublishedDate(message.publishedAt, locale);
  const ctaUrl = safeExternalUrl(message.ctaUrl);
  return <article className={`${styles.item}${message.readAt ? '' : ` ${styles.itemUnread}`}${expanded ? ` ${styles.itemExpanded}` : ''}`}>
    <button type="button" className={styles.itemSummary} aria-expanded={expanded} onClick={() => { setExpanded((value) => !value); void onRead(message.id).catch(onError); }}><span className={styles.itemMeta}><span>{message.typeName}</span>{formatted ? <time dateTime={message.publishedAt}>{formatted}</time> : null}</span><strong>{message.title}</strong><span className={styles.bodyPreview}>{message.body}</span></button>
    {expanded && message.ctaLabel && ctaUrl ? <div className={styles.itemActions}><button type="button" className={styles.primaryAction} onClick={() => window.open(ctaUrl, '_blank', 'noopener,noreferrer')}>{message.ctaLabel}</button></div> : null}
  </article>;
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value, window.location.href);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

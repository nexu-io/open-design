/**
 * Issue order for AMR status reads.
 *
 * Several surfaces read the session status independently — the app-level effect
 * (initial, login-status event, focus, visibility), the entry shell's landing
 * read and its login poll, the settings card — and they answer in whatever
 * order the daemon manages. Only one of them may speak for the session at a
 * time: an older signed-in answer landing after a newer signed-out one used to
 * re-publish `signed-in` as authoritative, which re-authorises exactly the
 * message-centre pull the sign-out was meant to refuse.
 *
 * The order is taken where the request is ISSUED, not where the answer is
 * consumed, because "which answer is newer" is a question about the requests.
 * Stamping here rather than in each consumer is what keeps a future caller from
 * silently reintroducing the race: it only has to hand the status on, and it is
 * ordered by construction.
 *
 * A status that carries no stamp is treated as current. Nothing in the app
 * synthesises one today, and refusing an unstamped status would fail closed on
 * the wrong thing — a surface that never raced.
 */
const observationOrder = new WeakMap<object, number>();
let issued = 0;

export function issueStatusObservation(): number {
  issued += 1;
  return issued;
}

export function stampStatusObservation<T extends object>(status: T, order: number): T {
  observationOrder.set(status, order);
  return status;
}

export function statusObservationOrder(status: object): number | null {
  return observationOrder.get(status) ?? null;
}

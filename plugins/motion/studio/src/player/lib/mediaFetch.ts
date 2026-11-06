export type MediaReader = "probe" | "thumbnail";

const describe = (
  reader: MediaReader,
  status: number | null,
  code: string | null,
  retries: number,
) =>
  `${reader} range fetch failed: ${status === null ? `network ${code}` : `HTTP ${status}`} after ${retries} retries`;

/** A media range fetch that gave up: which reader, the HTTP status or network code, and the retries. Never the URL. */
export class MediaFetchError extends Error {
  override readonly name = "MediaFetchError";
  retries = 0;

  constructor(
    readonly reader: MediaReader,
    readonly status: number | null,
    readonly code: string | null,
    readonly start: number | null = null,
  ) {
    super(describe(reader, status, code, 0));
  }

  setRetries(retries: number): void {
    this.retries = retries;
    this.message = describe(this.reader, this.status, this.code, retries);
  }
}

const MAX_RETRIES = 2;
// Three silent waits plus the 0.5 s and 1 s retry delays (25.5 s) end inside thumbnailLoadTimeoutMs.
const SILENT_BODY_STALL_MS = 8_000;
// mediabunny cancels a `bytes=N-` read at its target, by when a local server has streamed megabytes past it.
const THUMBNAIL_RANGE_BYTES = 512 * 1024;
const POOLED_READER_CACHE_BYTES = 16 * 1024 * 1024;

const rangeStart = (init: RequestInit | undefined, closed: boolean) =>
  (closed ? /^bytes=(\d+)-\d*$/ : /^bytes=(\d+)-$/).exec(
    new Headers(init?.headers).get("Range") ?? "",
  )?.[1];

function boundedRange(init: RequestInit | undefined): RequestInit | undefined {
  const start = rangeStart(init, false);
  if (start === undefined) return init;
  const headers = new Headers(init?.headers);
  headers.set("Range", `bytes=${start}-${Number(start) + THUMBNAIL_RANGE_BYTES - 1}`);
  return { ...init, headers };
}

/** Without a readable Content-Range (hidden cross-origin unless exposed) mediabunny sizes the file from this answer. */
function rangesReadable(init: RequestInit | undefined, response: Response): boolean {
  const asked = rangeStart(init, true);
  const shown = /^bytes (\d+)-\d+\/\d+$/.exec(response.headers.get("Content-Range") ?? "")?.[1];
  return response.status === 206 && asked !== undefined && shown === asked;
}

const isAbort = (error: unknown) => (error as { name?: unknown } | null)?.name === "AbortError";

function networkCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  if (typeof cause?.code === "string") return cause.code;
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === "string" ? name : "unknown";
}

const typedFailure = (reader: MediaReader, error: unknown, start: number) =>
  isAbort(error) ? error : new MediaFetchError(reader, null, networkCode(error), start);

/**
 * A stalled body ignores every signal, so a silent one is aborted. The wait for the answer is not
 * timed: it includes Chrome's queue for a connection, which streaming previews can hold for long.
 */
type CleanEnd = { ended: (start: number) => void; atTarget: AbortSignal | null | undefined };

function watchedRequest(reader: MediaReader, parents: readonly AbortSignal[], end?: CleanEnd) {
  const controller = new AbortController();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unlinks = parents.map((parent) => {
    const follow = () => controller.abort(parent.reason);
    parent.addEventListener("abort", follow, { once: true });
    return () => parent.removeEventListener("abort", follow);
  });
  const done = () => {
    clearTimeout(timer);
    for (const unlink of unlinks.splice(0)) unlink();
  };
  controller.signal.addEventListener("abort", done, { once: true });
  for (const parent of parents) if (parent.aborted) controller.abort(parent.reason);
  const wait = <T>(pending: Promise<T>): Promise<T> => {
    if (reader !== "thumbnail") return pending;
    return new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        stalled = true;
        const reason = new DOMException(`No bytes for ${SILENT_BODY_STALL_MS} ms`, "TimeoutError");
        reject(reason);
        controller.abort(reason);
      }, SILENT_BODY_STALL_MS);
      void pending.then(resolve, reject).finally(() => clearTimeout(timer));
    });
  };
  const failure = (error: unknown, start: number) =>
    stalled
      ? new MediaFetchError(reader, null, "stalled", start)
      : typedFailure(reader, error, start);
  return { signal: controller.signal, wait, done, failure, end };
}

type WatchedRequest = ReturnType<typeof watchedRequest>;

/** The body, failing a broken read with a MediaFetchError: mediabunny rethrows a body error as-is. */
function typedBody(
  body: ReadableStream<Uint8Array>,
  start: number,
  request: WatchedRequest,
): ReadableStream<Uint8Array> {
  const source = body.getReader();
  const stopped = () => request.end?.atTarget?.aborted && request.end.ended(start);
  request.signal.addEventListener("abort", stopped, { once: true });
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await request.wait(source.read());
        if (!done) return controller.enqueue(value);
        request.done();
        request.end?.ended(start);
        controller.close();
      } catch (error) {
        request.done();
        controller.error(request.failure(error, start));
      }
    },
    cancel: (reason) => {
      request.done();
      return source.cancel(reason);
    },
  });
}

async function typedFetch(
  reader: MediaReader,
  input: RequestInfo | URL,
  sent: RequestInit,
  asked: number,
  request: WatchedRequest,
): Promise<Response> {
  let response: Response;
  try {
    // oxlint-disable-next-line no-restricted-globals -- a media read, on the media's sockets like mediabunny's own
    response = await fetch(input, { ...sent, signal: request.signal });
  } catch (error) {
    request.done();
    throw request.failure(error, asked);
  }
  if (response.ok) return response;
  request.done();
  throw new MediaFetchError(reader, response.status, null, asked);
}

function typedResponse(response: Response, asked: number, request: WatchedRequest): Response {
  if (!response.body) {
    request.done();
    return response;
  }
  const { status, statusText, headers } = response;
  const body = typedBody(response.body, status === 206 ? asked : 0, request);
  return new Response(body, { status, statusText, headers });
}

/**
 * Options for a mediabunny `UrlSource`. Its default retries a same-origin network failure
 * forever and logs a bare `TypeError` each time; these retry twice and fail with a MediaFetchError.
 */
export function mediaUrlSourceOptions(reader: MediaReader) {
  // Per start byte: a resume asks for a new start, while asking for one again uses its budget up.
  const failuresByStart = new Map<number | null, number>();
  const inFlightReads = new AbortController();
  let ranges: "unknown" | "readable" | "hidden" = reader === "thumbnail" ? "unknown" : "hidden";
  let etag: string | undefined;
  const noteEtag = (response: Response) =>
    void (etag ??= response.headers.get("ETag") ?? undefined);
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const sent = ranges === "readable" ? boundedRange(init) : init;
    const asked = Number(rangeStart(sent, true) ?? 0);
    const request = watchedRequest(
      reader,
      init?.signal ? [inFlightReads.signal, init.signal] : [inFlightReads.signal],
      { ended: (start) => failuresByStart.delete(start), atTarget: init?.signal },
    );
    const response = await typedFetch(reader, input, sent ?? {}, asked, request);
    if (ranges !== "hidden") ranges = rangesReadable(sent, response) ? "readable" : "hidden";
    noteEtag(response);
    return typedResponse(response, asked, request);
  };
  const getRetryDelay = (_previousAttempts: number, error: unknown): number | null => {
    const start = error instanceof MediaFetchError ? error.start : null;
    const failed = failuresByStart.get(start) ?? 0;
    const clientError =
      error instanceof MediaFetchError && error.status !== null && error.status < 500;
    if (error instanceof MediaFetchError) error.setRetries(failed);
    if (clientError || failed >= MAX_RETRIES) return null;
    failuresByStart.set(start, failed + 1);
    return 0.5 * (failed + 1);
  };
  const cancelReads = () =>
    inFlightReads.abort(new DOMException("Media reads cancelled", "AbortError"));
  const etagOf = () => etag;
  if (reader === "probe") return { fetchFn, getRetryDelay, cancelReads, etagOf };
  return { fetchFn, getRetryDelay, cancelReads, etagOf, maxCacheSize: POOLED_READER_CACHE_BYTES };
}

export function reportMediaFetchFailure(error: unknown): void {
  if (!(error instanceof MediaFetchError)) return;
  console.warn(`[Studio] ${error.message}`);
}

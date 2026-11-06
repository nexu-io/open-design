import type { DomEditSelection } from "../components/editor/domEditingTypes";

export { PROPERTY_DEFAULTS } from "./gsapShared";
import { idSelector, matchesExactlyOne } from "./gsapShared";

/**
 * The selector for a NEW tween; a shared-class selector would hit every sibling, so an
 * element without a unique one gets an `autoId` proposal the server makes unique (`ensure-id`).
 */
export function ensureElementAddressable(selection: DomEditSelection): {
  selector: string;
  autoId?: string;
} {
  if (selection.id) return { selector: idSelector(selection.id) };

  const el = selection.element;
  const doc = el.ownerDocument;
  if (selection.selector && matchesExactlyOne(doc, selection.selector, el)) {
    return { selector: selection.selector };
  }

  const tag = el.tagName.toLowerCase();
  let id = tag;
  let n = 1;
  while (doc.getElementById(id)) {
    n += 1;
    id = `${tag}-${n}`;
  }
  return { selector: idSelector(id), autoId: id };
}

export class GsapMutationHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: unknown,
  ) {
    super(formatGsapMutationHttpErrorMessage(statusCode, responseBody));
    this.name = "GsapMutationHttpError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function formatFieldsSuffix(rawFields: unknown): string {
  const fields = Array.isArray(rawFields)
    ? rawFields.filter((f): f is string => typeof f === "string")
    : [];
  return fields.length > 0 ? ` (${fields.join(", ")})` : "";
}

export async function readJsonResponseBody(res: Response): Promise<unknown> {
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return await res.text().catch(() => null);
  }
  return await res.json().catch(() => null);
}

function formatGsapMutationHttpErrorMessage(statusCode: number, body: unknown): string {
  if (isRecord(body) && typeof body.error === "string") {
    return body.error;
  }
  return `GSAP mutation failed with status ${statusCode}`;
}

export function formatGsapMutationRejectionToast(error: GsapMutationHttpError): string {
  const body = error.responseBody;
  if (isRecord(body)) {
    return `Couldn't save animation: ${formatGsapMutationHttpErrorMessage(
      error.statusCode,
      body,
    )}${formatFieldsSuffix(body.fields)}`;
  }
  return `Couldn't save animation: ${error.message}`;
}

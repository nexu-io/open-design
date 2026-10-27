import { openExternalUrl } from "../providers/registry";
import type { TouchpointStaticAction } from "./touchpoint-static-actions";

type NavigationTarget = Readonly<{ kind: "https" | "internal"; href: string }>;

/** Internal navigation must remain on the host origin after browser normalization. */
export function internalActionNavigationUrl(
	path: unknown,
	href = window.location.href,
): URL | null {
	if (typeof path !== "string" || !/^\/(?!\/)/u.test(path)) return null;
	try {
		const target = new URL(path, href);
		return target.origin === new URL(href).origin &&
			!target.username &&
			!target.password
			? target
			: null;
	} catch {
		return null;
	}
}

/** Only an unambiguous registered ID may resolve to a safe host-owned target. */
export function resolveCampaignTarget(
	actions: readonly TouchpointStaticAction[],
	id: string,
): NavigationTarget | null {
	const matches = actions.filter((action) => action.id === id);
	if (matches.length !== 1) return null;
	const target = matches[0]!.target;
	try {
		if (target.kind === "https") {
			const url = new URL(target.url);
			return url.protocol === "https:" && !url.username && !url.password
				? { kind: "https", href: target.url }
				: null;
		}
		if (target.kind === "internal") {
			const url = internalActionNavigationUrl(target.path);
			return url ? { kind: "internal", href: url.href } : null;
		}
	} catch {
		/* Malformed targets never reach the host. */
	}
	return null;
}

/** Delivery mode and telemetry do not select a different navigation implementation. */
export async function navigateCampaignTarget(
	target: NavigationTarget,
): Promise<boolean> {
  if (target.kind === "https") {
    try { return await openExternalUrl(target.href); } catch { return false; }
  }
	window.location.assign(target.href);
	return true;
}

/** The component SDK uses rejected promises for actionable failures, not boolean results. */
export function requireCampaignAction(accepted: boolean): void {
	if (!accepted) throw new Error("touchpoint_action_denied");
}

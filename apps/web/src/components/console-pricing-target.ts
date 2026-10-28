import type { CmsPrimaryCapture } from "../analytics/cms-touchpoints";
import { amrPlansUrlForProfile } from "../runtime/amr-guidance";
import { loadConfig } from "../state/config";
import { getResolvedDeviceId } from "../analytics/client";
import { amrHandoffDeviceId, attributedAmrUrl, recordAmrEntry } from "../analytics/amr-attribution";

export type ConsolePricingTargetOptions = Readonly<{
	profile?: string | null;
	metricsConsent?: boolean;
	installationId?: string | null;
	resolvedDeviceId?: string | null;
	cmsCapture?: CmsPrimaryCapture;
	track?: Parameters<typeof recordAmrEntry>[0];
}>;

/** Resolve only after action authorization. Pricing never selects a workspace or auto-recharge. */
export function resolveConsolePricingTarget(options: ConsolePricingTargetOptions = {}): string {
	const config = loadConfig();
	const metricsConsent = options.metricsConsent ?? config.telemetry?.metrics === true;
	const attribution = recordAmrEntry(options.track ?? (() => undefined), "cms_campaign_primary_cta", new Date(), { metricsConsent, cmsCapture: options.cmsCapture ?? null });
	const deviceId = amrHandoffDeviceId({
		metricsConsent,
		installationId: options.installationId === undefined ? config.installationId : options.installationId,
		resolvedDeviceId: options.resolvedDeviceId === undefined ? getResolvedDeviceId() : options.resolvedDeviceId,
	});
	return attributedAmrUrl(amrPlansUrlForProfile(options.profile === undefined ? config.agentCliEnv?.amr?.OPEN_DESIGN_AMR_PROFILE : options.profile), attribution, deviceId);
}

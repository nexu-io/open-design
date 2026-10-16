import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CMS_HOST_RELEASE_INPUTS,
	cmsHostReleaseFingerprint,
} from "../../next.config";

const workspaceRoot = resolve(process.cwd(), "../..");
const readCmsHostReleaseInput = (
	file: (typeof CMS_HOST_RELEASE_INPUTS)[number],
) => readFileSync(resolve(workspaceRoot, file));

describe("CMS host release fingerprint", () => {
	it("is stable for identical host sources", () => {
		expect(cmsHostReleaseFingerprint(readCmsHostReleaseInput)).toBe(
			cmsHostReleaseFingerprint(readCmsHostReleaseInput),
		);
	});

	it.each(CMS_HOST_RELEASE_INPUTS)(
		"changes when host input %s changes",
		(changedFile) => {
			const baseline = cmsHostReleaseFingerprint(readCmsHostReleaseInput);
			const changedHost = cmsHostReleaseFingerprint((file) =>
				file === changedFile
					? Buffer.concat([
							readCmsHostReleaseInput(file),
							Buffer.from("\n/* changed */"),
						])
					: readCmsHostReleaseInput(file),
			);

			expect(changedHost).not.toBe(baseline);
		},
	);
});

it("includes the pricing and time contracts while excluding unrelated editor features", () => {
  expect(CMS_HOST_RELEASE_INPUTS).toContain('apps/web/src/components/console-pricing-target.ts');
  expect(CMS_HOST_RELEASE_INPUTS).toContain('apps/web/src/analytics/cms-touchpoints.ts');
  expect(CMS_HOST_RELEASE_INPUTS).toContain('apps/web/src/analytics/events.ts');
  expect(CMS_HOST_RELEASE_INPUTS).toContain('packages/contracts/src/analytics/events/cms-touchpoints.ts');
  expect(CMS_HOST_RELEASE_INPUTS).toContain('packages/contracts/src/api/touchpointTestRuntime.ts');
  expect(CMS_HOST_RELEASE_INPUTS).toContain('apps/web/src/components/test-touchpoint-behavior.ts');
  expect(CMS_HOST_RELEASE_INPUTS).toContain('packages/contracts/src/material-locale.ts');
  expect(CMS_HOST_RELEASE_INPUTS).toContain('packages/contracts/src/material-provenance.ts');
  expect(CMS_HOST_RELEASE_INPUTS).not.toContain('apps/web/src/components/PluginDetailView.tsx');
});

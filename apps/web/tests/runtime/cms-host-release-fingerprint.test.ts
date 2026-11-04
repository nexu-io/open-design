import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CMS_HOST_RELEASE_INPUTS,
	cmsHostReleaseFingerprint,
	cmsHostReleaseFingerprintForWorkspace,
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

	it("fingerprints a workspace that carries the complete input closure", () => {
		expect(cmsHostReleaseFingerprintForWorkspace(workspaceRoot)).toBe(
			cmsHostReleaseFingerprint(readCmsHostReleaseInput),
		);
	});

	it("returns undefined when a packaged workspace omits any input", () => {
		const missing = CMS_HOST_RELEASE_INPUTS[0];
		let reads = 0;

		const fingerprint = cmsHostReleaseFingerprintForWorkspace(workspaceRoot, {
			exists: (path) => !path.endsWith(missing),
			readFile: () => {
				reads += 1;
				return "";
			},
		});

		expect(fingerprint).toBeUndefined();
		expect(reads).toBe(0);
	});
});

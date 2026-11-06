import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	CMS_HOST_RELEASE_INPUTS,
	cmsHostReleaseFingerprint,
	hasCmsHostReleaseInputs,
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

describe("CMS host release fingerprint inputs", () => {
	it("are present in the workspace checkout", () => {
		expect(hasCmsHostReleaseInputs(workspaceRoot)).toBe(true);
	});

	it("are absent from a packaged payload that ships only the web package", async () => {
		// Regression: the packaged web server ships `apps/web` inside
		// `node_modules/@open-design/web`, so a probe of the web package's own
		// `src` reports "present" for a tree with no workspace root. Reading the
		// workspace-relative inputs then threw ENOENT while loading next.config,
		// which killed the packaged web sidecar before it could serve.
		const packagedRoot = await mkdtemp(join(tmpdir(), "open-design-packaged-web-"));
		try {
			const webPackageRoot = join(
				packagedRoot,
				"node_modules",
				"@open-design",
				"web",
			);
			const shipped = join(webPackageRoot, "src/components/touchpoint-component.ts");
			await mkdir(join(webPackageRoot, "src/components"), { recursive: true });
			await writeFile(shipped, "export const touchpoint = 1;\n");

			expect(existsSync(shipped)).toBe(true);
			expect(hasCmsHostReleaseInputs(packagedRoot)).toBe(false);
		} finally {
			await rm(packagedRoot, { force: true, recursive: true });
		}
	});
});

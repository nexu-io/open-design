import { readFile, writeFile } from "node:fs/promises";

import { NtExecutable, NtExecutableResource, Resource } from "resedit";

import { electronBuilderVersionForAppVersion, versionCoreForAppVersion } from "../versions.js";

type VersionTranslation = {
  codepage: number;
  lang: number;
};

export type WinExecutableVersionSnapshot = {
  fixedFileVersion: string;
  fixedProductVersion: string;
  stringTables: Array<{
    translation: VersionTranslation;
    values: Record<string, string>;
  }>;
};

type WinExecutableVersionTargets = {
  fileVersion: string;
  numericVersion: string;
  productVersion: string;
};

const DEFAULT_VERSION_TRANSLATION: VersionTranslation = { codepage: 1200, lang: 1033 };

export function resolveWinExecutableVersionTargets(packagedVersion: string): WinExecutableVersionTargets {
  const versionCore = versionCoreForAppVersion(packagedVersion);
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(versionCore);
  if (match == null) {
    throw new Error(`expected Windows packaged version core to be X.Y.Z, received ${JSON.stringify(packagedVersion)}`);
  }
  return {
    fileVersion: electronBuilderVersionForAppVersion(packagedVersion),
    numericVersion: `${match[1]}.${match[2]}.${match[3]}.0`,
    productVersion: `${match[1]}.${match[2]}.${match[3]}.0`,
  };
}

export async function readWinExecutableVersionSnapshot(executablePath: string): Promise<WinExecutableVersionSnapshot> {
  const executable = NtExecutable.from(await readFile(executablePath), { ignoreCert: true });
  const resource = NtExecutableResource.from(executable);
  const version = Resource.VersionInfo.fromEntries(resource.entries)[0];
  if (version == null) {
    throw new Error(`expected Windows executable version resource in ${executablePath}`);
  }
  const stringTables = collectVersionTranslations(version).map((translation) => ({
    translation,
    values: version.getStringValues(translation),
  }));
  return {
    fixedFileVersion: fixedVersionToString(
      version.fixedInfo.fileVersionMS,
      version.fixedInfo.fileVersionLS,
    ),
    fixedProductVersion: fixedVersionToString(
      version.fixedInfo.productVersionMS,
      version.fixedInfo.productVersionLS,
    ),
    stringTables,
  };
}

export async function rewriteWinExecutableVersion(executablePath: string, packagedVersion: string): Promise<void> {
  const targets = resolveWinExecutableVersionTargets(packagedVersion);
  const executable = NtExecutable.from(await readFile(executablePath), { ignoreCert: true });
  const resource = NtExecutableResource.from(executable);
  const version = Resource.VersionInfo.fromEntries(resource.entries)[0] ?? Resource.VersionInfo.createEmpty();
  if (Resource.VersionInfo.fromEntries(resource.entries).length === 0) {
    version.lang = DEFAULT_VERSION_TRANSLATION.lang;
  }
  const translations = collectVersionTranslations(version);

  version.setFileVersion(targets.numericVersion, DEFAULT_VERSION_TRANSLATION.lang);
  version.setProductVersion(targets.productVersion, DEFAULT_VERSION_TRANSLATION.lang);
  for (const translation of translations) {
    version.setStringValues(translation, {
      ...version.getStringValues(translation),
      FileVersion: targets.fileVersion,
      ProductVersion: targets.productVersion,
    });
  }
  version.outputToResourceEntries(resource.entries);
  resource.outputResource(executable);
  await writeFile(executablePath, Buffer.from(executable.generate()));

  const snapshot = await readWinExecutableVersionSnapshot(executablePath);
  if (snapshot.fixedFileVersion !== targets.numericVersion) {
    throw new Error(
      `expected Windows executable fixed FileVersion ${targets.numericVersion} in ${executablePath}, received ${snapshot.fixedFileVersion}`,
    );
  }
  if (snapshot.fixedProductVersion !== targets.productVersion) {
    throw new Error(
      `expected Windows executable fixed ProductVersion ${targets.productVersion} in ${executablePath}, received ${snapshot.fixedProductVersion}`,
    );
  }
  for (const stringTable of snapshot.stringTables) {
    if (stringTable.values.FileVersion !== targets.fileVersion) {
      throw new Error(
        `expected Windows executable FileVersion string ${targets.fileVersion} in ${executablePath}, received ${JSON.stringify(stringTable.values.FileVersion)}`,
      );
    }
    if (stringTable.values.ProductVersion !== targets.productVersion) {
      throw new Error(
        `expected Windows executable ProductVersion string ${targets.productVersion} in ${executablePath}, received ${JSON.stringify(stringTable.values.ProductVersion)}`,
      );
    }
  }
}

function collectVersionTranslations(version: Resource.VersionInfo): VersionTranslation[] {
  const translations = [
    ...version.getAllLanguagesForStringValues(),
    ...version.getAvailableLanguages(),
  ];
  if (translations.length === 0) return [DEFAULT_VERSION_TRANSLATION];
  const unique = new Map<string, VersionTranslation>();
  for (const translation of translations) {
    unique.set(`${translation.lang}:${translation.codepage}`, {
      codepage: translation.codepage,
      lang: translation.lang,
    });
  }
  return [...unique.values()];
}

function fixedVersionToString(ms: number, ls: number): string {
  return [
    (ms >>> 16) & 0xffff,
    ms & 0xffff,
    (ls >>> 16) & 0xffff,
    ls & 0xffff,
  ].join(".");
}

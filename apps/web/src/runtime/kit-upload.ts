// useKitModuleUpload — wire the empty-module "upload" affordance in the kit view
// to a real save. We upload the file into the backing project, then patch the
// project's brand.json so the module renders the new asset on the next read.
//
// Only meaningful for editable design systems that have a writable brand.json
// (DesignKit.canUpload). Reuses the existing project file providers — no new
// daemon endpoint is required.

import { useCallback, useState } from 'react';
import type { Brand } from '@open-design/contracts';
import {
  fetchProjectFileText,
  uploadProjectFile,
  writeProjectTextFile,
} from '../providers/registry';

export type KitUploadModule = 'logo' | 'image' | 'font';

export interface KitModuleUpload {
  uploading: KitUploadModule | null;
  uploadModule: (module: KitUploadModule, file: File) => Promise<void>;
}

export function useKitModuleUpload(opts: {
  projectId?: string;
  title?: string;
  onUploaded?: (module: KitUploadModule) => void;
  /** Called when the upload or the brand.json write fails, so the host can
   *  surface a visible error instead of the action silently no-op'ing. */
  onError?: (module: KitUploadModule, message: string) => void;
}): KitModuleUpload {
  const { projectId, title, onUploaded, onError } = opts;
  const [uploading, setUploading] = useState<KitUploadModule | null>(null);

  const uploadModule = useCallback(
    async (module: KitUploadModule, file: File) => {
      if (!projectId || uploading) return;
      setUploading(module);
      try {
        const dir = module === 'logo' ? 'logos' : module === 'font' ? 'fonts' : 'imagery';
        const safe =
          file.name.replace(/[^\w.\-]+/g, '-').replace(/^-+|-+$/g, '') || `${module}-asset`;
        const path = `${dir}/${safe}`;
        const uploaded = await uploadProjectFile(projectId, file, path);
        if (!uploaded) {
          onError?.(module, 'upload-failed');
          return;
        }
        // Trust the server-returned stored path, not the locally-computed one:
        // the daemon sanitizes each path segment, so the on-disk name can differ
        // from `path`. Referencing the actual stored name keeps brand.json
        // pointing at a file that resolves (otherwise the tile renders broken).
        const storedPath = uploaded.name || path;
        const storedBase = storedPath.split('/').pop() || safe;

        const raw = await fetchProjectFileText(projectId, 'brand.json', { cache: 'no-store' });
        const brand = brandFromRaw(raw, title);
        if (module === 'logo') {
          const prev = brand.logo.primary;
          if (prev && prev !== storedPath && !brand.logo.alternates.includes(prev)) {
            brand.logo.alternates = [prev, ...brand.logo.alternates];
          }
          brand.logo.primary = storedPath;
        } else if (module === 'image') {
          brand.imagery.samples = brand.imagery.samples ?? [];
          brand.imagery.samples.push({ file: storedPath, kind: 'upload' });
        } else {
          const family = fontFamilyFromFilename(storedBase);
          const spec = { family, fallbacks: ['system-ui', 'sans-serif'], weights: [400] };
          brand.typography.display = spec;
          brand.typography.body = spec;
        }
        const wrote = await writeProjectTextFile(projectId, 'brand.json', JSON.stringify(brand, null, 2));
        if (!wrote) {
          onError?.(module, 'write-failed');
          return;
        }
        if (module === 'font') {
          const manifestRaw = await fetchProjectFileText(projectId, 'fonts/manifest.json', { cache: 'no-store' });
          const manifest = parseFontManifest(manifestRaw);
          const family = fontFamilyFromFilename(storedBase);
          manifest.files = manifest.files.filter((entry) => entry.file !== storedBase);
          manifest.files.push({
            family,
            weight: '400',
            style: 'normal',
            file: storedBase,
            format: fontFormat(storedBase),
          });
          await writeProjectTextFile(projectId, 'fonts/manifest.json', JSON.stringify(manifest, null, 2));
        }
        onUploaded?.(module);
      } catch {
        onError?.(module, 'upload-failed');
      } finally {
        setUploading(null);
      }
    },
    [projectId, title, uploading, onUploaded, onError],
  );

  return { uploading, uploadModule };
}

function defaultFontSpec(): Brand['typography']['display'] {
  return {
    family: 'system-ui',
    fallbacks: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
    weights: [400, 700],
  };
}

function emptyBrand(title?: string): Brand {
  const font = defaultFontSpec();
  return {
    name: title?.trim() || 'Design system',
    tagline: '',
    description: '',
    sourceUrl: '',
    logo: { primary: null, alternates: [], notes: '' },
    colors: [],
    typography: { display: font, body: font },
    voice: {
      adjectives: [],
      tone: '',
      messagingPillars: [],
      vocabulary: { use: [], avoid: [] },
    },
    imagery: {
      style: '',
      subjects: [],
      treatment: '',
      avoid: [],
      samples: [],
    },
    layout: {
      radius: '',
      borderWeight: '',
      spacing: '',
      postureRules: [],
    },
  };
}

function brandFromRaw(raw: string | null, title?: string): Brand {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<Brand>;
      const fallback = emptyBrand(title);
      const voice = parsed.voice ?? fallback.voice;
      const imagery = parsed.imagery ?? fallback.imagery;
      return {
        ...fallback,
        ...parsed,
        logo: { ...fallback.logo, ...(parsed.logo ?? {}) },
        typography: { ...fallback.typography, ...(parsed.typography ?? {}) },
        voice: {
          adjectives: Array.isArray(voice.adjectives) ? voice.adjectives : [],
          tone: typeof voice.tone === 'string' ? voice.tone : '',
          messagingPillars: Array.isArray(voice.messagingPillars) ? voice.messagingPillars : [],
          vocabulary: {
            use: Array.isArray(voice.vocabulary?.use) ? voice.vocabulary.use : [],
            avoid: Array.isArray(voice.vocabulary?.avoid) ? voice.vocabulary.avoid : [],
          },
        },
        imagery: {
          style: typeof imagery.style === 'string' ? imagery.style : '',
          subjects: Array.isArray(imagery.subjects) ? imagery.subjects : [],
          treatment: typeof imagery.treatment === 'string' ? imagery.treatment : '',
          avoid: Array.isArray(imagery.avoid) ? imagery.avoid : [],
          samples: Array.isArray(imagery.samples) ? imagery.samples : [],
        },
        layout: { ...fallback.layout, ...(parsed.layout ?? {}) },
        colors: Array.isArray(parsed.colors) ? parsed.colors as Brand['colors'] : [],
      };
    } catch {
      // Replace malformed brand.json with a valid editable kit so the upload
      // action has a visible result instead of silently storing an orphan file.
    }
  }
  return emptyBrand(title);
}

function fontFamilyFromFilename(fileName: string): string {
  return fileName
    .replace(/\.(otf|ttf|woff2?)$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim() || 'Uploaded font';
}

interface FontManifest {
  files: {
    family: string;
    weight: string;
    style: string;
    file: string;
    format: string;
  }[];
}

function parseFontManifest(raw: string | null): FontManifest {
  if (!raw) return { files: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<FontManifest>;
    return { files: Array.isArray(parsed.files) ? parsed.files : [] };
  } catch {
    return { files: [] };
  }
}

function fontFormat(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.woff2')) return 'woff2';
  if (lower.endsWith('.woff')) return 'woff';
  if (lower.endsWith('.otf')) return 'opentype';
  return 'truetype';
}

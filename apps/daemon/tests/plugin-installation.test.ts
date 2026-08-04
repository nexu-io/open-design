import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import JSZip from 'jszip';
import { createPluginInstallationHelpers } from '../src/services/plugin-installation.js';

describe('plugin-installation zip extraction', () => {
  it('cleans up staging directory on extraction failure', async () => {
    // Generate a zip bomb: tiny compressed size, large decompressed size
    const zip = new JSZip();
    zip.file('bomb.txt', Buffer.alloc(10000, 'A'), { compression: 'DEFLATE' });
    const buffer = await zip.generateAsync({ 
      type: 'nodebuffer', 
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    });
    
    const deps = {
      db: {} as any,
      PLUGIN_UPLOAD_MAX_BYTES: buffer.length, // Buffer length is tiny (e.g. 200 bytes). Decompressed is 10000 bytes.
      PLUGIN_REGISTRY_ROOTS: [],
      PLUGIN_LOCKFILE_PATH: '',
      installFromLocalFolder: async function* () { yield { kind: 'success' }; }
    };
    const helpers = createPluginInstallationHelpers(deps);
    
    const initialTmpCount = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('od-plugin-zip-')).length;
    
    await expect(helpers.stageUploadedPluginZip(buffer, 'test')).rejects.toThrow('zip extracted size exceeds 50 MiB');
    
    const finalTmpCount = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('od-plugin-zip-')).length;
    expect(finalTmpCount).toBe(initialTmpCount);
  });
});
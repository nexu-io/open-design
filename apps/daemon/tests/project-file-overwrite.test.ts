import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { writeProjectFile } from '../src/projects.js';

describe('writeProjectFile overwrite flag', () => {
  let tempDir: string;
  let projectsRoot: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-overwrite-'));
    projectsRoot = path.join(tempDir, 'projects');
    fs.mkdirSync(projectsRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('succeeds when overwrite=false and file does not exist', async () => {
    const result = await writeProjectFile(
      projectsRoot,
      'proj-1',
      'new.html',
      '<html>hello</html>',
      { overwrite: false },
    );
    expect(result.name).toBe('new.html');
    expect(fs.existsSync(path.join(projectsRoot, 'proj-1', 'new.html'))).toBe(true);
  });

  it('throws EEXIST when overwrite=false and file already exists', async () => {
    const filePath = path.join(projectsRoot, 'proj-1', 'existing.html');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '<html>old</html>');

    await expect(
      writeProjectFile(
        projectsRoot,
        'proj-1',
        'existing.html',
        '<html>new</html>',
        { overwrite: false },
      ),
    ).rejects.toMatchObject({ code: 'EEXIST' });

    expect(fs.readFileSync(filePath, 'utf8')).toBe('<html>old</html>');
  });

  it('overwrites when overwrite=true and file already exists', async () => {
    const filePath = path.join(projectsRoot, 'proj-1', 'existing.html');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '<html>old</html>');

    const result = await writeProjectFile(
      projectsRoot,
      'proj-1',
      'existing.html',
      '<html>new</html>',
      { overwrite: true },
    );
    expect(result.name).toBe('existing.html');
    expect(fs.readFileSync(filePath, 'utf8')).toBe('<html>new</html>');
  });
});

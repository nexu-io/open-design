import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  extractPlainStreamArtifacts,
  persistPlainStreamArtifacts,
  plainStdoutFromRunEvents,
} from '../../src/runtimes/plain-stream.js';
import { listFiles, writeProjectFile } from '../../src/projects.js';

describe('plain stream artifact extraction', () => {
  it('extracts and writes artifact tags from plain stdout into project files', async () => {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-plain-stream-'));
    try {
      const stdout = [
        'Here is the result:\n',
        '<artifact identifier="flowmind-landing" type="text/html" title="FlowMind Landing">',
        '<!doctype html><html><body><h1>FlowMind</h1></body></html>',
        '</artifact>',
        '\nDone.',
      ].join('');

      const written = await persistPlainStreamArtifacts({
        projectsRoot,
        projectId: 'project-1',
        stdout,
        writeProjectFile: writeProjectFile as any,
      });

      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({
        name: 'flowmind-landing.html',
        identifier: 'flowmind-landing',
        artifactType: 'text/html',
      });

      const body = await readFile(
        path.join(projectsRoot, 'project-1', 'flowmind-landing.html'),
        'utf8',
      );
      expect(body).toContain('<h1>FlowMind</h1>');

      const files = await listFiles(projectsRoot, 'project-1');
      const file = files.find((candidate) => candidate.name === 'flowmind-landing.html');
      expect(file?.artifactManifest).toMatchObject({
        kind: 'html',
        renderer: 'html',
        entry: 'flowmind-landing.html',
        metadata: {
          identifier: 'flowmind-landing',
          artifactType: 'text/html',
          inferred: false,
        },
      });
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  it('does not write files when plain stdout contains no artifact tags', async () => {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-plain-stream-'));
    try {
      const written = await persistPlainStreamArtifacts({
        projectsRoot,
        projectId: 'project-1',
        stdout: 'plain answer with no file output',
        writeProjectFile: writeProjectFile as any,
      });

      expect(written).toEqual([]);
      await expect(listFiles(projectsRoot, 'project-1')).resolves.toEqual([]);
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  it('infers html artifacts without a type and avoids filename collisions', async () => {
    const projectsRoot = await mkdtemp(path.join(tmpdir(), 'od-plain-stream-'));
    try {
      await mkdir(path.join(projectsRoot, 'project-1'), { recursive: true });
      await writeFile(path.join(projectsRoot, 'project-1', 'landing.html'), 'existing');

      const written = await persistPlainStreamArtifacts({
        projectsRoot,
        projectId: 'project-1',
        stdout: [
          '<artifact identifier="landing" title="Landing">',
          '<!doctype html><html><body>New</body></html>',
          '</artifact>',
        ].join(''),
        writeProjectFile: writeProjectFile as any,
      });

      expect(written).toHaveLength(1);
      expect(written[0]).toMatchObject({
        name: 'landing-2.html',
        artifactType: 'text/html',
      });
      await expect(readFile(path.join(projectsRoot, 'project-1', 'landing.html'), 'utf8'))
        .resolves.toBe('existing');
      await expect(readFile(path.join(projectsRoot, 'project-1', 'landing-2.html'), 'utf8'))
        .resolves.toContain('<body>New</body>');
    } finally {
      await rm(projectsRoot, { recursive: true, force: true });
    }
  });

  it('ignores bare artifact tags to match the web artifact parser', () => {
    const artifacts = extractPlainStreamArtifacts([
      '<artifact><!doctype html><html><body>Bare</body></html></artifact>',
      '<artifact identifier="real" type="text/html"><!doctype html><html><body>Real</body></html></artifact>',
    ].join('\n'));

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.fileName).toBe('real.html');
    expect(artifacts[0]?.content).toBe('<!doctype html><html><body>Real</body></html>');
  });

  it('maps supported text artifact types to stable project file names', () => {
    const artifacts = extractPlainStreamArtifacts([
      '<artifact identifier="theme" type="text/css">body { color: red; }</artifact>',
      '<artifact identifier="logo" type="image/svg+xml"><svg /></artifact>',
      '<artifact identifier="brief" type="text/markdown"># Brief</artifact>',
    ].join('\n'));

    expect(artifacts.map((artifact) => ({
      name: artifact.fileName,
      type: artifact.artifactType,
    }))).toEqual([
      { name: 'theme.css', type: 'text/css' },
      { name: 'logo.svg', type: 'image/svg+xml' },
      { name: 'brief.md', type: 'text/markdown' },
    ]);
  });

  it('reconstructs only plain stdout events and ignores literal code-fence examples', () => {
    const stdout = plainStdoutFromRunEvents([
      { event: 'agent', data: { type: 'text_delta', delta: '<artifact type="text/html">no</artifact>' } },
      { event: 'stdout', data: { chunk: '```html\n<artifact type="text/html">example</artifact>\n```\n' } },
      { event: 'stdout', data: { chunk: '<artifact type="text/html"><!doctype html><html></html></artifact>' } },
    ]);

    const artifacts = extractPlainStreamArtifacts(stdout);

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.content).toBe('<!doctype html><html></html>');
  });

  it('extracts artifact tags inside indented backtick examples to match web markdown context', () => {
    const artifacts = extractPlainStreamArtifacts([
      '- Literal example:\n',
      '   ```html\n',
      '   <artifact type="text/html"><!doctype html><html><body>Example</body></html></artifact>\n',
      '<artifact identifier="real" type="text/html"><!doctype html><html><body>Real</body></html></artifact>',
    ].join(''));

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.fileName).toBe('artifact.html');
    expect(artifacts[0]?.content).toBe('<!doctype html><html><body>Example</body></html>');
    expect(artifacts[1]?.fileName).toBe('real.html');
    expect(artifacts[1]?.content).toBe('<!doctype html><html><body>Real</body></html>');
  });

  it('extracts artifact tags inside tilde fences to match web markdown context', () => {
    const artifacts = extractPlainStreamArtifacts([
      '~~~html\n',
      '<artifact type="text/html"><!doctype html><html><body>Tilde</body></html></artifact>\n',
      '~~~\n',
      '<artifact identifier="real" type="text/html"><!doctype html><html><body>Real</body></html></artifact>',
    ].join(''));

    expect(artifacts).toHaveLength(2);
    expect(artifacts[0]?.fileName).toBe('artifact.html');
    expect(artifacts[0]?.content).toBe('<!doctype html><html><body>Tilde</body></html>');
    expect(artifacts[1]?.fileName).toBe('real.html');
    expect(artifacts[1]?.content).toBe('<!doctype html><html><body>Real</body></html>');
  });

  it('ignores artifact tags inside inline markdown code spans', () => {
    const artifacts = extractPlainStreamArtifacts([
      'Use `<artifact identifier="example" type="text/html">example</artifact>` to emit HTML.\n',
      '<artifact identifier="real" type="text/html"><!doctype html><html><body>Real</body></html></artifact>',
    ].join(''));

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.fileName).toBe('real.html');
    expect(artifacts[0]?.content).toBe('<!doctype html><html><body>Real</body></html>');
  });

  it('resyncs past prose artifact openers before a valid artifact block', () => {
    const artifacts = extractPlainStreamArtifacts([
      'Use <artifact type="text/html"> in prose before emitting the real artifact.\n',
      '<artifact identifier="real" type="text/html">',
      '<!doctype html><html><body>Real</body></html>',
      '</artifact>',
    ].join(''));

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.fileName).toBe('real.html');
    expect(artifacts[0]?.content).toBe('<!doctype html><html><body>Real</body></html>');
  });

  it('resyncs past malformed artifact openers before a valid artifact block', () => {
    const artifacts = extractPlainStreamArtifacts([
      'Malformed protocol example: <artifact type="text/html"\n',
      '<artifact identifier="real" type="text/html">',
      '<!doctype html><html><body>Real</body></html>',
      '</artifact>',
    ].join(''));

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.fileName).toBe('real.html');
    expect(artifacts[0]?.content).toBe('<!doctype html><html><body>Real</body></html>');
  });

  it('does not let unmatched backticks hide artifact tags in later paragraphs', () => {
    const artifacts = extractPlainStreamArtifacts([
      'Intro with a stray ` backtick.',
      '',
      '<artifact identifier="real" type="text/html"><!doctype html><html><body>Real</body></html></artifact>',
      '',
      'Another stray ` backtick later.',
    ].join('\n'));

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.fileName).toBe('real.html');
    expect(artifacts[0]?.content).toBe('<!doctype html><html><body>Real</body></html>');
  });
});

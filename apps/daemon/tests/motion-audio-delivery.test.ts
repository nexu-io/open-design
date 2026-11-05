import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { describe, it, expect } from 'vitest';
import { readMotionExportSpec, assertMotionExport } from '../src/artifacts/motion-delivery.js';
const exec = promisify(execFile);
const source = '<meta name="od-motion-output" content="video"><link rel="alternate" type="video/mp4" href="film.mp4"><main data-composition-id="main"></main>';

describe('motion export without model-plan gates', () => {
  it('checks real source and MP4 audio inside export, including silent and missing tracks', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-motion-audio-'));
    const video = path.join(root, 'film.mp4');
    const read = () => readMotionExportSpec({ projectRoot: root, sourcePath: 'index.html', outputPath: 'film.mp4' });
    try {
      await exec(ffmpegInstaller.path, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', path.join(root, 'music.wav')]);
      await writeFile(path.join(root, 'index.html'), source);
      await exec(ffmpegInstaller.path, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', video]);
      await expect(assertMotionExport(video, (await read())!)).resolves.toBeUndefined();
      await writeFile(path.join(root, 'index.html'), source + '<meta name="od-motion-audio" content="required">');
      await expect(read()).rejects.toThrow('real local audio track');
      await writeFile(path.join(root, 'index.html'), source + '<audio src="music.wav" data-duration="1"></audio>');
      await expect(assertMotionExport(video, (await read())!)).rejects.toThrow('missing audible audio');
      await exec(ffmpegInstaller.path, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-i', path.join(root, 'music.wav'), '-c:v', 'libx264', '-c:a', 'aac', '-shortest', video]);
      await expect(assertMotionExport(video, (await read())!)).resolves.toBeUndefined();
      await writeFile(path.join(root, 'index.html'), source + '<meta name="od-motion-audio" content="silent">');
      await expect(assertMotionExport(video, (await read())!)).rejects.toThrow('contains audible audio');
      await writeFile(path.join(root, 'index.html'), source + '<meta name="od-motion-audio" content="silent"><audio src="music.wav" data-duration="1"></audio>');
      await expect(read()).rejects.toThrow('cannot declare audio');
      await writeFile(path.join(root, 'index.html'), source + '<audio src="music.wav" data-duration="1"></audio>');
      await exec(ffmpegInstaller.path, ['-y', '-f', 'lavfi', '-i', 'color=c=blue:s=64x64:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '1', '-c:v', 'libx264', '-c:a', 'aac', video]);
      await expect(assertMotionExport(video, (await read())!)).rejects.toThrow('missing audible audio');
      await writeFile(video, '<html>renamed file</html>');
      await expect(assertMotionExport(video, (await read())!)).rejects.toThrow('did not produce an MP4');
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each(['interactive', ''])('does not enforce video/audio export rules on %s output', async mode => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-motion-scope-'));
    try {
      await writeFile(path.join(root, 'index.html'), `<meta name="od-motion-output" content="${mode}"><main data-composition-id="main"></main><audio src="missing.wav"></audio>`);
      await expect(readMotionExportSpec({ projectRoot: root, sourcePath: 'index.html', outputPath: 'unused.mp4' })).resolves.toBeUndefined();
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it.each(['../escape.mp4', '/outside.mp4', 'https://host/video.mp4', 'film.mp4?x=1', 'other.mp4'])('rejects the unsafe or mismatched export link %s', async href => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-motion-path-'));
    try {
      await writeFile(path.join(root, 'index.html'), source.replace('href="film.mp4"', `href="${href}"`));
      await expect(readMotionExportSpec({ projectRoot: root, sourcePath: 'index.html', outputPath: 'film.mp4' })).rejects.toThrow(/MP4/);
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it('checks a nested editable source against its actual export path', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'od-motion-nested-'));
    try {
      await mkdir(path.join(root, 'motion-source/film'), { recursive: true });
      await writeFile(path.join(root, 'motion-source/film/index.html'), source.replace('href="film.mp4"', 'href="../../film.mp4"'));
      await expect(readMotionExportSpec({ projectRoot: root, sourcePath: 'motion-source/film/index.html', outputPath: 'film.mp4' })).resolves.toMatchObject({ sourcePath: 'motion-source/film/index.html', videoPath: 'film.mp4', audio: 'silent' });
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});

import { serveEditor } from '../editor-runtime.ts';

try {
  if (process.argv[2] !== '--serve') throw new Error('请通过共享编辑器启动器运行后台');
  await serveEditor(process.argv[3]);
} catch (error) { console.error((error as Error).message); process.exitCode = 1; }

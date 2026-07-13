/** Loop Engine 工具函数 */

let runIdCounter = 0;

export function generateLoopRunId(projectId: string, iteration: number): string {
  runIdCounter += 1;
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `critique-loop-${projectId.slice(0, 8)}-i${iteration}-${timestamp}-${rand}`;
}

export async function* createEmptyStdout(): AsyncIterable<string> {}

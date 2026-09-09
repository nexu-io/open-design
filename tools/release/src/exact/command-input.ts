import { writeObject } from "./control-common.ts";

export type Options = Record<string, unknown>;
export function required(options: Options, key: string): string {
  const value = options[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`--${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)} is required`);
  return value;
}
export async function emit(options: Options, receipt: unknown): Promise<void> {
  if (options.receipt != null) await writeObject(required(options, "receipt"), receipt);
  else process.stdout.write(`${JSON.stringify(receipt)}\n`);
}

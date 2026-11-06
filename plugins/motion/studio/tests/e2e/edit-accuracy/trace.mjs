// Bench-side lines for the write trace (HF_WRITE_TRACE), in the same file as the server's.
import { appendFileSync } from "node:fs";
import { createHash } from "node:crypto";

export const traceBench = (kind, data = {}) => {
  if (process.env.HF_WRITE_TRACE)
    appendFileSync(
      process.env.HF_WRITE_TRACE,
      JSON.stringify({ t: Date.now(), kind, ...data }) + "\n",
    );
};
export const hashOf = (text) => createHash("sha256").update(String(text)).digest("hex").slice(0, 8);

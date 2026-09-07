import { describe, expect, it } from "vitest";
import { parseUsda } from "../src/parse/usda.js";

/**
 * The bulk-array ALLOCATION oracle, alone in the unit-serial project
 * (single thread, no file parallelism): process.memoryUsage() is
 * per-process, and under the default worker-thread pool a neighbouring
 * file allocating concurrently moves the delta non-deterministically.
 * Isolation makes the measurement about the parser, not the scheduler.
 */

describe("usda bulk-array allocation", () => {
  it("parses bulk payloads without tokenizing them — an allocation oracle, not just a shell check", () => {
    /* The shell assertions above cannot see a tokenize-then-discard
       regression: a lexer that mints a Token per number and throws them
       away still stores the short shell. The production failure was
       allocation (multi-GB heap on hundreds of MB of vertex data), so the
       pin measures allocation. A ~25 MB payload holds ~2.8M numbers; the
       old per-number tokenization allocated gigabytes for it, while the
       one-walk skip allocates little beyond the source string. 200 MB is
       an order of magnitude of headroom over GC noise in both directions. */
    const tuples = new Array(400_000).fill("(0.123456, 1.234567, 2.345678)").join(", ");
    const src = `#usda 1.0
(
    defaultPrim = "Root"
)

def Xform "Root"
{
    def Mesh "m"
    {
        point3f[] points = [${tuples}]
    }
}
`;
    const before = process.memoryUsage().heapUsed;
    const tree = parseUsda(src, "huge.usda");
    const grown = process.memoryUsage().heapUsed - before;
    expect(tree.prims.find((p) => p.name === "m")).toBeDefined();
    expect(grown).toBeLessThan(200 * 1024 * 1024);
  });
});

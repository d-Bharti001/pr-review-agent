import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ChangedFile } from "src/types/pullRequest";

// A small budget makes batching easy to trigger. With it, about 950 tokens are
// left for diffs after the PR header.
vi.mock("src/config", () => ({ BATCH_TOKEN_BUDGET: 1000 }));

// The code uses a global logger (set up by src/utils/logger)
beforeAll(() => {
    vi.stubGlobal("logger", { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
});

// 4 characters are about 1 token
const file = (path: string, patchChars: number): ChangedFile => ({
    path,
    status: "modified",
    patch: `@@ -1 +1 @@\n${"x".repeat(patchChars)}`,
});

async function runChunk(files: ChangedFile[]) {
    const { chunk } = await import("src/graph/nodes/chunk");
    const result = await chunk({ title: "t", description: "", files } as never, {} as never);
    return (result as { batches: ChangedFile[][] }).batches;
}

describe("chunk", () => {
    it("keeps a diff that fits the budget in one batch", async () => {
        const batches = await runChunk([file("src/a.ts", 400), file("src/b.ts", 400)]);

        expect(batches).toHaveLength(1);
    });

    it("splits a large diff into batches of whole files, keeping the order", async () => {
        // Each file costs about 410 tokens, so two fit in a batch and a third does not
        const files = ["a", "b", "c", "d", "e"].map((n) => file(`src/${n}.ts`, 1600));
        const batches = await runChunk(files);

        expect(batches.map((b) => b.length)).toEqual([2, 2, 1]);
        expect(batches.flat().map((f) => f.path)).toEqual(files.map((f) => f.path));
    });

    it("splits one oversized file between hunks", async () => {
        // 4 hunks of about 300 tokens each: more than the budget, so it is split in two parts
        const hunk = (n: number) => `@@ -${n},1 +${n},1 @@\n${"x".repeat(1180)}`;
        const big: ChangedFile = {
            path: "src/big.ts",
            status: "modified",
            patch: [1, 2, 3, 4].map(hunk).join("\n"),
        };
        const pieces = (await runChunk([big])).flat();

        expect(pieces).toHaveLength(2);
        expect(pieces[0].patch.startsWith("[part 1 of 2")).toBe(true);
        expect(pieces[1].patch.startsWith("[part 2 of 2")).toBe(true);
    });
});

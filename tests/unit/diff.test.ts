import { describe, expect, it } from "vitest";
import { numberPatch } from "src/graph/utils/diff";

// Findings cite these numbers, so they must be the line numbers of the new file
describe("numberPatch", () => {
    it("numbers added and context lines with new-file line numbers and skips removed lines", () => {
        const patch = [
            "@@ -10,3 +10,4 @@",
            " const a = 1;",
            "+const b = 2;",
            "-const c = 3;",
            " return a;",
        ].join("\n");

        expect(numberPatch(patch).split("\n")).toEqual([
            "@@ -10,3 +10,4 @@",
            "   10  const a = 1;",
            "   11 +const b = 2;",
            "      -const c = 3;",
            "   12  return a;",
        ]);
    });
});

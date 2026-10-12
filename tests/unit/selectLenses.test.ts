import { describe, expect, it } from "vitest";
import { isDocsOnly, requiredLenses } from "src/graph/utils/selectLenses";

const files = (...paths: string[]) => paths.map((path) => ({ path }));

// The rules, not the LLM, decide which lenses must run
describe("lens selection rules", () => {
    it("runs quality only for a docs-only change", () => {
        expect(isDocsOnly(files("README.md"))).toBe(true);
        expect(requiredLenses(files("README.md"))).toEqual(["quality"]);
    });

    it("adds security when source or config files change", () => {
        expect(requiredLenses(files("src/app.ts"))).toEqual(["quality", "security"]);
        expect(requiredLenses(files("package.json"))).toEqual(["quality", "security"]);
    });
});

import { describe, expect, it } from "vitest";
import { renderReviewComment } from "src/github/renderComment";
import type { Finding } from "src/types/findings";

const base = { owner: "acme", repo: "app", headSha: "abc123" };

const finding = (overrides: Partial<Finding> = {}): Finding => ({
    category: "security",
    severity: "high",
    locations: [{ file: "src/a.ts", startLine: 10, endLine: 12 }],
    title: "SQL built from user input",
    message: "The query concatenates the id.",
    suggestion: "Use a parameterized query.",
    ...overrides,
});

describe("renderReviewComment", () => {
    it("says no issues were found when there are no findings", () => {
        expect(renderReviewComment({ ...base, findings: [] })).toContain("No issues found.");
    });

    it("groups findings by severity, most severe first, with permalinks at the reviewed commit", () => {
        const body = renderReviewComment({
            ...base,
            findings: [
                finding({ severity: "low", title: "Low one" }),
                finding({ severity: "critical", title: "Critical one" }),
            ],
        });

        expect(body.indexOf("### Critical")).toBeLessThan(body.indexOf("### Low"));
        expect(body).not.toContain("### High");
        expect(body).toContain(
            "[src/a.ts:10-12](https://github.com/acme/app/blob/abc123/src/a.ts#L10-L12)",
        );
    });

    it("notes skipped files and failed lenses", () => {
        const body = renderReviewComment({
            ...base,
            findings: [finding()],
            skippedFiles: ["package-lock.json"],
            failedLenses: ["tests"],
        });

        expect(body).toContain("1 file(s) were skipped");
        expect(body).toContain("these lenses failed and are missing: tests");
    });
});

import { describe, expect, it, vi } from "vitest";
import { COMMENT_MARKER, upsertReviewComment } from "src/github/comments";
import type { Octokit } from "octokit";

vi.mock("src/config", () => ({ GITHUB_APP_ID: "123" }));

// A fake Octokit whose list of existing comments is given
function fakeOctokit(existing: object[]) {
    const createComment = vi.fn();
    const updateComment = vi.fn();
    const octokit = {
        paginate: vi.fn(async () => existing),
        rest: { issues: { listComments: vi.fn(), createComment, updateComment } },
    } as unknown as Octokit;

    return { octokit, createComment, updateComment };
}

const args = { owner: "acme", repo: "app", prNumber: 5, body: "## PR Review" };

describe("upsertReviewComment", () => {
    it("creates the comment, with the hidden marker, when there is none", async () => {
        const { octokit, createComment, updateComment } = fakeOctokit([]);

        await upsertReviewComment(octokit, args);

        expect(updateComment).not.toHaveBeenCalled();
        expect(createComment).toHaveBeenCalledWith({
            owner: "acme",
            repo: "app",
            issue_number: 5,
            body: `${COMMENT_MARKER}\n## PR Review`,
        });
    });

    it("edits the existing comment of this app instead of adding another", async () => {
        const { octokit, createComment, updateComment } = fakeOctokit([
            { id: 1, body: "a human comment" },
            {
                id: 2,
                body: `${COMMENT_MARKER}\nold review`,
                performed_via_github_app: { id: 123 },
            },
        ]);

        await upsertReviewComment(octokit, args);

        expect(createComment).not.toHaveBeenCalled();
        expect(updateComment).toHaveBeenCalledWith({
            owner: "acme",
            repo: "app",
            comment_id: 2,
            body: `${COMMENT_MARKER}\n## PR Review`,
        });
    });

    it("does not touch a comment that has the marker but was not posted by this app", async () => {
        const { octokit, createComment, updateComment } = fakeOctokit([
            { id: 3, body: `${COMMENT_MARKER}\ncopied`, performed_via_github_app: { id: 999 } },
            { id: 4, body: `${COMMENT_MARKER}\ntyped by a person`, performed_via_github_app: null },
        ]);

        await upsertReviewComment(octokit, args);

        expect(updateComment).not.toHaveBeenCalled();
        expect(createComment).toHaveBeenCalledTimes(1);
    });
});

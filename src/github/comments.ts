import type { Octokit } from "octokit";

import { GITHUB_APP_ID } from "src/config";

export const COMMENT_MARKER = "<!-- pr-review-agent -->";

export async function upsertReviewComment(
    octokit: Octokit,
    args: { owner: string; repo: string; prNumber: number; body: string },
) {
    const { owner, repo, prNumber } = args;
    const body = `${COMMENT_MARKER}\n${args.body}`;

    const comments = await octokit.paginate(octokit.rest.issues.listComments, {
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
    });
    const existing = comments.find(
        (c) =>
            c.body?.startsWith(COMMENT_MARKER) &&
            c.performed_via_github_app?.id === Number(GITHUB_APP_ID),
    );

    if (existing) {
        await octokit.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    } else {
        await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
    }
}

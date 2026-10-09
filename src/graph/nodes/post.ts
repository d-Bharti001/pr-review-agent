import type { GraphNode } from "@langchain/langgraph";
import type { ReviewState } from "src/graph/state";
import app from "src/github/app";
import { upsertReviewComment } from "src/github/comments";
import { renderReviewComment } from "src/github/renderComment";

/**
 * `post` node: renders the comment and creates or edits the single PR comment.
 * Reads: mergedFindings, skippedFiles, lensFailures and the job fields.
 */
export const post: GraphNode<typeof ReviewState> = async (state) => {
    const { installationId, owner, repo, prNumber, headSha } = state;
    const octokit = await app.getInstallationOctokit(installationId);

    const body = renderReviewComment({
        findings: state.mergedFindings,
        owner,
        repo,
        headSha,
        skippedFiles: state.skippedFiles,
        failedLenses: [...new Set(state.lensFailures)], // a lens can fail on several batches of diffs
    });

    await upsertReviewComment(octokit, { owner, repo, prNumber, body });
    return {};
};

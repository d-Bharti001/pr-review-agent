import type { GraphNode } from "@langchain/langgraph";
import app from "src/github/app";
import { fetchPullRequestHeadSha } from "src/github/pullRequest";
import type { ReviewState } from "src/graph/state";

/**
 * `staleCheck` node: checks that the PR is still at the commit that the pipeline reviewed.
 * If there's a new commit pushed, sets `stale` and the run ends without posting any comment;
 * the new push had already queued its own review.
 */
export const staleCheck: GraphNode<typeof ReviewState> = async (state) => {
    const { installationId, owner, repo, prNumber, headSha } = state;
    const octokit = await app.getInstallationOctokit(installationId);
    const currentHeadSha = await fetchPullRequestHeadSha(octokit, { owner, repo, prNumber });

    if (currentHeadSha !== headSha) {
        logger.info("Head SHA changed during the review, discarding the result", {
            reviewed: headSha,
            current: currentHeadSha,
        });
        return { stale: true };
    }

    return {};
};

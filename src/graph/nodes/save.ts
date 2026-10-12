import type { GraphNode } from "@langchain/langgraph";
import type { ReviewState } from "src/graph/state";
import type { ReviewStatus } from "src/types/review";
import { withTransaction } from "src/database/withTransaction";
import { insertReview } from "src/database/repository/review/insert";
import { insertMultipleFindings } from "src/database/repository/finding/insert";
import { insertMultipleLlmUsage } from "src/database/repository/llmUsage/insert";
import { deleteFindingsByReviewId } from "src/database/repository/finding/deleteByReviewId";
import { deleteLlmUsageByReviewId } from "src/database/repository/llmUsage/deleteByReviewId";

function reviewStatus(totalRuns: number, totalFailures: number): ReviewStatus {
    if (totalFailures === 0) return "completed";
    if (totalFailures < totalRuns) return "partial";
    return "failed";
}

/**
 * `save` node: saves the review, its findings and its usage into the database.
 * Keyed by GitHub Delivery ID, so a retried job updates its rows instead of
 * adding to the existing ones.
 */
export const save: GraphNode<typeof ReviewState> = async (state) => {
    await withTransaction(async (conn) => {
        const reviewId = await insertReview(conn, {
            repo: state.repo,
            owner: state.owner,
            prNumber: state.prNumber,
            headSha: state.headSha,
            deliveryId: state.deliveryId,
            status: reviewStatus(state.lensRuns.length, state.lensFailures.length),
        });

        // A retry replaces the earlier results of this review
        await deleteFindingsByReviewId(conn, reviewId);
        await deleteLlmUsageByReviewId(conn, reviewId);

        await insertMultipleFindings(
            conn,
            state.mergedFindings.map((f) => ({
                ...f,
                reviewId,
            })),
        );

        await insertMultipleLlmUsage(
            conn,
            state.usage.map((u) => ({
                ...u,
                reviewId,
            })),
        );
    });

    return {};
};

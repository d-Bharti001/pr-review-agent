import { PoolConnection } from "mysql2/promise";

export async function deleteLlmUsageByReviewId(conn: PoolConnection, reviewId: number) {
    await conn.execute("DELETE FROM llm_usage WHERE review_id = ?", [reviewId]);
}

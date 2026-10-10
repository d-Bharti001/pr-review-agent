import { PoolConnection } from "mysql2/promise";

export async function deleteFindingsByReviewId(conn: PoolConnection, reviewId: number) {
    await conn.execute("DELETE FROM findings WHERE review_id = ?", [reviewId]);
}

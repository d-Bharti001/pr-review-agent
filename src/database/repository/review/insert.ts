import { PoolConnection, ResultSetHeader } from "mysql2/promise";
import type { ReviewStatus } from "src/types/review";

export interface InsertReviewParams {
    repo: string;
    owner: string;
    prNumber: number;
    headSha: string;
    deliveryId: string;
    status: ReviewStatus;
}

export async function insertReview(
    conn: PoolConnection,
    review: InsertReviewParams,
): Promise<number> {
    const [result] = await conn.execute<ResultSetHeader>(
        `
            INSERT INTO reviews
                (repo, owner, pr_number, head_sha, delivery_id, status)
            VALUES (?, ?, ?, ?, ?, ?) AS new
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id),
                head_sha = new.head_sha,
                status = new.status
        `,
        [
            review.repo,
            review.owner,
            review.prNumber,
            review.headSha,
            review.deliveryId,
            review.status,
        ],
    );

    return result.insertId;
}

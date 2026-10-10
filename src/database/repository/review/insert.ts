import { PoolConnection, ResultSetHeader } from "mysql2/promise";

export interface InsertReviewParams {
    repo: string;
    owner: string;
    prNumber: number;
    headSha: string;
    deliveryId: string;
}

export async function insertReview(
    conn: PoolConnection,
    review: InsertReviewParams,
): Promise<number> {
    const [result] = await conn.execute<ResultSetHeader>(
        `
            INSERT INTO reviews
                (repo, owner, pr_number, head_sha, delivery_id, status)
            VALUES (?, ?, ?, ?, ?, 'completed') AS new
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id),
                head_sha = new.head_sha,
                status = new.status
        `,
        [review.repo, review.owner, review.prNumber, review.headSha, review.deliveryId],
    );

    return result.insertId;
}

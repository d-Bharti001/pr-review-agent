import type { PoolConnection } from "mysql2/promise";

export interface InsertFindingParams {
    reviewId: number;
    category: string;
    severity: string;
    title: string;
    message: string;
    suggestion: string;
    locations: unknown;
    model: string;
    provider: string;
}

export async function insertMultipleFindings(
    conn: PoolConnection,
    findings: InsertFindingParams[],
) {
    if (!findings.length) return;

    const values = findings.flatMap((f) => [
        f.reviewId,
        f.category,
        f.severity,
        f.title,
        f.message,
        f.suggestion,
        JSON.stringify(f.locations),
        f.model,
        f.provider,
    ]);

    const placeholders = new Array(findings.length).fill("(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");

    await conn.execute(
        `
            INSERT INTO findings
                (review_id, category, severity, title, message, suggestion, locations, model, provider)
            VALUES ${placeholders}
        `,
        values,
    );
}

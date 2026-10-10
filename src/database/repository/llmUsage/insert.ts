import type { PoolConnection } from "mysql2/promise";

export interface InsertLlmUsageParams {
    reviewId: number;
    pipelineStep: string;
    model: string;
    provider: string;
    llmCalls: number;
    totalTokens: number;
    latencyMs: number;
}

export async function insertMultipleLlmUsage(
    conn: PoolConnection,
    usageRecords: InsertLlmUsageParams[],
) {
    if (!usageRecords.length) return;

    const values = usageRecords.flatMap((r) => [
        r.reviewId,
        r.pipelineStep,
        r.model,
        r.provider,
        r.llmCalls,
        r.totalTokens,
        r.latencyMs,
    ]);

    const placeholders = new Array(usageRecords.length).fill("(?, ?, ?, ?, ?, ?, ?)").join(", ");

    await conn.execute(
        `
        
            INSERT INTO llm_usage
                (review_id, pipeline_step, model, provider, llm_calls, total_tokens, latency_ms)
            VALUES ${placeholders}
        `,
        values,
    );
}

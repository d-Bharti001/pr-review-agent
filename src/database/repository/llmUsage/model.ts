import { RowDataPacket } from "mysql2";

export interface ILlmUsageRow extends RowDataPacket {
    id: string; // BIGINT as string
    review_id: string; // BIGINT as string
    pipeline_step: string;
    model: string;
    provider: string;
    llm_calls: number;
    total_tokens: number;
    latency_ms: number;
    cost?: number;
}

import { z } from "zod";

export const usageRecordSchema = z.object({
    pipelineStep: z.string(), // security | quality | tests | lensRouter | merge
    model: z.string(),
    provider: z.string(),
    llmCalls: z.number(),
    totalTokens: z.number(),
    latencyMs: z.number(),
});

export type UsageRecord = z.infer<typeof usageRecordSchema>;

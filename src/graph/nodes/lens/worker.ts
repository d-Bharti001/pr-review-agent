import { type GraphNode, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

import type { ChatModel } from "src/llm/chatModel";
import type { Lens } from "src/types/lens";
import type { ChangedFile } from "src/types/pullRequest";
import type { UsageRecord } from "src/types/usage";
import { createLensAgent } from "src/graph/nodes/lens/agent";
import { findingsChannel, lensFailuresChannel, usageChannel } from "src/graph/state";
import { createTools } from "src/graph/tools";

// What `Send` hands to a worker, plus the two keys it writes back to `ReviewState`
export const LensWorkerState = new StateSchema({
    // input, sent by the lens router
    batch: z.custom<ChangedFile[]>(),
    prTitle: z.string(),
    prDescription: z.string(),
    changedPaths: z.array(z.string()),
    workDir: z.string(),

    // output (merged into ReviewState by its reducers)
    findings: findingsChannel(),
    lensFailures: lensFailuresChannel(),
    usage: usageChannel(),
});

/**
 * Returns one lens as a node: runs the agent on one batch and reports its findings.
 */
export function createLensWorker(
    lens: Lens,
    chatModel: ChatModel,
): GraphNode<typeof LensWorkerState> {
    return async (input, config) => {
        const { batch, prTitle, prDescription, changedPaths, workDir } = input;
        const startAt = Date.now();

        try {
            // Tools are bound to this review's workDir, so the agent is built per run
            const agent = createLensAgent(lens, chatModel, createTools(workDir));
            const result = await agent.invoke(
                { batch, prTitle, prDescription, changedPaths },
                config,
            );

            const usage: UsageRecord[] = [
                {
                    pipelineStep: lens.id,
                    model: chatModel.name,
                    provider: chatModel.provider,
                    llmCalls: result.llmCalls,
                    totalTokens: result.tokensUsed,
                    latencyMs: Date.now() - startAt,
                },
            ];

            return result.failed
                ? { lensFailures: [lens.id], usage }
                : { findings: result.findings, usage };
        } catch (err) {
            logger.error(`Lens ${lens.id} failed`, err);
            return { lensFailures: [lens.id] };
        }
    };
}

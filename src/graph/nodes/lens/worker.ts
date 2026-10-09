import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { type GraphNode, StateSchema } from "@langchain/langgraph";
import { z } from "zod";

import type { Lens } from "src/types/lens";
import type { ChangedFile } from "src/types/pullRequest";
import { createLensAgent } from "src/graph/nodes/lens/agent";
import { findingsChannel, lensFailuresChannel } from "src/graph/state";
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
});

/**
 * Returns one lens as a node: runs the agent on one batch and reports its findings.
 */
export function createLensWorker(
    lens: Lens,
    model: BaseChatModel,
): GraphNode<typeof LensWorkerState> {
    return async (input, config) => {
        const { batch, prTitle, prDescription, changedPaths, workDir } = input;

        try {
            // Tools are bound to this review's workDir, so the agent is built per run
            const agent = createLensAgent(lens, model, createTools(workDir));
            const result = await agent.invoke(
                { batch, prTitle, prDescription, changedPaths },
                config,
            );

            return result.failed ? { lensFailures: [lens.id] } : { findings: result.findings };
        } catch (err) {
            logger.error(`Lens ${lens.id} failed`, err);
            return { lensFailures: [lens.id] };
        }
    };
}

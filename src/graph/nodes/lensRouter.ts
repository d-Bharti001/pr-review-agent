import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { Command, type GraphNode, Send, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { ENABLED_LENSES } from "src/config";
import type { ChatModel } from "src/llm/chatModel";
import type { LensId } from "src/types/lens";
import type { ChangedFile } from "src/types/pullRequest";
import { OPTIONAL_LENSES, isDocsOnly, requiredLenses } from "src/graph/utils/selectLenses";
import { ROUTER_PROMPT } from "src/graph/prompts/router";

// What `Send` hands to one router run. The key names match the lens subgraph's input.
export const RouterState = new StateSchema({
    batch: z.custom<ChangedFile[]>(),
    prTitle: z.string(),
    prDescription: z.string(),
    changedPaths: z.array(z.string()),
    workDir: z.string(),
});

const PATCH_PREVIEW_CHARS = 1500;

function buildRouterInput(state: typeof RouterState.State): string {
    const files = state.batch
        .map((f) => `### ${f.path} (${f.status})\n${f.patch.slice(0, PATCH_PREVIEW_CHARS)}`)
        .join("\n\n");

    return `<title>${state.prTitle}</title>\n<changes>\n${files}\n</changes>`;
}

async function askRouter(
    chatModel: ChatModel,
    state: typeof RouterState.State,
    candidates: LensId[],
): Promise<LensId[]> {
    const schema = z.object({
        lenses: z.array(z.enum(candidates as [LensId, ...LensId[]])),
        reason: z.string().describe("One short sentence"),
    });

    const result = await chatModel.model
        .withStructuredOutput(schema)
        .invoke([
            new SystemMessage(`${ROUTER_PROMPT}\nCandidate lenses: ${candidates.join(", ")}`),
            new HumanMessage(buildRouterInput(state)),
        ]);

    logger.info("Router reason", result.reason);
    return result.lenses;
}

/**
 * Returns `lensRouter` node: runs once per batch and picks the lenses for that batch.
 * The rules decide the required lenses; the LLM only adds optional ones.
 * Then it sends the batch to each chosen lens.
 */
export function createLensRouterNode(chatModel: ChatModel): GraphNode<typeof RouterState> {
    return async (state) => {
        const required = requiredLenses(state.batch);
        const candidates = OPTIONAL_LENSES.filter((id) => !required.includes(id));

        let chosen: LensId[] = [];
        if (candidates.length > 0 && !isDocsOnly(state.batch)) {
            try {
                chosen = await askRouter(chatModel, state, candidates);
            } catch (err) {
                logger.warn("Router failed, running all candidate lenses", err);
                chosen = candidates; // fail open: costs more, never skips a review
            }
        }

        const lenses = [...new Set([...required, ...chosen])].filter((id) =>
            ENABLED_LENSES.includes(id),
        );
        logger.info("Router chose lenses", { files: state.batch.map((f) => f.path), lenses });

        const { batch, prTitle, prDescription, changedPaths, workDir } = state;
        return new Command({
            goto: lenses.map(
                (id) => new Send(id, { batch, prTitle, prDescription, changedPaths, workDir }),
            ),
        });
    };
}

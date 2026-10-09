import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { type BaseMessage, HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
import { OutputParserException } from "@langchain/core/output_parsers";
import {
    type GraphNode,
    START,
    END,
    MessagesValue,
    ReducedValue,
    StateGraph,
    StateSchema,
} from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { z } from "zod";

import type { Lens } from "src/types/lens";
import type { ChangedFile } from "src/types/pullRequest";
import { buildBatchMessage } from "src/graph/prompts/batch";
import { REPORT_INSTRUCTION } from "src/graph/prompts/reportFindings";
import { SHARED_RULES } from "src/graph/prompts/shared";
import { findingSchema, findingsResultSchema } from "src/types/findings";

export type AgentLimits = { maxLlmCalls: number; maxTokens: number };

// Per lens run.
export const DEFAULT_LIMITS: AgentLimits = { maxLlmCalls: 12, maxTokens: 150_000 };

const sum = (a: number, b: number) => a + b;

// State for a lens agent
export const AgentState = new StateSchema({
    // input
    batch: z.custom<ChangedFile[]>(),
    prTitle: z.string(),
    prDescription: z.string(),
    changedPaths: z.array(z.string()),

    // the conversation and its counters
    messages: MessagesValue,
    llmCalls: new ReducedValue(z.number().default(0), { reducer: sum }),
    tokensUsed: new ReducedValue(z.number().default(0), { reducer: sum }),
    failed: z.boolean().default(false),

    // output
    findings: z.array(findingSchema).default(() => []),
});

function hasPendingToolCalls(messages: BaseMessage[]): boolean {
    const last = messages.at(-1);
    return last !== undefined && AIMessage.isInstance(last) && (last.tool_calls?.length ?? 0) > 0;
}

/**
 * Returns a lens agent as a graph (to be used as a subgraph in the review workflow).
 */
export function createLensAgent(
    lens: Lens,
    model: BaseChatModel,
    tools: StructuredToolInterface[],
    limits: AgentLimits = DEFAULT_LIMITS,
) {
    if (!model.bindTools) throw new Error("The chat model does not support tool calling");
    const modelWithTools = model.bindTools(tools);
    const structuredModel = model.withStructuredOutput(findingsResultSchema);

    // Builds the first messages of the conversation from the input
    const initMessages: GraphNode<typeof AgentState> = (state) => ({
        messages: [
            new SystemMessage(`${lens.systemPrompt}\n\n${SHARED_RULES}`),
            new HumanMessage(
                buildBatchMessage({
                    title: state.prTitle,
                    description: state.prDescription,
                    allPaths: state.changedPaths,
                    batch: state.batch,
                }),
            ),
        ],
    });

    const llmCall: GraphNode<typeof AgentState> = async (state) => {
        try {
            const response = await modelWithTools.invoke(state.messages);
            return {
                messages: [response],
                llmCalls: 1,
                tokensUsed: response.usage_metadata?.total_tokens ?? 0,
            };
        } catch (err) {
            logger.error(`Lens ${lens.id} model call failed`, err);
            return { failed: true };
        }
    };

    const limitReached = (state: typeof AgentState.State) =>
        state.llmCalls >= limits.maxLlmCalls || state.tokensUsed >= limits.maxTokens;

    // The loop decision: run the tools, write the report,
    // or stop because the model call failed or the limit reached
    const route = (state: typeof AgentState.State): "toolNode" | "report" | typeof END => {
        if (state.failed) return END;
        return hasPendingToolCalls(state.messages) && !limitReached(state) ? "toolNode" : "report";
    };

    const report: GraphNode<typeof AgentState> = async (state) => {
        // After a limit stop, the last AI message has tool calls with no results.
        // Providers reject that, so drop it before asking for the final answer.
        const unresolved = hasPendingToolCalls(state.messages);
        const history = unresolved ? state.messages.slice(0, -1) : state.messages;
        const stopReason = !unresolved
            ? "completed"
            : state.llmCalls >= limits.maxLlmCalls
              ? "step limit"
              : "token budget";

        const messages: BaseMessage[] = [...history, new HumanMessage(REPORT_INSTRUCTION)];

        // One retry with the error message if the structured output is invalid
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const result = await structuredModel.invoke(messages);
                logger.info(`Lens ${lens.id} finished`, {
                    findings: result.findings.length,
                    llmCalls: state.llmCalls,
                    tokens: state.tokensUsed,
                    stopReason,
                });
                return { findings: result.findings };
            } catch (err) {
                const invalidOutput =
                    err instanceof OutputParserException || err instanceof z.ZodError;
                if (!invalidOutput) {
                    logger.error(`Lens ${lens.id} report failed`, err);
                    return { failed: true };
                }

                logger.warn(
                    `Invalid structured output by lens ${lens.id} (attempt ${attempt})`,
                    err,
                );
                messages.push(
                    new HumanMessage(
                        `Your previous answer was not valid: ${err.message}. Return the findings again in the required structure.`,
                    ),
                );
            }
        }

        return { findings: [] }; // still invalid after the retry: no findings from this run
    };

    return new StateGraph(AgentState)
        .addNode("initMessages", initMessages)
        .addNode("llmCall", llmCall)
        .addNode("toolNode", new ToolNode(tools))
        .addNode("report", report)
        .addEdge(START, "initMessages")
        .addEdge("initMessages", "llmCall")
        .addConditionalEdges("llmCall", route, ["toolNode", "report", END])
        .addEdge("toolNode", "llmCall")
        .addEdge("report", END)
        .compile();
}

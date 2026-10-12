import type { StructuredToolInterface } from "@langchain/core/tools";
import { type BaseMessage, HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages";
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

import type { ChatModel } from "src/llm/chatModel";
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
    chatModel: ChatModel,
    tools: StructuredToolInterface[],
    limits: AgentLimits = DEFAULT_LIMITS,
) {
    if (!chatModel.model.bindTools) throw new Error("The chat model does not support tool calling");
    const modelWithTools = chatModel.model.bindTools(tools);
    const structuredModel = chatModel.model.withStructuredOutput(findingsResultSchema, {
        includeRaw: true,
    });

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

        // One retry if the structured output is invalid
        let reportCalls = 0;
        let reportTokens = 0;

        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                const { raw, parsed } = await structuredModel.invoke(messages);
                reportCalls += 1;
                reportTokens += (raw as AIMessage).usage_metadata?.total_tokens ?? 0;

                if (parsed) {
                    logger.info(`Lens ${lens.id} finished`, {
                        findings: parsed.findings.length,
                        llmCalls: state.llmCalls + reportCalls,
                        tokens: state.tokensUsed + reportTokens,
                        stopReason,
                    });
                    return {
                        findings: parsed.findings,
                        llmCalls: reportCalls,
                        tokensUsed: reportTokens,
                    };
                }

                logger.warn(`Invalid structured output by lens ${lens.id} (attempt ${attempt})`);
                messages.push(
                    new HumanMessage(
                        "Your previous answer was not valid. Return the findings again in the required structure.",
                    ),
                );
            } catch (err) {
                logger.error(`Lens ${lens.id} report failed`, err);
                return { failed: true, llmCalls: reportCalls, tokensUsed: reportTokens };
            }
        }

        // still invalid after the retry: no findings from this run
        return { findings: [], llmCalls: reportCalls, tokensUsed: reportTokens };
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

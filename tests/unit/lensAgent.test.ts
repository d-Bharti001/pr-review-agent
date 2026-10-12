import { AIMessage, type BaseMessage, ToolMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createLensAgent, type AgentLimits } from "src/graph/nodes/lens/agent";
import type { ChatModel } from "src/llm/chatModel";
import type { Finding } from "src/types/findings";
import type { Lens } from "src/types/lens";

// The code uses a global logger (set up by src/utils/logger)
beforeAll(() => {
    vi.stubGlobal("logger", { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
});

const lens: Lens = { id: "quality", systemPrompt: "You are a reviewer." };

const finding: Finding = {
    category: "quality",
    severity: "high",
    locations: [{ file: "src/a.ts", startLine: 3, endLine: 4 }],
    title: "Off by one",
    message: "The loop skips the last item.",
    suggestion: "Use <= instead of <.",
};

const input = {
    batch: [{ path: "src/a.ts", status: "modified", patch: "@@ -1 +1 @@\n+x" }],
    prTitle: "Change a",
    prDescription: "",
    changedPaths: ["src/a.ts"],
};

// An AI message that asks for the read_file tool. Its token usage is 10.
const toolCallMessage = () =>
    new AIMessage({
        content: "",
        tool_calls: [{ name: "read_file", args: { path: "src/a.ts" }, id: "call_1" }],
        usage_metadata: { input_tokens: 6, output_tokens: 4, total_tokens: 10 },
    });

// An AI message with no tool calls: the model is done exploring. Its token usage is 10.
const doneMessage = () =>
    new AIMessage({
        content: "I have seen enough.",
        usage_metadata: { input_tokens: 6, output_tokens: 4, total_tokens: 10 },
    });

type Report = { parsed: { findings: Finding[] } | null; tokens?: number };

/**
 * A scripted chat model. `turns` are the answers of the tool-calling model, in order
 * (an Error is thrown instead). `reports` are the structured-output answers, in order.
 * It records the messages sent to each report call.
 */
function scriptedModel(turns: (AIMessage | Error)[], reports: Report[]) {
    let turn = 0;
    let report = 0;
    const reportInputs: BaseMessage[][] = [];

    const chatModel = {
        name: "fake-model",
        provider: "fake-provider",
        model: {
            bindTools: () => ({
                invoke: async () => {
                    const next = turns[turn++];
                    if (next instanceof Error) throw next;
                    return next;
                },
            }),
            withStructuredOutput: () => ({
                invoke: async (messages: BaseMessage[]) => {
                    reportInputs.push([...messages]);
                    const next = reports[report++];
                    return {
                        raw: new AIMessage({
                            content: "",
                            usage_metadata: {
                                input_tokens: 0,
                                output_tokens: 0,
                                total_tokens: next.tokens ?? 7,
                            },
                        }),
                        parsed: next.parsed,
                    };
                },
            }),
        },
    } as unknown as ChatModel;

    return { chatModel, reportInputs };
}

function makeAgent(chatModel: ChatModel, limits?: AgentLimits) {
    const readFile = vi.fn(async ({ path }: { path: string }) => `contents of ${path}`);
    const readFileTool = tool(readFile, {
        name: "read_file",
        description: "Read a file",
        schema: z.object({ path: z.string() }),
    });

    return { agent: createLensAgent(lens, chatModel, [readFileTool], limits), readFile };
}

describe("lens agent", () => {
    it("runs the requested tool, reports findings, and counts every call and token", async () => {
        const { chatModel, reportInputs } = scriptedModel(
            [toolCallMessage(), doneMessage()],
            [{ parsed: { findings: [finding] }, tokens: 7 }],
        );
        const { agent, readFile } = makeAgent(chatModel);

        const result = await agent.invoke(input);

        expect(readFile).toHaveBeenCalledTimes(1);
        const toolResult = reportInputs[0].find((m) => ToolMessage.isInstance(m));
        expect(toolResult?.content).toBe("contents of src/a.ts");
        expect(result.findings).toEqual([finding]);
        expect(result.failed).toBe(false);
        expect(result.llmCalls).toBe(3); // two tool-loop calls + the report
        expect(result.tokensUsed).toBe(27); // 10 + 10 + 7
    });

    it("retries once when the structured output is invalid, and counts both report calls", async () => {
        const { chatModel } = scriptedModel(
            [doneMessage()],
            [{ parsed: null, tokens: 5 }, { parsed: { findings: [finding] }, tokens: 6 }],
        );
        const { agent } = makeAgent(chatModel);

        const result = await agent.invoke(input);

        expect(result.findings).toEqual([finding]);
        expect(result.llmCalls).toBe(3); // 1 tool-loop call + 2 report calls
        expect(result.tokensUsed).toBe(21); // 10 + 5 + 6
    });

    it("marks the run failed when a model call throws", async () => {
        const { chatModel } = scriptedModel([new Error("model down")], []);
        const { agent } = makeAgent(chatModel);

        const result = await agent.invoke(input);

        expect(result.failed).toBe(true);
        expect(result.findings).toEqual([]);
    });

    it("stops the tool loop at the limit and still reports, without the unanswered tool call", async () => {
        const { chatModel, reportInputs } = scriptedModel(
            [toolCallMessage()],
            [{ parsed: { findings: [finding] } }],
        );
        const { agent, readFile } = makeAgent(chatModel, { maxLlmCalls: 1, maxTokens: 1e9 });

        const result = await agent.invoke(input);

        expect(readFile).not.toHaveBeenCalled();
        expect(result.findings).toEqual([finding]);
        // Providers reject a tool call with no result, so it must be dropped
        const unresolved = reportInputs[0].filter(
            (m) => AIMessage.isInstance(m) && (m.tool_calls?.length ?? 0) > 0,
        );
        expect(unresolved).toHaveLength(0);
    });
});

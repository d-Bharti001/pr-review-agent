import { beforeAll, describe, expect, it, vi } from "vitest";
import { createMergeNode } from "src/graph/nodes/merge";
import type { ChatModel } from "src/llm/chatModel";
import type { StoredFinding } from "src/types/findings";

// The code uses a global logger (set up by src/utils/logger)
beforeAll(() => {
    vi.stubGlobal("logger", { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
});

const finding = (title: string, severity: StoredFinding["severity"]): StoredFinding => ({
    category: "quality",
    severity,
    locations: [],
    title,
    message: `${title} message`,
    suggestion: "",
    model: "m",
    provider: "p",
});

// A chat model whose structured-output call returns a scripted result or throws
function fakeChatModel(script: { groups: number[][] } | Error) {
    return {
        name: "fake-model",
        provider: "fake-provider",
        model: {
            withStructuredOutput: () => ({
                invoke: async () => {
                    if (script instanceof Error) throw script;
                    return { raw: { usage_metadata: { total_tokens: 42 } }, parsed: script };
                },
            }),
        },
    } as unknown as ChatModel;
}

async function runMerge(chatModel: ChatModel, findings: StoredFinding[]) {
    const result = await createMergeNode(chatModel)({ findings } as never, {} as never);
    return result as { mergedFindings: StoredFinding[] };
}

describe("merge node", () => {
    it("drops duplicates, keeping the most severe finding of each group, sorted by severity", async () => {
        const { mergedFindings } = await runMerge(fakeChatModel({ groups: [[0, 1]] }), [
            finding("Low copy", "low"),
            finding("High copy", "high"),
            finding("Critical", "critical"),
        ]);

        expect(mergedFindings.map((f) => f.title)).toEqual(["Critical", "High copy"]);
    });

    it("keeps all findings, sorted, when the model call fails", async () => {
        const { mergedFindings } = await runMerge(fakeChatModel(new Error("model down")), [
            finding("low", "low"),
            finding("high", "high"),
        ]);

        expect(mergedFindings.map((f) => f.title)).toEqual(["high", "low"]);
    });
});

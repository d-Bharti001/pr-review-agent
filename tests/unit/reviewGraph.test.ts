import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { buildGraph } from "src/graph";
import { post } from "src/graph/nodes/post";
import { save } from "src/graph/nodes/save";
import { staleCheck } from "src/graph/nodes/staleCheck";
import { qualityLens, securityLens, testsLens } from "src/graph/prompts/lenses";
import type { ChatModel } from "src/llm/chatModel";
import type { Finding } from "src/types/findings";

// The graph runs for real: chunk, lensRouter, the lens agents, merge and the reducers.
// Only the nodes that talk to GitHub or the database are replaced.
vi.mock("src/config", () => ({
    BATCH_TOKEN_BUDGET: 30000,
    ENABLED_LENSES: ["security", "quality", "tests"],
}));
vi.mock("src/graph/nodes/prepare", () => ({
    prepare: vi.fn(async () => ({
        title: "Add query",
        description: "",
        files: [{ path: "src/a.ts", status: "modified", patch: "@@ -1 +1 @@\n+x" }],
        skippedFiles: [],
    })),
}));
vi.mock("src/graph/nodes/staleCheck", () => ({ staleCheck: vi.fn(async () => ({})) }));
vi.mock("src/graph/nodes/post", () => ({ post: vi.fn(async () => ({})) }));
vi.mock("src/graph/nodes/save", () => ({ save: vi.fn(async () => ({})) }));

beforeAll(() => {
    vi.stubGlobal("logger", { info: vi.fn(), warn: vi.fn(), error: vi.fn() });
});

beforeEach(() => {
    vi.mocked(post).mockClear();
    vi.mocked(save).mockClear();
});

const job = {
    installationId: 1,
    owner: "acme",
    repo: "app",
    prNumber: 5,
    headSha: "sha1",
    deliveryId: "d-1",
    workDir: "/tmp/unused",
};

const finding = (category: Finding["category"], severity: Finding["severity"], title: string) => ({
    category,
    severity,
    locations: [{ file: "src/a.ts", startLine: 1, endLine: 1 }],
    title,
    message: `${title} message`,
    suggestion: "",
});

// What each lens reports. quality and security report the same issue.
const LENS_FINDINGS: Record<string, Finding[]> = {
    quality: [finding("quality", "medium", "SQL injection")],
    security: [finding("security", "critical", "SQL injection")],
    tests: [finding("tests", "low", "No test for the query")],
};

const usage = { input_tokens: 1, output_tokens: 1, total_tokens: 10 };

/**
 * A fake chat model that answers by what is asked: the router picks the tests lens,
 * each lens reports its findings, and the merge groups the "SQL injection" duplicates.
 * `failLens` makes the tool-calling model of that lens throw.
 */
function fakeChatModel(failLens?: string) {
    const lensOf = (messages: BaseMessage[]) =>
        [qualityLens, securityLens, testsLens].find((l) =>
            String(messages[0].content).startsWith(l.systemPrompt),
        );

    return {
        name: "fake-model",
        provider: "fake-provider",
        model: {
            bindTools: () => ({
                invoke: async (messages: BaseMessage[]) => {
                    if (lensOf(messages)?.id === failLens) throw new Error("model down");
                    return new AIMessage({ content: "done", usage_metadata: usage });
                },
            }),
            withStructuredOutput: (schema: { shape: Record<string, unknown> }) => ({
                invoke: async (messages: BaseMessage[]) => {
                    const raw = new AIMessage({ content: "", usage_metadata: usage });
                    const keys = Object.keys(schema.shape);

                    if (keys.includes("lenses")) {
                        return { raw, parsed: { lenses: ["tests"], reason: "adds a query" } };
                    }
                    if (keys.includes("groups")) {
                        const lines = String(messages[1].content).split("\n");
                        const duplicates = lines
                            .map((line, i) => (line.includes("SQL injection") ? i : -1))
                            .filter((i) => i >= 0);
                        return { raw, parsed: { groups: [duplicates] } };
                    }
                    return { raw, parsed: { findings: LENS_FINDINGS[lensOf(messages)!.id] } };
                },
            }),
        },
    } as unknown as ChatModel;
}

describe("review graph", () => {
    it("runs the router, the lenses and merge, and hands the merged result to post and save", async () => {
        const result = await buildGraph(fakeChatModel()).invoke(job);

        // quality and security are required for a source file; the router added tests
        expect([...result.lensRuns].sort()).toEqual(["quality", "security", "tests"]);
        expect(result.lensFailures).toEqual([]);

        // the duplicate is merged to the most severe copy, and the result is sorted by severity
        expect(result.mergedFindings.map((f) => `${f.severity}: ${f.title}`)).toEqual([
            "critical: SQL injection",
            "low: No test for the query",
        ]);
        expect(result.mergedFindings[0]).toMatchObject({
            model: "fake-model",
            provider: "fake-provider",
        });

        // one usage record for each router, lens and merge run
        expect(result.usage.map((u) => u.pipelineStep).sort()).toEqual([
            "lensRouter",
            "merge",
            "quality",
            "security",
            "tests",
        ]);

        expect(post).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("keeps going when a lens fails, and records the failure", async () => {
        const result = await buildGraph(fakeChatModel("security")).invoke(job);

        expect(result.lensFailures).toEqual(["security"]);
        expect(result.lensRuns).toHaveLength(3);
        expect(result.mergedFindings.map((f) => f.title).sort()).toEqual([
            "No test for the query",
            "SQL injection",
        ]);
        expect(post).toHaveBeenCalledTimes(1);
        expect(save).toHaveBeenCalledTimes(1);
    });

    it("drops the result without posting or saving when the PR moved on during the review", async () => {
        vi.mocked(staleCheck).mockResolvedValueOnce({ stale: true });

        const result = await buildGraph(fakeChatModel()).invoke(job);

        expect(result.stale).toBe(true);
        expect(post).not.toHaveBeenCalled();
        expect(save).not.toHaveBeenCalled();
    });
});

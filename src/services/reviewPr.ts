import { rm } from "node:fs/promises";
import { createWorkDir } from "src/github/checkout";
import { buildGraph } from "src/graph";
import { ChatModel } from "src/llm/chatModel";
import type { ReviewJob } from "src/types/review";
import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_PROVIDER } from "src/config";

const graph = buildGraph(
    new ChatModel({
        llmModelName: LLM_MODEL,
        llmProvider: LLM_PROVIDER,
        baseUrl: LLM_BASE_URL,
        apiKey: LLM_API_KEY,
    }),
);

export async function reviewPullRequest(job: ReviewJob) {
    const workDir = await createWorkDir();

    try {
        const result = await graph.invoke(
            { ...job, workDir },
            { recursionLimit: 100, maxConcurrency: 3 },
        );

        logger.info("Review finished", {
            repo: job.repo,
            prNumber: job.prNumber,
            stale: result.stale,
            findings: result.mergedFindings.length,
            failedLenses: result.lensFailures,
            skippedFiles: result.skippedFiles.length,
        });
    } finally {
        await rm(workDir, { recursive: true, force: true });
    }
}

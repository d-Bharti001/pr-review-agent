import { rm } from "node:fs/promises";
import { createWorkDir } from "src/github/checkout";
import { buildGraph } from "src/graph";
import { createChatModel } from "src/llm/chatModel";
import type { ReviewJob } from "src/types/review";

const graph = buildGraph(createChatModel());

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

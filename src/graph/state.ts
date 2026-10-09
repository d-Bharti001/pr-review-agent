import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { findingSchema } from "src/types/findings";
import type { ChangedFile } from "src/types/pullRequest";

const concat = <T>(a: T[], b: T[]) => a.concat(b);

// The lens workers write these two keys back to the review state
export const findingsChannel = () =>
    new ReducedValue(
        z.array(findingSchema).default(() => []),
        { reducer: concat },
    );

export const lensFailuresChannel = () =>
    new ReducedValue(
        z.array(z.string()).default(() => []),
        { reducer: concat },
    );

// State for the PR Review pipeline
export const ReviewState = new StateSchema({
    // job input
    installationId: z.number(),
    owner: z.string(),
    repo: z.string(),
    prNumber: z.number(),
    headSha: z.string(),
    deliveryId: z.string(),
    workDir: z.string(),

    // set by the `prepare` node
    title: z.string().default(""),
    description: z.string().default(""),
    files: z.custom<ChangedFile[]>().default(() => []),
    skippedFiles: z.array(z.string()).default(() => []),
    stale: z.boolean().default(false), // the PR moved on since this job was queued

    // set by the `chunk` node
    batches: z.custom<ChangedFile[][]>().default(() => []),

    // set by the lens subgraphs (reducers: concatenate)
    findings: findingsChannel(),
    lensFailures: lensFailuresChannel(),

    // set by the `merge` node
    mergedFindings: z.array(findingSchema).default(() => []),
});

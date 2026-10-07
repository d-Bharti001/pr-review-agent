import { ReducedValue, StateSchema } from "@langchain/langgraph";
import { z } from "zod";
import { findingSchema } from "src/types/findings";
import type { ChangedFile } from "src/types/pullRequest";

const concat = <T>(a: T[], b: T[]) => a.concat(b);

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

    // set by the lens workers (`security`, `quality`, `tests`) (reducers: concatenate)
    findings: new ReducedValue(
        z.array(findingSchema).default(() => []),
        { reducer: concat },
    ),
    lensFailures: new ReducedValue(
        z.array(z.string()).default(() => []),
        { reducer: concat },
    ),
});

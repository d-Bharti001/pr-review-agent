import type { GraphNode } from "@langchain/langgraph";
import { BATCH_TOKEN_BUDGET } from "src/config";
import type { ReviewState } from "src/graph/state";
import { buildBatchMessage } from "src/graph/prompts/batch";
import type { ChangedFile } from "src/types/pullRequest";
import { estimateTokens } from "src/graph/utils/tokens";

const PER_FILE_OVERHEAD = 10; // the "### path (status)" line from buildBatchMessage()

const fileTokens = (file: ChangedFile) =>
    estimateTokens(file.patch) + estimateTokens(file.path) + PER_FILE_OVERHEAD;

// Splits one oversized file into parts that each fit the budget, cutting between hunks
function splitFileByHunk(file: ChangedFile, budget: number): ChangedFile[] {
    const hunks = file.patch.split(/\n(?=@@ )/);
    const parts: string[] = [];
    let current: string[] = [];
    let currentTokens = 0;

    const flush = () => {
        if (current.length === 0) return;
        parts.push(current.join("\n"));
        current = [];
        currentTokens = 0;
    };

    for (let hunk of hunks) {
        let tokens = estimateTokens(hunk);

        // A single hunk larger than a whole batch: keep its beginning
        if (tokens > budget) {
            hunk = `${hunk.slice(0, budget * 4)}\n[rest of this hunk omitted: too large]`;
            tokens = budget;
        }
        if (currentTokens + tokens > budget) flush();

        current.push(hunk);
        currentTokens += tokens;
    }
    flush();

    return parts.map((patch, i) => ({
        ...file,
        patch:
            parts.length > 1
                ? `[part ${i + 1} of ${parts.length} of this file's changes]\n${patch}`
                : patch,
    }));
}

/**
 * `chunk` node: groups the files into batches that each fit the token budget.
 *
 * Reads: title, description, files.
 * Writes: batches.
 *
 * Every lens reviews every batch.
 */
export const chunk: GraphNode<typeof ReviewState> = (state) => {
    if (state.files.length === 0) return { batches: [] };

    // The header is repeated in every batch, so it is part of each batch's cost
    const header = buildBatchMessage({
        title: state.title,
        description: state.description,
        allPaths: state.files.map((f) => f.path),
        batch: [],
    });
    const available = Math.max(
        BATCH_TOKEN_BUDGET - estimateTokens(header),
        Math.floor(BATCH_TOKEN_BUDGET / 2),
    );

    const batches: ChangedFile[][] = [];
    let current: ChangedFile[] = [];
    let currentTokens = 0;

    for (const file of state.files) {
        const pieces = fileTokens(file) > available ? splitFileByHunk(file, available) : [file];

        for (const piece of pieces) {
            const tokens = fileTokens(piece);

            if (currentTokens + tokens > available && current.length > 0) {
                batches.push(current);
                current = [];
                currentTokens = 0;
            }
            current.push(piece);
            currentTokens += tokens;
        }
    }
    if (current.length > 0) batches.push(current);

    logger.info("Chunked the diff", {
        files: state.files.length,
        batches: batches.length,
        token_budget: BATCH_TOKEN_BUDGET,
    });

    return { batches };
};

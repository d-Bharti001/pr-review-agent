import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { GraphNode } from "@langchain/langgraph";
import { z } from "zod";

import type { ChatModel } from "src/llm/chatModel";
import type { ReviewState } from "src/graph/state";
import { type Finding, SEVERITY_ORDER } from "src/types/findings";
import { MERGE_PROMPT } from "src/graph/prompts/merge";

const mergeSchema = z.object({
    // Each inner array is one group of duplicates: the indexes of findings (from the numbered
    // list sent to the model) that describe the same underlying issue.
    groups: z
        .array(z.array(z.number().int()))
        .describe("Groups of indexes of findings that describe the same issue."),
});

const rank = (f: Finding) => SEVERITY_ORDER.indexOf(f.severity);

function describe(f: Finding, index: number): string {
    const where = f.locations.map((l) => `${l.file}:${l.startLine}-${l.endLine}`).join(", ");
    return `[${index}] ${f.severity} ${f.category}: ${f.title} - ${f.message} (${where || "no location"})`;
}

/**
 * Returns `merge` node: removes duplicate findings and sorts the rest by severity.
 * Reads: findings.
 * Writes: mergedFindings.
 */
export function createMergeNode(chatModel: ChatModel): GraphNode<typeof ReviewState> {
    return async (state) => {
        const findings = state.findings;
        let kept = findings;

        if (findings.length > 1) {
            try {
                const { groups } = await chatModel.model
                    .withStructuredOutput(mergeSchema)
                    .invoke([
                        new SystemMessage(MERGE_PROMPT),
                        new HumanMessage(findings.map(describe).join("\n")),
                    ]);

                const seen = new Set<number>();
                const dropped = new Set<number>();

                for (const group of groups) {
                    const ids = [...new Set(group)].filter(
                        (i) => i >= 0 && i < findings.length && !seen.has(i),
                    );
                    if (ids.length < 2) continue;

                    ids.forEach((i) => seen.add(i));
                    // Keep the most severe finding of the group
                    const best = ids.reduce((a, b) =>
                        rank(findings[a]) < rank(findings[b]) ? a : b,
                    );
                    ids.filter((i) => i !== best).forEach((i) => dropped.add(i));
                }

                kept = findings.filter((_, i) => !dropped.has(i));
            } catch (err) {
                logger.warn("Merge failed, keeping all findings", err);
            }
        }

        return { mergedFindings: [...kept].sort((a, b) => rank(a) - rank(b)) };
    };
}

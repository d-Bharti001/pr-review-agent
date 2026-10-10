import { START, END, Send, StateGraph } from "@langchain/langgraph";

import type { ChatModel } from "src/llm/chatModel";
import { ReviewState } from "src/graph/state";
import { prepare } from "src/graph/nodes/prepare";
import { chunk } from "src/graph/nodes/chunk";
import { createLensRouterNode } from "src/graph/nodes/lensRouter";
import { qualityLens, securityLens, testsLens } from "src/graph/prompts/lenses";
import { createLensWorker } from "src/graph/nodes/lens/worker";
import { createMergeNode } from "src/graph/nodes/merge";
import { post } from "src/graph/nodes/post";
import { save } from "src/graph/nodes/save";
import { staleCheck } from "src/graph/nodes/staleCheck";

const retry = { retryPolicy: { maxAttempts: 3 } };

export function buildGraph(chatModel: ChatModel) {
    return (
        new StateGraph(ReviewState)
            .addNode("prepare", prepare, retry)
            .addNode("chunk", chunk)
            .addNode("lensRouter", createLensRouterNode(chatModel), {
                ends: ["security", "quality", "tests"],
            })
            .addNode("security", createLensWorker(securityLens, chatModel))
            .addNode("quality", createLensWorker(qualityLens, chatModel))
            .addNode("tests", createLensWorker(testsLens, chatModel))
            .addNode("merge", createMergeNode(chatModel))
            .addNode("staleCheck", staleCheck, retry)
            .addNode("post", post, retry)
            .addNode("save", save, retry)
            .addEdge(START, "prepare")
            .addConditionalEdges("prepare", (state) => (state.stale ? END : "chunk"), [
                "chunk",
                END,
            ])
            .addConditionalEdges(
                "chunk",
                (state) =>
                    state.batches.length > 0
                        ? state.batches.map(
                              (batch) =>
                                  new Send("lensRouter", {
                                      batch,
                                      prTitle: state.title,
                                      prDescription: state.description,
                                      changedPaths: state.files.map((f) => f.path),
                                      workDir: state.workDir,
                                  }),
                          )
                        : "merge", // nothing to review (all files skipped): still post the note
                ["lensRouter", "merge"],
            )
            // One plain edge per lens (not an array): a lens the router skipped must not block merge
            .addEdge("security", "merge")
            .addEdge("quality", "merge")
            .addEdge("tests", "merge")
            .addEdge("merge", "staleCheck")
            .addConditionalEdges("staleCheck", (state) => (state.stale ? END : "post"), [
                "post",
                END,
            ])
            .addEdge("post", "save")
            .addEdge("save", END)
            .compile()
    );
}

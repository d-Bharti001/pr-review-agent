import { START, END, StateGraph } from "@langchain/langgraph";
import { prepare } from "src/graph/nodes/prepare";
import { ReviewState } from "src/graph/state";

export const graph = new StateGraph(ReviewState)
    .addNode("prepare", prepare)
    .addEdge(START, "prepare")
    .addEdge("prepare", END)
    .compile();

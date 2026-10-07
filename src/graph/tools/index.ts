import { createReadFileTool } from "src/graph/tools/readFile";
import { createSearchCodeTool } from "src/graph/tools/searchCode";

export function createTools(workDir: string) {
    return [createSearchCodeTool(workDir), createReadFileTool(workDir)];
}

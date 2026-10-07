import path from "node:path";
import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { tool } from "@langchain/core/tools";
import { resolveInside } from "src/utils/paths";

const DEFAULT_LINES_LIMIT = 200;
const MAX_LINES_LIMIT = 500;
const MAX_FILE_BYTES = 1_000_000;

// Tool errors are returned as text so the model can read them and try something else
function describeError(err: unknown, filePath: string, ref: string): string {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return `Error: ${filePath} does not exist at ref "${ref}". If the PR deleted or renamed it, try ref "base".`;
    }
    return `Error: ${err instanceof Error ? err.message : String(err)}`;
}

export function createReadFileTool(workDir: string) {
    return tool(
        async ({ path: filePath, ref, offset, limit }) => {
            const version = ref ?? "head";

            try {
                if (filePath.split(/[\\/]/)[0] === ".git") return "Error: .git is not readable";

                const fullPath = await resolveInside(path.join(workDir, version), filePath);
                const info = await stat(fullPath);
                if (!info.isFile()) return "Error: not a file";
                if (info.size > MAX_FILE_BYTES) {
                    return `Error: file is too large (${info.size} bytes). Use search_code instead.`;
                }

                const content = await readFile(fullPath, "utf8");
                if (content.includes("\0")) return "Error: binary file";

                const lines = content.split("\n");
                if (lines.at(-1) === "") lines.pop(); // trailing newline

                const start = Math.max(1, offset ?? 1);
                const slice = lines.slice(
                    start - 1,
                    start - 1 + Math.min(limit ?? DEFAULT_LINES_LIMIT, MAX_LINES_LIMIT),
                );
                if (slice.length === 0) {
                    return `Error: offset ${start} is past the end of the file (${lines.length} lines)`;
                }

                const numbered = slice
                    .map((line, i) => `${String(start + i).padStart(5)}  ${line}`)
                    .join("\n");

                return `${numbered}\n[lines ${start}-${start + slice.length - 1} of ${lines.length}]`;
            } catch (err) {
                return describeError(err, filePath, version);
            }
        },
        {
            name: "read_file",
            description:
                'Read a file from the repository with line numbers. ref "head" is the file after the PR, ' +
                'ref "base" is the file before the PR (use it for deleted or renamed files). ' +
                'Line numbers from ref "base" are for the old file; do not cite them as locations. ' +
                'The line numbers from ref "head" are the ones to cite in findings. ' +
                `Returns up to ${MAX_LINES_LIMIT} lines per call; use offset to continue.`,
            schema: z.object({
                path: z.string().describe("Path relative to the repository root"),
                ref: z.enum(["base", "head"]).optional().describe('Defaults to "head"'),
                offset: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe("First line to read, 1-based"),
                limit: z
                    .number()
                    .int()
                    .positive()
                    .optional()
                    .describe(
                        `Number of lines, default ${DEFAULT_LINES_LIMIT}, max ${MAX_LINES_LIMIT}`,
                    ),
            }),
        },
    );
}

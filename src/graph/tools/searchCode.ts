import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { z } from "zod";
import { tool } from "@langchain/core/tools";

const run = promisify(execFile);

const MAX_RESULT_LINES = 60;

export function createSearchCodeTool(workDir: string) {
    return tool(
        async ({ pattern, glob, ref }) => {
            const version = ref ?? "head";

            const args = [
                "--no-config",
                "--line-number",
                "--no-heading",
                "--color=never",
                "--hidden",
                "--glob=!.git",
                "--max-count=5", // per file
                "--max-columns=300",
                "--max-columns-preview",
            ];

            if (glob) args.push(`--glob=${glob}`);

            // `=` forms keep model-provided text from being read as flags.
            // The explicit "." stops rg from reading stdin.
            args.push(`--regexp=${pattern}`, "--", ".");

            try {
                const { stdout } = await run("rg", args, {
                    cwd: path.join(workDir, version),
                    timeout: 10_000,
                    maxBuffer: 1_000_000,
                    env: { PATH: process.env.PATH },
                });

                const lines = stdout.replace(/^\.\//gm, "").split("\n").filter(Boolean);
                const shown = lines.slice(0, MAX_RESULT_LINES).join("\n");

                return lines.length > MAX_RESULT_LINES
                    ? `${shown}\n[showing ${MAX_RESULT_LINES} of ${lines.length} matches; narrow the pattern or glob]`
                    : shown;
            } catch (err) {
                const e = err as { code?: number | string; stderr?: string; message: string };
                if (e.code === 1) return "No matches found.";
                return `Error: ${e.stderr?.trim() || e.message}`;
            }
        },
        {
            name: "search_code",
            description:
                "Search the repository with a regular expression (ripgrep). " +
                'ref "head" (default) searches the files after the PR, ref "base" searches them before the PR ' +
                "(use it to find code that the PR removed or changed). " +
                'Line numbers from ref "base" are for the old file; do not cite them as locations. ' +
                "Returns lines as path:line:text, at most 5 per file.",
            schema: z.object({
                pattern: z.string().describe("Regular expression to search for"),
                glob: z
                    .string()
                    .optional()
                    .describe('Limit to matching files, e.g. "*.ts" or "docs/**"'),
                ref: z.enum(["base", "head"]).optional().describe('Defaults to "head"'),
            }),
        },
    );
}

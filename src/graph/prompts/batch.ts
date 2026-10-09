import type { ChangedFile } from "src/types/pullRequest";

const MAX_DESCRIPTION_CHARS = 4000;

export function buildBatchMessage(input: {
    title: string;
    description: string;
    allPaths: string[];
    batch: ChangedFile[];
}): string {
    const header = [
        "<pull_request>",
        `<title>${input.title}</title>`,
        `<description>\n${input.description.slice(0, MAX_DESCRIPTION_CHARS)}\n</description>`,
        `<changed_files>\n${input.allPaths.join("\n")}\n</changed_files>`,
        `</pull_request>`,
    ].join("\n");

    const diff = input.batch
        .map((f) => {
            const renamed = f.previousPath ? `, renamed from ${f.previousPath}` : "";
            return `### ${f.path} (${f.status}${renamed})\n${f.patch}`;
        })
        .join("\n\n");

    return `${header}\n\n<diff>\n${diff}\n</diff>`;
}

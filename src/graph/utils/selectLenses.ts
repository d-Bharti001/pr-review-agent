import type { LensId } from "src/types/lens";

type FileKind = "docs" | "test" | "source" | "config";

const TEST = [
    /(^|\/)(__tests__|tests?|spec)\//i,
    /\.(test|spec)\.[a-z]+$/i,
    /_test\.(go|py|rb)$/,
    /(^|\/)test_[^/]+\.py$/,
];
const DOCS = [/\.(md|mdx|rst|adoc|txt)$/i, /(^|\/)docs?\//i];
const SOURCE =
    /\.(ts|tsx|js|jsx|mjs|cjs|py|go|java|kt|rb|rs|cs|php|swift|c|cc|cpp|h|hpp|scala|sql|sh)$/i;

export function classifyFile(path: string): FileKind {
    if (TEST.some((p) => p.test(path))) return "test";
    if (DOCS.some((p) => p.test(path))) return "docs";
    if (SOURCE.test(path)) return "source";
    return "config"; // json, yaml, toml, Dockerfile, CI files, ...
}

export const OPTIONAL_LENSES: LensId[] = ["security", "tests"];

// Lenses that always run for these files. The LLM cannot remove them.
export function requiredLenses(files: { path: string }[]): LensId[] {
    const kinds = new Set(files.map((f) => classifyFile(f.path)));
    const required: LensId[] = ["quality"];

    if (kinds.has("source") || kinds.has("config")) required.push("security");

    return required;
}

export function isDocsOnly(files: { path: string }[]): boolean {
    return files.every((f) => classifyFile(f.path) === "docs");
}

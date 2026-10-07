import type { Category, Finding, Location, Severity } from "src/types/findings";
import { SEVERITY_ORDER } from "src/types/findings";

const SEVERITY_HEADINGS: Record<Severity, string> = {
    critical: "Critical",
    high: "High",
    medium: "Medium",
    low: "Low",
    info: "Info",
};

const CATEGORY_LABELS: Record<Category, string> = {
    security: "Security",
    quality: "Quality",
    tests: "Tests",
    docs: "Docs",
};

export type RenderCommentArgs = {
    findings: Finding[];
    owner: string;
    repo: string;
    headSha: string;
    skippedFiles?: string[];
    failedLenses?: string[];
};

export function buildPermalink(
    args: Pick<RenderCommentArgs, "owner" | "repo" | "headSha"> &
        Pick<Location, "file" | "startLine" | "endLine">,
): string {
    const path = args.file.split("/").map(encodeURIComponent).join("/");
    const lines =
        args.startLine === args.endLine
            ? `L${args.startLine}`
            : `L${args.startLine}-L${args.endLine}`;
    return `https://github.com/${args.owner}/${args.repo}/blob/${args.headSha}/${path}#${lines}`;
}

function renderLocation(location: Location, args: RenderCommentArgs): string {
    const range =
        location.startLine === location.endLine
            ? `${location.startLine}`
            : `${location.startLine}-${location.endLine}`;

    return `[${location.file}:${range}](${buildPermalink({ ...args, ...location })})`;
}

function renderFinding(finding: Finding, args: RenderCommentArgs): string {
    const indent = "   ";
    const lines = [
        `- **${CATEGORY_LABELS[finding.category]}: ${finding.title}**`,
        `${indent}${finding.message}`,
    ];

    if (finding.suggestion) {
        lines.push(`${indent}Fix: ${finding.suggestion}`);
    }

    if (finding.locations.length) {
        lines.push(
            `${indent}References: ${finding.locations.map((l) => renderLocation(l, args)).join(", ")}`,
        );
    }

    return lines.join("\n");
}

function renderNote(args: RenderCommentArgs): string {
    const parts: string[] = [];

    if (args.skippedFiles?.length) {
        parts.push(
            `${args.skippedFiles.length} file(s) were skipped (lockfiles, generated or vendored)`,
        );
    }
    if (args.failedLenses?.length) {
        parts.push(`these lenses failed and are missing: ${args.failedLenses.join(", ")}`);
    }

    return parts.length ? `**Note:** ${parts.join("; ")}.` : "";
}

// Builds the comment body. The hidden marker is added by `upsertReviewComment`.
export function renderReviewComment(args: RenderCommentArgs) {
    const sections: string[] = ["## PR Review"];

    if (args.findings.length === 0) {
        sections.push("No issues found.");
    }

    for (const severity of SEVERITY_ORDER) {
        const group = args.findings.filter((f) => f.severity === severity);
        if (group.length === 0) continue;

        sections.push(
            `### ${SEVERITY_HEADINGS[severity]}`,
            group.map((f) => renderFinding(f, args)).join("\n"),
        );
    }

    const note = renderNote(args);
    if (note) sections.push(note);

    return sections.join("\n\n");
}

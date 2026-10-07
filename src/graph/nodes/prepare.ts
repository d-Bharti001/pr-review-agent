import path from "node:path";
import { Command, END, type GraphNode } from "@langchain/langgraph";
import app from "src/github/app";
import { checkoutCommit } from "src/github/checkout";
import { fetchChangedFiles, fetchPullRequestInfo } from "src/github/pullRequest";
import { ReviewState } from "src/graph/state";
import type { ChangedFile } from "src/types/pullRequest";
import { numberPatch } from "src/utils/diff";
import { isSkippedFile } from "src/utils/skipRules";

// Deleted files have no new-file line numbers, so send a summary instead of the patch
function toPromptPatch(file: { status: string; patch?: string }): string {
    if (!file.patch) {
        return "";
    }
    if (file.status === "removed") {
        const removed = file.patch.split("\n").filter((l) => l.startsWith("-")).length;
        return `File deleted (${removed} lines removed). Use read_file with ref "base" to see the old content.`;
    }
    return numberPatch(file.patch);
}

/**
 * `prepare` node: gathers everything the later nodes need to review the PR.
 *
 * Reads from state: installationId, owner, repo, prNumber, headSha, workDir.
 * Writes to state: title, description, files, skippedFiles.
 *
 * Steps:
 * 1. Authenticate as the GitHub App installation.
 * 2. Fetch the PR info (title, description, base and head SHA) and the list of
 *    changed files with their patches, in parallel.
 * 3. Stale check: if the PR's head SHA is no longer the one this job was queued
 *    for, end the run. The newer push has already queued its own review.
 * 4. Drop files that are not worth reviewing (lockfiles, generated, vendored,
 *    binary or oversized files) and record their paths in `skippedFiles`.
 * 5. Convert each remaining patch to the form the model sees: added and context
 *    lines get their line number in the head version of the file, and a deleted
 *    file becomes a one-line summary.
 * 6. Shallow-check-out the base and head commits into `workDir/base` and
 *    `workDir/head`, which the `search_code` and `read_file` tools read from.
 */
export const prepare: GraphNode<typeof ReviewState> = async (state) => {
    const { installationId, owner, repo, prNumber, headSha, workDir } = state;
    const octokit = await app.getInstallationOctokit(installationId);
    const ref = { owner, repo, prNumber };

    // Fetch the PR info (title, description, base and head SHA)
    // and the list of changed files with their patches.
    const [info, changed] = await Promise.all([
        fetchPullRequestInfo(octokit, ref),
        fetchChangedFiles(octokit, ref),
    ]);

    // If the PR moved on since this job was queued, end this review.
    // The newer push would trigger a new review.
    if (info.headSha !== headSha) {
        logger.info("Head SHA changed before prepare, ending the run", {
            queued: headSha,
            current: info.headSha,
        });
        return new Command({ goto: END });
    }

    const files: ChangedFile[] = [];
    const skippedFiles: string[] = [];

    for (const file of changed) {
        if (isSkippedFile(file)) {
            skippedFiles.push(file.path);
            continue;
        }
        files.push({
            path: file.path,
            previousPath: file.previousPath,
            status: file.status,
            patch: toPromptPatch({ status: file.status, patch: file.patch }),
        });
    }

    const { token } = (await octokit.auth({ type: "installation" })) as { token: string };

    await Promise.all([
        checkoutCommit({ owner, repo, sha: info.baseSha, token, dir: path.join(workDir, "base") }),
        checkoutCommit({ owner, repo, sha: info.headSha, token, dir: path.join(workDir, "head") }),
    ]);

    return { title: info.title, description: info.description, files, skippedFiles };
};

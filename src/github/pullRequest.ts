import type { Octokit } from "octokit";
import type { PullRequestInfo, PullRequestRef } from "src/types/pullRequest";

export async function fetchPullRequestDiff(
    octokit: Octokit,
    args: PullRequestRef,
): Promise<string> {
    const { data } = await octokit.rest.pulls.get({
        owner: args.owner,
        repo: args.repo,
        pull_number: args.prNumber,
        mediaType: { format: "diff" },
    });

    return data as unknown as string;
}

export async function fetchPullRequestInfo(
    octokit: Octokit,
    args: PullRequestRef,
): Promise<PullRequestInfo> {
    const { data } = await octokit.rest.pulls.get({
        owner: args.owner,
        repo: args.repo,
        pull_number: args.prNumber,
    });

    return {
        title: data.title,
        description: data.body ?? "",
        baseSha: data.base.sha,
        headSha: data.head.sha,
    };
}

export async function fetchChangedFiles(octokit: Octokit, args: PullRequestRef) {
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner: args.owner,
        repo: args.repo,
        pull_number: args.prNumber,
        per_page: 100,
    });

    return files.map((f) => ({
        path: f.filename,
        previousPath: f.previous_filename,
        status: f.status,
        patch: f.patch, // undefined for binary or very large files
    }));
}

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

/**
 * Returns the commit the PR branched from (the merge base). GitHub computes the PR's diff
 * against it, while `base.sha` is the tip of the base branch, which may be newer.
 */
async function findMergeBase(
    octokit: Octokit,
    args: PullRequestRef,
    baseTipSha: string,
    headSha: string,
): Promise<string> {
    try {
        const { data } = await octokit.rest.repos.compareCommitsWithBasehead({
            owner: args.owner,
            repo: args.repo,
            basehead: `${baseTipSha}...${headSha}`,
        });

        return data.merge_base_commit.sha;
    } catch (err) {
        logger.warn("Could not find the merge base, using the tip of the base branch", err);
        return baseTipSha;
    }
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
        baseSha: await findMergeBase(octokit, args, data.base.sha, data.head.sha),
        headSha: data.head.sha,
    };
}

/** Only the current head SHA of the PR (one cheap call, used by the stale check). */
export async function fetchPullRequestHeadSha(
    octokit: Octokit,
    args: PullRequestRef,
): Promise<string> {
    const { data } = await octokit.rest.pulls.get({
        owner: args.owner,
        repo: args.repo,
        pull_number: args.prNumber,
    });

    return data.head.sha;
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

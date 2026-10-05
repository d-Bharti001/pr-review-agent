import type { Octokit } from "octokit";

export async function fetchPullRequestDiff(
    octokit: Octokit,
    args: { owner: string; repo: string; prNumber: number },
): Promise<string> {
    const { data } = await octokit.rest.pulls.get({
        owner: args.owner,
        repo: args.repo,
        pull_number: args.prNumber,
        mediaType: { format: "diff" },
    });

    return data as unknown as string;
}

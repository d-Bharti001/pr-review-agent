export async function reviewPullRequest(args: {
    installationId: number;
    owner: string;
    repo: string;
    prNumber: number;
}) {
    logger.info("Review requested", args);
}

// completed: every lens run succeeded; partial: some lens runs failed; failed: all of them failed
export type ReviewStatus = "completed" | "partial" | "failed";

export type ReviewJob = {
    installationId: number;
    owner: string;
    repo: string;
    prNumber: number;
    headSha: string;
    deliveryId: string;
};

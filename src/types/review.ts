export type ReviewJob = {
    installationId: number;
    owner: string;
    repo: string;
    prNumber: number;
    headSha: string;
    deliveryId: string;
};

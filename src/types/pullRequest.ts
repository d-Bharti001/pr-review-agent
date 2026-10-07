export type PullRequestRef = {
    owner: string;
    repo: string;
    prNumber: number;
};

export type PullRequestInfo = {
    title: string;
    description: string;
    baseSha: string;
    headSha: string;
};

export type ChangedFile = {
    path: string;
    previousPath?: string;
    status: string;
    patch: string; // unified hunks with new-file line numbers added by `numberPatch`
};

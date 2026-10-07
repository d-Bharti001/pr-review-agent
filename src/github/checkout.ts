import { execFile } from "node:child_process";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export function createWorkDir(): Promise<string> {
    return mkdtemp(path.join(os.tmpdir(), "pr-review-"));
}

async function git(cwd: string, args: string[], token?: string) {
    const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        GIT_TERMINAL_PROMPT: "0",
        GIT_LFS_SKIP_SMUDGE: "1",
    };

    if (token) {
        // Passed through the environment so the token is not in argv or .git/config
        const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
        env.GIT_CONFIG_COUNT = "1";
        env.GIT_CONFIG_KEY_0 = "http.extraHeader";
        env.GIT_CONFIG_VALUE_0 = `Authorization: Basic ${basic}`;
    }

    await run("git", args, { cwd, env });
}

// Shallow checkout of one commit into `dir`. Never runs any code from the repository.
export async function checkoutCommit(args: {
    owner: string;
    repo: string;
    sha: string;
    token: string;
    dir: string;
}) {
    const { owner, repo, sha, token, dir } = args;

    await mkdir(dir, { recursive: true });
    await git(dir, ["init", "--quiet"]);
    await git(dir, ["remote", "add", "origin", `https://github.com/${owner}/${repo}.git`]);
    await git(dir, ["fetch", "--quiet", "--depth=1", "origin", sha], token);
    await git(dir, ["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
}

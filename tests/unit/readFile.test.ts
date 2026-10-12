import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReadFileTool } from "src/graph/tools/readFile";

let root: string; // temp folder that holds everything
let secretPath: string; // a file outside the checkout
let readFile: (input: { path: string }) => Promise<string>;

beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "read-file-test-"));
    const workDir = path.join(root, "work"); // like the real workDir: has head/ and base/
    secretPath = path.join(root, "secret.txt");

    await mkdir(path.join(workDir, "head", "src"), { recursive: true });
    await writeFile(path.join(workDir, "head", "src", "a.ts"), "one\ntwo\n");
    await writeFile(secretPath, "top secret\n");
    await symlink(secretPath, path.join(workDir, "head", "src", "link.txt"));

    const tool = createReadFileTool(workDir);
    readFile = (input) => tool.invoke(input) as Promise<string>;
});

afterAll(async () => {
    await rm(root, { recursive: true, force: true });
});

// The agent only reads files inside the checkout; the model's paths are untrusted
describe("read_file", () => {
    it("returns numbered lines", async () => {
        expect(await readFile({ path: "src/a.ts" })).toBe(
            "    1  one\n    2  two\n[lines 1-2 of 2]",
        );
    });

    it.each([
        ["a '..' path", () => "../../secret.txt"],
        ["an absolute path", () => secretPath],
        ["a symlink pointing outside", () => "src/link.txt"],
    ])("refuses %s that leaves the checkout", async (_name, getPath) => {
        const result = await readFile({ path: getPath() });

        expect(result).toBe("Error: Path is outside the repository");
        expect(result).not.toContain("top secret");
    });
});

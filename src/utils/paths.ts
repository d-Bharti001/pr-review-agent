import path from "node:path";
import { realpath } from "node:fs/promises";

/**
 * Resolves `relativePath` inside `root`, following symlinks, and throws if the result
 * is outside `root`. Catches `..`, absolute paths and symlinks pointing out of the checkout.
 */
export async function resolveInside(root: string, relativePath: string): Promise<string> {
    const realRoot = await realpath(root);
    const resolved = await realpath(path.resolve(realRoot, relativePath)); // ENOENT if missing
    const relative = path.relative(realRoot, resolved);

    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new Error("Path is outside the repository");
    }

    return resolved;
}

const HUNK_HEADER = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Prefixes added and context lines with their line number in the new (head) file,
 * so the model can cite real line numbers. Removed lines get blank padding.
 *
 * Example output:
 * @@ -10,3 +10,4 @@
 *    10  const a = 1;
 *    11 +const b = 2;
 *       -const c = 3;
 *    12  return a;
 */
export function numberPatch(patch: string): string {
    let newLine = 0;

    return patch
        .split("\n")
        .map((line) => {
            const header = HUNK_HEADER.exec(line);
            if (header) {
                newLine = Number(header[1]);
                return line;
            }
            if (line.startsWith("\\")) return line; // "\ No newline at end of file"
            if (line.startsWith("-")) return " ".repeat(6) + line;

            return `${String(newLine++).padStart(5)} ${line}`;
        })
        .join("\n");
}

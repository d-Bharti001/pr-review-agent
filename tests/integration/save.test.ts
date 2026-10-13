import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { MySqlContainer, type StartedMySqlContainer } from "@testcontainers/mysql";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const run = promisify(execFile);

let mysql: StartedMySqlContainer;

// Loaded after the container is up and the environment points at it,
// because src/config reads the environment when it is first imported
let poolModule: typeof import("src/database/pool");
let saveModule: typeof import("src/graph/nodes/save");

beforeAll(async () => {
    vi.stubGlobal("logger", { info: vi.fn(), warn: vi.fn(), error: vi.fn() });

    mysql = await new MySqlContainer("mysql:8.4").start();
    process.env.MYSQL_HOST = mysql.getHost();
    process.env.MYSQL_PORT = String(mysql.getPort());
    process.env.MYSQL_DATABASE = mysql.getDatabase();
    process.env.MYSQL_USER = mysql.getUsername();
    process.env.MYSQL_PASSWORD = mysql.getUserPassword();

    // The real migrations create the real schema
    await run("node", ["node_modules/.bin/db-migrate", "up"], { env: process.env });

    poolModule = await import("src/database/pool");
    saveModule = await import("src/graph/nodes/save");
});

afterAll(async () => {
    await poolModule?.default.end();
    await mysql?.stop();
});

const finding = (title: string) => ({
    category: "quality",
    severity: "high",
    locations: [{ file: "src/a.ts", startLine: 1, endLine: 2 }],
    title,
    message: `${title} message`,
    suggestion: "",
    model: "fake-model",
    provider: "fake-provider",
});

const usage = (step: string) => ({
    pipelineStep: step,
    model: "fake-model",
    provider: "fake-provider",
    llmCalls: 1,
    totalTokens: 10,
    latencyMs: 5,
});

const state = (overrides: object) =>
    ({
        installationId: 1,
        owner: "acme",
        repo: "app",
        prNumber: 5,
        headSha: "sha1",
        deliveryId: "delivery-save",
        lensRuns: ["quality", "security"],
        lensFailures: [],
        mergedFindings: [],
        usage: [],
        ...overrides,
    }) as never;

describe("save node", () => {
    it("stores the review, its findings and its usage", async () => {
        const pool = poolModule.default;

        await saveModule.save(
            state({
                deliveryId: "delivery-first",
                mergedFindings: [finding("A"), finding("B")],
                usage: [usage("quality"), usage("merge")],
            }),
            {} as never,
        );

        const [reviews] = await pool.query(
            "SELECT status FROM reviews WHERE delivery_id = 'delivery-first'",
        );
        const [findings] = await pool.query(
            `SELECT f.title, f.model, f.provider FROM findings f
             JOIN reviews r ON r.id = f.review_id
             WHERE r.delivery_id = 'delivery-first' ORDER BY f.title`,
        );
        const [usageRows] = await pool.query(
            `SELECT u.pipeline_step FROM llm_usage u
             JOIN reviews r ON r.id = u.review_id
             WHERE r.delivery_id = 'delivery-first' ORDER BY u.pipeline_step`,
        );

        expect(reviews).toEqual([{ status: "completed" }]);
        expect(findings).toEqual([
            { title: "A", model: "fake-model", provider: "fake-provider" },
            { title: "B", model: "fake-model", provider: "fake-provider" },
        ]);
        expect(usageRows).toEqual([{ pipeline_step: "merge" }, { pipeline_step: "quality" }]);
    });

    it("keeps one review and replaces its results when the same delivery is saved again", async () => {
        const pool = poolModule.default;

        // First attempt: everything worked
        await saveModule.save(
            state({
                mergedFindings: [finding("A"), finding("B")],
                usage: [usage("quality"), usage("security"), usage("merge")],
            }),
            {} as never,
        );

        // The job is retried: this time one of the two lens runs failed
        await saveModule.save(
            state({
                lensFailures: ["security"],
                mergedFindings: [finding("A")],
                usage: [usage("quality")],
            }),
            {} as never,
        );

        const [reviews] = await pool.query(
            "SELECT status FROM reviews WHERE delivery_id = 'delivery-save'",
        );
        const [findings] = await pool.query(
            `SELECT f.title FROM findings f
             JOIN reviews r ON r.id = f.review_id
             WHERE r.delivery_id = 'delivery-save'`,
        );
        const [usageRows] = await pool.query(
            `SELECT u.pipeline_step FROM llm_usage u
             JOIN reviews r ON r.id = u.review_id
             WHERE r.delivery_id = 'delivery-save'`,
        );

        expect(reviews).toEqual([{ status: "partial" }]);
        expect(findings).toEqual([{ title: "A" }]);
        expect(usageRows).toEqual([{ pipeline_step: "quality" }]);
    });

    it("marks the review failed when every lens run failed", async () => {
        const pool = poolModule.default;

        await saveModule.save(
            state({
                deliveryId: "delivery-failed",
                lensFailures: ["quality", "security"],
            }),
            {} as never,
        );

        const [reviews] = await pool.query(
            "SELECT status FROM reviews WHERE delivery_id = 'delivery-failed'",
        );

        expect(reviews).toEqual([{ status: "failed" }]);
    });
});

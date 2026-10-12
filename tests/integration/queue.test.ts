import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReviewJob } from "src/types/review";

let redis: StartedRedisContainer;

// Loaded after the container is up and the environment points at it,
// because src/config reads the environment when it is first imported
let queueModule: typeof import("src/queue/reviewQueue");

beforeAll(async () => {
    vi.stubGlobal("logger", { info: vi.fn(), warn: vi.fn(), error: vi.fn() });

    redis = await new RedisContainer("redis:7").start();
    process.env.REDIS_HOST = redis.getHost();
    process.env.REDIS_PORT = String(redis.getPort());

    queueModule = await import("src/queue/reviewQueue");
});

afterAll(async () => {
    await queueModule?.reviewQueue.close();
    await redis?.stop();
});

const job = (deliveryId: string): ReviewJob => ({
    installationId: 1,
    owner: "acme",
    repo: "app",
    prNumber: 5,
    headSha: "sha1",
    deliveryId,
});

describe("duplicate webhook deliveries", () => {
    it("queues one job for a delivery ID that GitHub sends again", async () => {
        const { enqueueReview, reviewQueue } = queueModule;

        await enqueueReview(job("delivery-1"));
        await enqueueReview(job("delivery-1")); // GitHub redelivers
        expect((await reviewQueue.getJobCounts("waiting")).waiting).toBe(1);

        await enqueueReview(job("delivery-2")); // a new event for the same PR
        expect((await reviewQueue.getJobCounts("waiting")).waiting).toBe(2);
    });
});

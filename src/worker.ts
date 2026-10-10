import "src/config";
import "src/utils/logger";
import { Worker } from "bullmq";
import dbPool from "src/database/pool";
import redisConnection from "src/queue/connection";
import { REVIEW_QUEUE_NAME } from "src/queue/constants";
import { reviewPullRequest } from "src/services/reviewPr";
import type { ReviewJob } from "src/types/review";

const SHUTDOWN_TIMEOUT_MS = 5 * 60 * 1000;

const worker = new Worker<ReviewJob>(
    REVIEW_QUEUE_NAME,
    async (job) => {
        await reviewPullRequest(job.data);
    },
    {
        connection: redisConnection,
        concurrency: 1,
        lockDuration: 60 * 1000,
        maxStalledCount: 3, // a crash mid-review gets the job re-run, up to 3 times
    },
);

worker.on("completed", (job) => logger.info(`Review job ${job.id} completed.`));
worker.on("failed", (job, err) =>
    logger.error(`Review job ${job?.id} failed (attempt ${job?.attemptsMade})`, err),
);
worker.on("error", (err) => logger.error("Worker error", err));

async function shutdown(signal: string) {
    logger.info(`${signal} received: waiting for the active review to finish`);

    const timer = setTimeout(() => {
        logger.error("Shutdown timed out, exiting");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);

    try {
        await worker.close(); // lets the active job finish
        await dbPool.end();
        clearTimeout(timer);
        process.exit(0);
    } catch (err) {
        logger.error("Shutdown failed", err);
        process.exit(1);
    }
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

logger.info("Worker started");

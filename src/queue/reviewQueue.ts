import { Queue } from "bullmq";
import redisConnection from "src/queue/connection";
import { REVIEW_QUEUE_NAME } from "src/queue/constants";
import type { ReviewJob } from "src/types/review";

export const reviewQueue = new Queue<ReviewJob>(REVIEW_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 4,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: { age: 7 * 24 * 3600 }, // kept long enough to catch redeliveries
        removeOnFail: { age: 30 * 24 * 3600 },
    },
});

export function enqueueReview(job: ReviewJob) {
    // Same GitHub Delivery ID = same job id
    // Thus BullMQ ignores a second add while the job is retained
    return reviewQueue.add("review", job, { jobId: job.deliveryId });
}

import type { ConnectionOptions } from "bullmq";
import { REDIS_HOST, REDIS_PORT } from "src/config";

// maxRetriesPerRequest must be null for BullMQ workers
const redisConnection: ConnectionOptions = {
    host: REDIS_HOST,
    port: REDIS_PORT,
    maxRetriesPerRequest: null,
};

export default redisConnection;

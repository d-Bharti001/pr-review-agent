import "src/config";
import "src/utils/logger";
import express from "express";
import { PORT } from "src/config";
import router from "src/routes";
import { reviewQueue } from "./queue/reviewQueue";

const server = express();

server.use(router);

const httpServer = server.listen(PORT, () => {
    logger.info(`Listening on port ${PORT}`);
});

async function shutdown(signal: string) {
    logger.info(`${signal} received: closing the server`);
    httpServer.close();
    await reviewQueue.close();
    process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

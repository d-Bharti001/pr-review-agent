import "src/config";
import "src/utils/logger";
import express from "express";
import { PORT } from "src/config";
import router from "src/routes";

const server = express();

server.use(router);

server.listen(PORT, () => {
    logger.info(`Listening on port ${PORT}`);
});

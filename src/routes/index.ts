import express from "express";
import webhookRouter from "./webhook";
import { errorHandler } from "src/middleware/errorHandler";
import { routeNotFoundHandler } from "src/middleware/routeNotFound";

const router = express.Router();

router.get("/health", (_req, res) => {
    res.send("ok");
});

router.use("/webhook", webhookRouter);

router.use(routeNotFoundHandler);

router.use(errorHandler);

export default router;

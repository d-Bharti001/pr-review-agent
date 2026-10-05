import express from "express";
import { webhookController } from "src/controllers/webhook";
import { verifySignature } from "src/middleware/verifySignature";

const webhookRouter = express.Router();

webhookRouter.use(express.raw({ type: "application/json" }));

webhookRouter.use(verifySignature);

webhookRouter.post("/", webhookController);

export default webhookRouter;

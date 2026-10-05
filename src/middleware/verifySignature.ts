import type { Request, Response, NextFunction } from "express";
import app from "src/github/app";
import { UnauthorizedError } from "src/utils/errors";

export async function verifySignature(req: Request, _res: Response, next: NextFunction) {
    const signature = req.header("x-hub-signature-256");
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

    if (!signature || !rawBody || !(await app.webhooks.verify(rawBody, signature))) {
        return next(new UnauthorizedError("Invalid signature"));
    }

    next();
}

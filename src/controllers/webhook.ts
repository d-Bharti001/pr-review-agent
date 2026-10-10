import type { Request, Response, NextFunction } from "express";
import { enqueueReview } from "src/queue/reviewQueue";
import { ReviewJob } from "src/types/review";
import { BadRequestError } from "src/utils/errors";

const HANDLED_ACTIONS = ["opened", "synchronize", "reopened", "edited"];

export async function webhookController(req: Request, res: Response, next: NextFunction) {
    const event = req.header("x-github-event");
    const rawBody = req.body.toString("utf8");

    if (event !== "pull_request") {
        return res.status(200).send("ok");
    }

    const payload = JSON.parse(rawBody);

    if (!HANDLED_ACTIONS.includes(payload.action)) {
        return res.status(200).send("ok");
    }

    const deliveryId = req.header("x-github-delivery");
    if (!deliveryId) {
        return next(new BadRequestError("Missing delivery id"));
    }

    const job: ReviewJob = {
        installationId: payload.installation.id,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        prNumber: payload.pull_request.number,
        headSha: payload.pull_request.head.sha,
        deliveryId,
    };

    await enqueueReview(job);
    res.status(200).send("ok");
}

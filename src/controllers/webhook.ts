import type { Request, Response } from "express";
import { reviewPullRequest } from "src/services/reviewPr";
import { ReviewJob } from "src/types/review";

const HANDLED_ACTIONS = ["opened", "synchronize", "reopened", "edited"];

export function webhookController(req: Request, res: Response) {
    const event = req.header("x-github-event");
    const rawBody = req.body.toString("utf8");

    if (event !== "pull_request") {
        return res.status(200).send("ok");
    }

    const payload = JSON.parse(rawBody);

    if (!HANDLED_ACTIONS.includes(payload.action)) {
        return res.status(200).send("ok");
    }

    res.status(200).send("ok");

    const job: ReviewJob = {
        installationId: payload.installation.id,
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        prNumber: payload.pull_request.number,
    };

    reviewPullRequest(job).catch((err) => logger.error("Review failed", err));
}

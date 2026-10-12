import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueReview } from "src/queue/reviewQueue";

const SECRET = "test-secret";

// The real GitHub App object verifies the signature, so it needs a valid private key
vi.mock("src/config", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    return {
        GITHUB_APP_ID: "1",
        GITHUB_PRIVATE_KEY: privateKey,
        GITHUB_WEBHOOK_SECRET: "test-secret",
    };
});

// No Redis: the queue is replaced by a spy
vi.mock("src/queue/reviewQueue", () => ({ enqueueReview: vi.fn() }));

let server: Server;
let url: string;

beforeAll(async () => {
    vi.stubGlobal("logger", { info: vi.fn(), warn: vi.fn(), error: vi.fn() });

    const { default: router } = await import("src/routes");
    const app = express();
    app.use(router);

    server = app.listen(0);
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/webhook`;
});

afterAll(() => {
    server.close();
});

beforeEach(() => {
    vi.mocked(enqueueReview).mockClear();
});

function pullRequestPayload(action: string) {
    return JSON.stringify({
        action,
        installation: { id: 1 },
        repository: { name: "app", owner: { login: "acme" } },
        pull_request: { number: 5, head: { sha: "sha1" } },
    });
}

function sendWebhook(body: string, { signature = sign(body), deliveryId = "d-1" } = {}) {
    return fetch(url, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-github-event": "pull_request",
            "x-github-delivery": deliveryId,
            "x-hub-signature-256": signature,
        },
        body,
    });
}

const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

describe("webhook", () => {
    it("rejects a request with a wrong signature and enqueues nothing", async () => {
        const response = await sendWebhook(pullRequestPayload("opened"), {
            signature: "sha256=deadbeef",
        });

        expect(response.status).toBe(401);
        expect(enqueueReview).not.toHaveBeenCalled();
    });

    it("acknowledges but ignores actions it does not review", async () => {
        const response = await sendWebhook(pullRequestPayload("closed"));

        expect(response.status).toBe(200);
        expect(enqueueReview).not.toHaveBeenCalled();
    });

    it("enqueues a review job keyed by the delivery ID", async () => {
        const response = await sendWebhook(pullRequestPayload("opened"), { deliveryId: "d-42" });

        expect(response.status).toBe(200);
        expect(enqueueReview).toHaveBeenCalledWith({
            installationId: 1,
            owner: "acme",
            repo: "app",
            prNumber: 5,
            headSha: "sha1",
            deliveryId: "d-42",
        });
    });
});

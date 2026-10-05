import { App } from "octokit";
import { GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET } from "src/config";

const app = new App({
    appId: GITHUB_APP_ID,
    privateKey: GITHUB_PRIVATE_KEY,
    webhooks: { secret: GITHUB_WEBHOOK_SECRET },
});

export default app;

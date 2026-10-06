import { readFileSync } from "node:fs";
import { z } from "zod";

const ALLOWED_LLM_PROVIDERS = ["anthropic", "gemini", "ollama", "openai", "openrouter"];

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(8081),

    GITHUB_APP_ID: z.string().min(1),
    GITHUB_PRIVATE_KEY_PATH: z.string().min(1),
    GITHUB_WEBHOOK_SECRET: z.string().min(1),

    LLM_PROVIDER: z.enum(ALLOWED_LLM_PROVIDERS),
    LLM_BASE_URL: z.url().min(1),
    LLM_API_KEY: z.string().min(1),
    LLM_MODEL: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    console.error("Invalid environment variables:", z.flattenError(parsed.error).fieldErrors);
    process.exit(1);
}

const env = parsed.data;

const NODE_ENV = env.NODE_ENV;
const DEVELOPMENT = NODE_ENV === "development";
const TEST = NODE_ENV === "test";

const PORT = env.PORT;

const GITHUB_APP_ID = env.GITHUB_APP_ID;
const GITHUB_PRIVATE_KEY = readFileSync(env.GITHUB_PRIVATE_KEY_PATH, "utf-8");
const GITHUB_WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET;

const LLM_PROVIDER = env.LLM_PROVIDER;
const LLM_BASE_URL = env.LLM_BASE_URL;
const LLM_API_KEY = env.LLM_API_KEY;
const LLM_MODEL = env.LLM_MODEL;

export {
    NODE_ENV,
    DEVELOPMENT,
    TEST,
    PORT,
    GITHUB_APP_ID,
    GITHUB_PRIVATE_KEY,
    GITHUB_WEBHOOK_SECRET,
    LLM_PROVIDER,
    LLM_BASE_URL,
    LLM_API_KEY,
    LLM_MODEL,
    ALLOWED_LLM_PROVIDERS,
};

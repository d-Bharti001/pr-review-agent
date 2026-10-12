import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Dummy values so that importing src/config does not exit. The integration tests
// replace the MySQL and Redis ones with the test containers.
const testEnv = {
    NODE_ENV: "test",
    MYSQL_HOST: "127.0.0.1",
    MYSQL_PORT: "1",
    MYSQL_DATABASE: "x",
    MYSQL_USER: "x",
    MYSQL_PASSWORD: "x",
    REDIS_HOST: "127.0.0.1",
    REDIS_PORT: "1",
    GITHUB_APP_ID: "1",
    GITHUB_PRIVATE_KEY_PATH: "tests/fixtures/test-key.pem",
    GITHUB_WEBHOOK_SECRET: "test-secret",
    LLM_PROVIDER: "ollama",
    LLM_BASE_URL: "",
    LLM_API_KEY: "x",
    LLM_MODEL: "x",
};

export default defineConfig({
    resolve: {
        alias: { src: fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
        projects: [
            {
                extends: true,
                test: {
                    name: "unit",
                    include: ["tests/unit/**/*.test.ts"],
                    env: testEnv,
                },
            },
            {
                // Needs Docker (Testcontainers)
                extends: true,
                test: {
                    name: "integration",
                    include: ["tests/integration/**/*.test.ts"],
                    env: testEnv,
                    testTimeout: 60_000,
                    hookTimeout: 180_000,
                },
            },
        ],
    },
});

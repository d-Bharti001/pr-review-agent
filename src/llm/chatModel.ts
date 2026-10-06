import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";
import { LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, LLM_PROVIDER } from "src/config";

const MAX_RETRIES = 3;

export function createChatModel(): BaseChatModel {
    switch (LLM_PROVIDER) {
        case "anthropic":
            return new ChatAnthropic({
                apiKey: LLM_API_KEY,
                model: LLM_MODEL,
                maxRetries: MAX_RETRIES,
            });
        case "gemini":
        case "ollama":
        case "openai":
        case "openrouter":
            return new ChatOpenAI({
                apiKey: LLM_API_KEY,
                model: LLM_MODEL,
                maxRetries: MAX_RETRIES,
                configuration: { baseURL: LLM_BASE_URL },
            });
        default:
            throw new Error("Unsupported LLM provider");
    }
}

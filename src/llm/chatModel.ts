import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

const MAX_RETRIES = 3;

export type ChatModelConstructorParams = {
    llmModelName: string;
    llmProvider: string;
    baseUrl: string;
    apiKey: string;
};

export class ChatModel {
    readonly model: BaseChatModel;
    readonly name: string;
    readonly provider: string;

    constructor({ llmModelName, llmProvider, baseUrl, apiKey }: ChatModelConstructorParams) {
        switch (llmProvider) {
            case "anthropic":
                this.model = new ChatAnthropic({
                    apiKey: apiKey,
                    model: llmModelName,
                    maxRetries: MAX_RETRIES,
                });
                break;
            case "gemini":
            case "ollama":
            case "openai":
            case "openrouter":
                this.model = new ChatOpenAI({
                    apiKey: apiKey,
                    model: llmModelName,
                    maxRetries: MAX_RETRIES,
                    configuration: { baseURL: baseUrl },
                });
                break;
            default:
                throw new Error(`Unsupported LLM provider: ${llmProvider}`);
        }

        this.name = llmModelName;
        this.provider = llmProvider;
    }
}

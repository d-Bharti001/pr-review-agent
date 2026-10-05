import OpenAI from "openai";
import { LLM_API_KEY, LLM_BASE_URL } from "src/config";

const llm = new OpenAI({ apiKey: LLM_API_KEY, baseURL: LLM_BASE_URL });

export default llm;

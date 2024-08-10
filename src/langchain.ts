import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

export class Langchain {
  model: ChatGoogleGenerativeAI;
  constructor(geminiToken: string, langchainToken?: string) {
    if (langchainToken) {
      process.env.LANGCHAIN_TRACING_V2 = "true";
      process.env.LANGCHAIN_API_KEY = langchainToken;
    }

    process.env.GOOGLE_API_KEY = geminiToken;
    this.model = new ChatGoogleGenerativeAI({
      modelName: "gemini-1.5-pro",
    });
  }

  async generateResponse(input: string) {
    const response = await this.model.invoke(input);
    return response.content.toString();
  }
}

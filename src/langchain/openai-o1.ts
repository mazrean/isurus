import { RunnableSequence } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { SqlPlan } from "@/model/plan";
import {
  createBulkPrompt,
  createCachePrompt,
  createIndexPrompt,
  createJoinPrompt,
  createUnknownPrompt,
} from "@/langchain/prompt/database";
import { codeBlockExtractor } from "./utils";
import { config } from "@/config";

export type LangchainConfig = {
  openaiToken: string;
  langchainToken?: string;
};

export class Langchain {
  openaiModel: ChatOpenAI;

  constructor(config: LangchainConfig) {
    if (config.langchainToken) {
      process.env.LANGCHAIN_TRACING_V2 = "true";
      process.env.LANGCHAIN_API_KEY = config.langchainToken;
    }

    this.openaiModel = new ChatOpenAI({
      apiKey: config.openaiToken,
      model: "o1-mini",
    });
  }

  async generateSuggestion(sqlFixPlan: SqlPlan) {
    let suggestionType = "targetFunction";
    let prompt = "";
    switch (sqlFixPlan.plan.type) {
      case "index":
        suggestionType = "index";
        prompt = await createIndexPrompt(sqlFixPlan);
        break;
      case "join":
        prompt = await createJoinPrompt(sqlFixPlan);
        break;
      case "bulk":
        prompt = await createBulkPrompt(sqlFixPlan);
        break;
      case "cache":
        prompt = await createCachePrompt(sqlFixPlan);
        break;
      case "unknown":
        prompt = await createUnknownPrompt(sqlFixPlan);
        break;
    }
    const promptTemplate = PromptTemplate.fromTemplate(prompt);

    const chain = RunnableSequence.from([
      promptTemplate,
      this.openaiModel.bindTools([]),
      new StringOutputParser(),
    ]);
    const response = await chain.invoke({});

    switch (suggestionType) {
      case "index":
        return {
          type: suggestionType,
          createIndexQuery: codeBlockExtractor(response, "sql"),
        } as FixSuggestion;
      default:
        return {
          type: suggestionType,
          targetFunction: codeBlockExtractor(response, "go"),
        } as FixSuggestion;
    }
  }
}

export const langchain = new Langchain({
  openaiToken: config("isurus.openai.token"),
  langchainToken: config("isurus.langchain.token"),
});

import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";

export type LangchainConfig = {
  openaiToken: string;
  prometheusURL: string;
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
      model: "o1-preview",
      temperature: 0.9,
    });
  }

  async generateResponse(input: string) {
    const prompt =
      PromptTemplate.fromTemplate(`Answer the question based only on the following source code.
Please use the metrics collected on Prometheus to answer.

Question: {question}`);

    const chain = RunnableSequence.from([
      {
        question: new RunnablePassthrough(),
      },
      prompt,
      new StringOutputParser(),
    ]);
    const response = await chain.invoke(input);
    return response;
  }
}

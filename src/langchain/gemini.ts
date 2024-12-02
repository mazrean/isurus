import { BaseRetriever } from "@langchain/core/dist/retrievers";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import { formatDocumentsAsString } from "langchain/util/document";
import { PromptTemplate } from "@langchain/core/prompts";
import { createRetriever } from "@/langchain/retrieval/retrieval";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createTools } from "@/langchain/agent/tools";
import { StructuredToolInterface } from "@langchain/core/tools";

type Tools = StructuredToolInterface[];

export type LangchainConfig = {
  geminiToken: string;
  prometheusURL: string;
  langchainToken?: string;
};

export class Langchain {
  geminiModel: ChatGoogleGenerativeAI;
  retriever: Promise<BaseRetriever>;
  tools: Promise<Tools>;

  constructor(config: LangchainConfig) {
    if (config.langchainToken) {
      process.env.LANGCHAIN_TRACING_V2 = "true";
      process.env.LANGCHAIN_API_KEY = config.langchainToken;
    }

    this.geminiModel = new ChatGoogleGenerativeAI({
      apiKey: config.geminiToken,
      modelName: "gemini-1.5-pro",
    });
    const embedder = new GoogleGenerativeAIEmbeddings({
      apiKey: config.geminiToken,
      model: "text-embedding-004",
    });
    this.retriever = createRetriever(embedder);
    this.tools = createTools(config.prometheusURL);
  }

  async generateResponse(input: string) {
    const prompt =
      PromptTemplate.fromTemplate(`Answer the question based only on the following source code.
Please use the metrics collected on Prometheus to answer.

Source code:
{context}

Question: {question}`);

    const chain = RunnableSequence.from([
      {
        context: (await this.retriever).pipe(formatDocumentsAsString),
        question: new RunnablePassthrough(),
      },
      prompt,
      this.geminiModel.bindTools(await this.tools),
      new StringOutputParser(),
    ]);
    const response = await chain.invoke(input);
    return response;
  }
}

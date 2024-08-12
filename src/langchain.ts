import { BaseRetriever } from "@langchain/core/dist/retrievers";
import {
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import {
  ChatGoogleGenerativeAI,
  GoogleGenerativeAIEmbeddings,
} from "@langchain/google-genai";
import { formatDocumentsAsString } from "langchain/util/document";
import { PromptTemplate } from "@langchain/core/prompts";
import { createRetriever } from "@/retrieval/retrieval";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { createTools } from "@/agent/tools";
import { StructuredToolInterface } from "@langchain/core/tools";

type Tools = StructuredToolInterface[];

export type LangchainConfig = {
  geminiToken: string;
  openaiToken: string;
  prometheusURL: string;
  langchainToken?: string;
};

export class Langchain {
  //geminiModel: ChatGoogleGenerativeAI;
  openaiModel: ChatOpenAI;
  retriever: Promise<BaseRetriever>;
  tools: Promise<Tools>;

  constructor(config: LangchainConfig) {
    if (config.langchainToken) {
      process.env.LANGCHAIN_TRACING_V2 = "true";
      process.env.LANGCHAIN_API_KEY = config.langchainToken;
    }

    /*this.geminiModel = new ChatGoogleGenerativeAI({
      apiKey: config.geminiToken,
      modelName: "gemini-1.5-pro",
    });
    const embedder = new GoogleGenerativeAIEmbeddings({
      apiKey: config.geminiToken,
      model: "text-embedding-004",
    });*/
    this.openaiModel = new ChatOpenAI({
      apiKey: config.openaiToken,
      model: "gpt-4o-mini",
      temperature: 0.9,
    });
    const embedder = new OpenAIEmbeddings({
      apiKey: config.openaiToken,
      model: "text-embedding-3-large",
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
      this.openaiModel.bindTools(await this.tools),
      new StringOutputParser(),
    ]);
    const response = await chain.invoke(input);
    return response;
  }
}

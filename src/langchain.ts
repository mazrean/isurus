import { BaseRetriever } from "@langchain/core/dist/retrievers";
import {
  Runnable,
  RunnablePassthrough,
  RunnableSequence,
} from "@langchain/core/runnables";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { formatDocumentsAsString } from "langchain/util/document";
import { PromptTemplate } from "@langchain/core/prompts";
import { createRetriever } from "@/retrieval/retrieval";
import { StringOutputParser } from "@langchain/core/output_parsers";

export class Langchain {
  model: ChatGoogleGenerativeAI;
  retriever: Promise<BaseRetriever>;

  constructor(geminiToken: string, langchainToken?: string) {
    if (langchainToken) {
      process.env.LANGCHAIN_TRACING_V2 = "true";
      process.env.LANGCHAIN_API_KEY = langchainToken;
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey: geminiToken,
      modelName: "gemini-1.5-pro",
    });
    this.retriever = createRetriever(geminiToken);
  }

  async generateResponse(input: string) {
    const prompt =
      PromptTemplate.fromTemplate(`Answer the question based only on the following context:
{context}

Question: {question}`);

    const chain = RunnableSequence.from([
      {
        context: (await this.retriever).pipe(formatDocumentsAsString),
        question: new RunnablePassthrough(),
      },
      prompt,
      this.model as unknown as Runnable,
      new StringOutputParser(),
    ]);
    const response = await chain.invoke(input);
    return response;
  }
}

import * as vscode from "vscode";
import { BaseDocumentLoader } from "@langchain/core/document_loaders/base";
import { LoadersMapping } from "langchain/document_loaders/fs/directory";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { TextSplitter } from "langchain/text_splitter";
import { Document } from "@langchain/core/documents";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { BaseRetriever } from "@langchain/core/dist/retrievers";
import { EmbeddingsInterface } from "@langchain/core/embeddings";

class VSCodeLoader extends TextLoader {
  constructor(public path: string, public splitter?: TextSplitter) {
    super(path);
  }

  protected async parse(text: string) {
    return [text];
  }

  async load() {
    const document = await vscode.workspace.openTextDocument(this.path);
    const text = document.getText();

    const parsed = await this.parse(text);

    if (this.splitter) {
      return this.splitter.createDocuments(
        parsed,
        parsed.map((_) => ({ source: this.path }))
      );
    }

    return parsed.map(
      (content) =>
        new Document({ pageContent: content, metadata: { source: this.path } })
    );
  }
}

class VSCodeWorkspaceLoader extends BaseDocumentLoader {
  constructor(public loaders: LoadersMapping) {
    super();
  }

  async load() {
    const documents: Document[] = [];

    for (const [ext, loader] of Object.entries(this.loaders)) {
      const files = await vscode.workspace.findFiles(`**/*${ext}`);
      for (const file of files) {
        const loaderInstance = loader(file.path);
        const docs = await loaderInstance.load();
        documents.push(...docs);
      }
    }

    return documents;
  }
}

const loadDocuments = async () => {
  const loader = new VSCodeWorkspaceLoader({
    ".go": (path) => new VSCodeLoader(path),
    ".html": (path) => new VSCodeLoader(path),
    ".md": (path) => new VSCodeLoader(path),
    ".cnf": (path) => new VSCodeLoader(path),
    ".conf": (path) => new VSCodeLoader(path),
  });
  return await loader.load();
};

export const createRetriever = async (embedding: EmbeddingsInterface) => {
  const documents = await loadDocuments();
  const vectorStore = MemoryVectorStore.fromDocuments(documents, embedding);
  return (await vectorStore).asRetriever(2) as BaseRetriever;
};

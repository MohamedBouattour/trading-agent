import { IMemoryStore } from "../../domain/ports/Ports.js";
import { VectorStore } from "@langchain/core/vectorstores";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Document, DocumentInterface } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";

// ---------------------------------------------------------------------------
// Lightweight in-memory vector store
// ---------------------------------------------------------------------------

interface MemoryVector {
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

class InMemoryVectorStore extends VectorStore {
  private memoryVectors: MemoryVector[] = [];

  _vectorstoreType(): string {
    return "memory";
  }

  constructor(embeddings: EmbeddingsInterface) {
    super(embeddings, {});
  }

  async addDocuments(documents: DocumentInterface[]): Promise<void> {
    const texts = documents.map((d) => d.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    await this.addVectors(vectors, documents);
  }

  async addVectors(
    vectors: number[][],
    documents: DocumentInterface[],
  ): Promise<void> {
    for (let i = 0; i < vectors.length; i++) {
      this.memoryVectors.push({
        content: documents[i].pageContent,
        embedding: vectors[i],
        metadata: documents[i].metadata,
      });
    }
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
  ): Promise<[DocumentInterface, number][]> {
    return this.memoryVectors
      .map((mv) => ({
        score: cosineSimilarity(query, mv.embedding),
        doc: new Document({ pageContent: mv.content, metadata: mv.metadata }),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ doc, score }) => [doc, score]);
  }
}

// ---------------------------------------------------------------------------
// FinancialSituationMemory – strictly OpenRouter
// ---------------------------------------------------------------------------

export class FinancialSituationMemory implements IMemoryStore {
  private vectorStore: InMemoryVectorStore;

  constructor(config: { apiKey: string; embeddingModel?: string }) {
    if (config.apiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = config.apiKey;
    }

    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: config.apiKey,
      model: config.embeddingModel || "nvidia/nemotron-3-nano-30b-a3b:free",
      configuration: {
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: config.apiKey,
        defaultHeaders: {
          "HTTP-Referer": "https://github.com/TradingAgentsTS",
          "X-Title": "TradingAgents TS",
        },
      },
    });

    this.vectorStore = new InMemoryVectorStore(embeddings);
  }

  async getSimilarSituations(
    currentSituation: string,
    k: number = 2,
  ): Promise<string[]> {
    try {
      const results = await this.vectorStore.similaritySearch(
        currentSituation,
        k,
      );
      return results.map((doc) => doc.metadata.reflection);
    } catch (err) {
      console.warn("Memory retrieval failed:", err);
      return [];
    }
  }

  async addSituation(situation: string, reflection: string): Promise<void> {
    const doc = new Document({
      pageContent: situation,
      metadata: { reflection },
    });
    await this.vectorStore.addDocuments([doc]);
  }
}

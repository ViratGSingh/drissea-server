import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../../types.js";
import Groq from "groq-sdk";
import 'dotenv/config';
import admin from "firebase-admin";
import OpenAI from "openai";

export class DevAnswerSimilarity extends OpenAPIRoute {
  schema = {
    tags: ["Answer Similarity"],
    summary: "Generate an answer based on IG/YT video content",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              answer: Str(),
              videoIds: z.array(Str()),
              idPlatforms: z.array(Str()),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Generated answer",
        content: {
          "application/json": {
            schema: z.object({
              content: Str(),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid parameters",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    // Authorization check
    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.API_SECRET}`) {
      return c.json(
        {
          success: false,
          error: "Unauthorized",
        },
        401
      );
    }
    try {
      const body = await c.req.json();
      const { answer, videoIds, idPlatforms } = body;

      if (!answer || !Array.isArray(videoIds) || !Array.isArray(idPlatforms) || videoIds.length !== idPlatforms.length) {
        return c.json({ error: "Invalid input" }, 400);
      }

      // Initialize Firebase (only once)
      if (!admin.apps.length) {
            admin.initializeApp({
              credential: admin.credential.cert(
                require("../../../serviceAccountKey.json")
              ),
            });
      }
      
      const db = admin.firestore();

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY!,
      });

      const results: any[] = [];

      for (let i = 0; i < videoIds.length; i++) {
        const id = videoIds[i];
        const platform = idPlatforms[i];

        try {
          let docData: any = null;

          if (platform === "instagram") {
            const doc = await db.collection("short-videos").doc(id).get();
            if (doc.exists) docData = doc.data();
          } else if (platform === "youtube") {
            const doc = await db.collection("yt-videos").doc(id).get();
            if (doc.exists) docData = doc.data();
          }

          if (docData) {
            const caption = docData.caption || "";
            const transcription = docData.transcription || "";
            const combined = `${caption} ${transcription}`.trim();
            results.push({ id, platform, text: combined, docData });
          }
        } catch (err) {
          console.error("Error fetching data for ID:", id, "Platform:", platform, err);
        }
      }

      // Helper: Split text into chunks safely (about 6000 characters per chunk)
      function chunkText(text: string, maxChars = 6000): string[] {
        const chunks: string[] = [];
        for (let i = 0; i < text.length; i += maxChars) {
          chunks.push(text.slice(i, i + maxChars));
        }
        return chunks;
      }

      // Helper: Compute cosine similarity manually
      function cosine(a: number[], b: number[]): number {
        const dot = a.reduce((sum, val, i) => sum + val * b[i], 0);
        const normA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
        const normB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
        return dot / (normA * normB);
      }

      // Embed the answer once
      const answerEmbedding = (
        await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: answer,
        })
      ).data[0].embedding;

      // Prepare all chunks for all videos and keep track of mapping
      const chunkMap: { videoIndex: number; chunkIndex: number }[] = [];
      const allChunks: string[] = [];

      results.forEach((item, videoIndex) => {
        const chunks = chunkText(item.text);
        chunks.forEach((chunk, chunkIndex) => {
          allChunks.push(chunk);
          chunkMap.push({ videoIndex, chunkIndex });
        });
      });

      // Batch embed all chunks in one request
      const chunkEmbeddingsResp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: allChunks,
      });
      const chunkEmbeddings = chunkEmbeddingsResp.data.map((d) => d.embedding);

      // Prepare an array to store the best similarity per video
      const videoBestSims: number[] = Array(results.length).fill(0);

      // Compute similarity per chunk and track the max per video
      chunkEmbeddings.forEach((chunkEmb, i) => {
        const { videoIndex } = chunkMap[i];
        const sim = cosine(answerEmbedding, chunkEmb);
        if (sim > videoBestSims[videoIndex]) videoBestSims[videoIndex] = sim;
      });

      // Assign similarity to each result
      results.forEach((item, idx) => {
        item.similarity = Math.round(videoBestSims[idx] * 10000) / 100;
      });

      // Map results to include sourceUrl instead of text
      const finalResults = results.map((item) => {
        const docData = item.docData; // store docData temporarily while fetching
        return {
          id: item.id,
          platform: item.platform,
          sourceUrl: docData?.sourceUrl ||  "",
          similarity: item.similarity,
        };
      });

      // Sort descending by similarity
      finalResults.sort((a, b) => b.similarity - a.similarity);

      return c.json({ results: finalResults });
    } catch (error) {
      console.error("Error fetching source data:", error);
      return c.json({ error: "Something went wrong while fetching source data." }, 500);
    }
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};

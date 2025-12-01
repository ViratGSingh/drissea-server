import axios from "axios";
import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../../types.js";
import "dotenv/config";
import { OpenAI } from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

interface SerpApiResponse {
  organic?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

export class PineconeSerpData extends OpenAPIRoute {
  schema = {
    tags: ["Serp Search"],
    summary: "Get instagram source links from pinecone",
    request: {
      query: z.object({
        query: Str({
          description: "Search query to fetch Instagram links via SerpAPI",
        }),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved answer",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                query: Str(),
                answer: Str(),
                sourceUrls: z.array(Str()),
              }),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid searchId parameter",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
      "404": {
        description: "Document not found",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                error: Str(),
              }),
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
      return Response.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }
    const data = await this.getValidatedData<typeof this.schema>();
    const { query } = data.query;

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY as string,
    });
    const index = pinecone.Index("ig-reels").namespace("default");

    try {

      // Perform vector search in Pinecone index
      const queryResponse = await index.searchRecords({
  query: {
    inputs: { text: query }, topK: 10 },
    // rerank: {
    //   model: 'bge-reranker-v2-m3',
    //   topN: 2,
    //   rankFields: ['chunk_text'],
    // },
  fields: ['chunk_text'],
});


      return {
        query,
        queryResponse,
        success: true,
      };
    } catch (error: any) {
      console.error("Error fetching Pinecone vector search results:", error);
      return Response.json(
        { error: "Failed to fetch Pinecone vector search results" },
        { status: 500 }
      );
    }
  }
}

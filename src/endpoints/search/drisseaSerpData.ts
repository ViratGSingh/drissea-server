import axios from "axios";
import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../../types.js";
import "dotenv/config";
import { Index } from "@upstash/vector";

interface SerpApiResponse {
  organic?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

export class DrisseaSerpData extends OpenAPIRoute {
  schema = {
    tags: ["Serp Search"],
    summary: "Get instagram source links from upstash vector",
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

    // Initialize Upstash Vector index
    const index = new Index({
      url: process.env.UPSTASH_VECTOR_REST_URL as string,
      token: process.env.UPSTASH_VECTOR_REST_TOKEN as string,
    });

    try {
      // Perform vector search in Upstash Vector index
      const queryResponse = await index.query({
        data: query,
        topK: 10,
        includeMetadata: true,
        includeData: true,
      });

      // Transform response to only include required fields
      const filteredResults = queryResponse.map((item: any) => ({
        id: item.id,
        score: item.score,
        username: item.metadata?.username || null,
        caption: item.metadata?.caption || null,
        permalink: item.metadata?.permalink || null,
        collaborators: item.metadata?.collaborators || [],
        thumbnail_url: item.metadata?.thumbnail_url || null,
        video_url: item.metadata?.video_url || null,
        code: item.metadata?.code || null,
      }));

      return {
        query,
        results: filteredResults,
        success: true,
      };
    } catch (error: any) {
      console.error("Error fetching Upstash vector search results:", error);
      return Response.json(
        { error: "Failed to fetch Upstash vector search results" },
        { status: 500 }
      );
    }
  }
}

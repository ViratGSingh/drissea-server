import axios from "axios";
import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import 'dotenv/config';

interface SerpApiResponse {
  organic?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

export class BraveSerpData extends OpenAPIRoute {
  schema = {
    tags: ["Serp Search"],
    summary: "Get instagram source links from google",
    request: {
      query: z.object({
        query: Str({ description: "Search query to fetch Instagram links via SerpAPI" }),
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

    try {
      const res = await axios.get("https://api.search.brave.com/res/v1/web/search", {
        params: {
          q: `${query} site:instagram.com`,
          country: "IN",
          count: 20
        },
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "x-subscription-token": process.env.BRAVE_API_KEY as string
        }
      });

      const results = res.data.web.results;

      return {
        query,
        results,
        success: true,
      };
    } catch (error: any) {
      console.error("Brave Search API fetch error:", error);
      return Response.json({ error: "Failed to fetch Brave Search results" }, { status: 500 });
    }
  }
}

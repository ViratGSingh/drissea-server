import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../../types.js";
import "dotenv/config";
const { duckDuckGoSearch } = require("../../scrapers/duckduckgo.js");

export class BrowseDuckDuckGoData extends OpenAPIRoute {
  schema = {
    tags: ["General Serp Search"],
    summary: "Get source links from google",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              query: Str({description: "User query to understand and reply"}),
              context: z.string().optional().describe("Background context for the query"),
              country: z.string(),
            }),
          },
        },
      },
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
    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.API_SECRET}`) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const data = await this.getValidatedData<typeof this.schema>();
    const { query, country } = data.body;

    try {
      const results = await duckDuckGoSearch(query, country);

      // Scrape first result's URL for full content via Serper
      if (results.length > 0 && process.env.SERP_API_KEY) {
        try {
          const scrapeRes = await fetch("https://scrape.serper.dev", {
            method: "POST",
            headers: {
              "X-API-KEY": process.env.SERP_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ url: results[0].url }),
          });

          if (scrapeRes.ok) {
            const scrapeData = await scrapeRes.json() as any;
            if (scrapeData.text) {
              results[0].excerpts = scrapeData.text;
            }
          }
        } catch (err) {
          console.error("Serper scrape failed for first result:", err);
        }
      }

      return {
        query,
        results,
        success: true,
      };
    } catch (error: any) {
      console.error("Google search error:", error);
      return {
        query,
        results: [],
        success: false,
        error: error.message || "Failed to fetch Google search results",
      };
    }
  }
}

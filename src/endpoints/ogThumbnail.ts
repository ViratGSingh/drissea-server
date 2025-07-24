import axios from "axios";
import * as cheerio from "cheerio";
import { Bool, OpenAPIRoute, Str, Num } from "chanfana";
import { z } from "zod";
import { type AppContext, Task } from "../types";

export class OgExtract extends OpenAPIRoute {
  schema = {
    tags: ["Metadata"],
    summary: "Extract Open Graph metadata from a URL",
    request: {
      query: z.object({
        url: Str({ description: "Target webpage URL" }),
      }),
    },
    responses: {
      "200": {
        description: "Metadata extracted successfully",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                success: Bool(),
                ogTitle: Str(),
                ogDescription: Str(),
                ogImage: Str().optional(),
                ogUrl: Str(),
                durationMs: Num(),
              }),
            }),
          },
        },
      },
      "400": {
        description: "Bad request due to missing or invalid URL",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                success: Bool(),
                error: Str(),
              }),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error during metadata extraction",
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                success: Bool(),
                error: Str(),
                details: Str(),
              }),
            }),
          },
        },
      },
    },
  };

  async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();

    // Authorization check
    const authHeader = c.req.header("Authorization");
    if (!authHeader || authHeader !== `Bearer ${c.env.API_SECRET}`) {
      return Response.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const targetUrl = data.query.url;
    const start = Date.now();

    try {
      const response = await axios.get(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0",
        },
      });

      const html = response.data;
      const $ = cheerio.load(html);

      const ogTitle = $('meta[property="og:title"]').attr("content") || $("title").text();
      const ogDescription = $('meta[property="og:description"]').attr("content") || "";
      const ogImage = $('meta[property="og:image"]').attr("content");
      const ogUrl = $('meta[property="og:url"]').attr("content") || targetUrl;
      const durationMs = Date.now() - start;

      return {
        success: true,
        ogTitle,
        ogDescription,
        ogImage,
        ogUrl,
        durationMs,
      };
    } catch (err: any) {
      return Response.json(
        {
          success: false,
          error: "Failed to fetch page",
          details: err.message,
        },
        { status: 500 }
      );
    }
  }
}

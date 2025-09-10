import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import 'dotenv/config';

interface AltSerpApiResponse {
  short_video_results?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

interface SerpApiResponse {
  videos?: { link: string }[];
  // Add other fields if needed, like `inline_videos?: { link: string }[]`
}

export class SerpData extends OpenAPIRoute {
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

    const serpUrl = "https://google.serper.dev/videos";
    const altSerpUrl = "https://serpapi.com/search";

    try {
      // const res = await fetch(serpUrl, {
      //   method: "POST",
      //   headers: {
      //     "X-API-KEY": `${process.env.SERP_API_KEY}`,
      //     "Content-Type": "application/json",
      //   },
      //   body: JSON.stringify({
      //     q: `${query} site:instagram.com`,
      //     api_key: process.env.SERP_API_KEY,
      //     num: "20",
      //     gl: "in",
      //     hl: "en",
      //   }),
      // });

      // const json = (await res.json()) as SerpApiResponse;

      // const links = (json?.videos || []).map((item: any) => item.link);
      // const thumbnailLinks = (json?.videos || []).map((item: any) => item.imageUrl);


      const altRes = await fetch(`${altSerpUrl}?q=${encodeURIComponent(query)}+site:instagram.com&api_key=${process.env.ALT_SERP_API_KEY}&engine=google_short_videos`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      const altJson = (await altRes.json()) as AltSerpApiResponse;
      //console.log(altJson);
      const altLinks = (altJson?.short_video_results || []).map((item: any) => item.link);
      const altThumbnailLinks = (altJson?.short_video_results || []).map((item: any) => item.thumbnail);

      return {
        query,
        source_links: altLinks,
        thumbnail_links: altThumbnailLinks,
        success: true,
      };
    } catch (error: any) {
      console.error("SerpAPI fetch error:", error);
      return Response.json({ error: "Failed to fetch SerpAPI results" }, { status: 500 });
    }
  }
}

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

export class UpdSerpData extends OpenAPIRoute {
  schema = {
    tags: ["Serp Search"],
    summary: "Get source links from google",
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

    // Get client IP from headers or connection, fallback to empty string
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      // @ts-ignore
      c.req.raw?.connection?.remoteAddress ||
      "";
    let countryCode = "in";
    let country = "India";
    try {
      let ipapiUrl = "https://ipapi.co";
      if (clientIp) {
        ipapiUrl += `/${clientIp}/json/`;
      } else {
        ipapiUrl += "/json/";
      }
      const ipRes = await fetch(ipapiUrl);
      const ipJson = (await ipRes.json()) as { country_code?: string; country_name?: string; error?: string };
      countryCode = ipJson.country_code ? ipJson.country_code.toLowerCase() : "in";
      country = ipJson.country_name ? ipJson.country_name : "India";
    } catch (err) {
      // If ipapi fails, fallback to default countryCode
      countryCode = "in";
      country = "India";
      console.log("ipapi failed, using fallback countryCode:", countryCode);
    }

    const serpUrl = "https://google.serper.dev/videos";
    const altSerpUrl = "https://serpapi.com/search";

    try {
      const res = await fetch(serpUrl, {
        method: "POST",
        headers: {
          "X-API-KEY": `${process.env.SERP_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          q: `${query}`,
          //api_key: process.env.SERP_API_KEY,
          num: "10",
          gl:countryCode,
          location:country,
          hl: "en",
        }),
      });

      const json = (await res.json()) as SerpApiResponse;

      const links = (json?.videos || [])
        .filter((item: any) => {
          const link = item.link || "";
          if (link.includes("instagram")) return true;
          if (link.includes("youtube") || link.includes("youtu.be")) {
            if (!item.duration) return false;
            const parts = item.duration.split(":").map(Number);
            let hours = 0, minutes = 0, seconds = 0;
            if (parts.length === 3) {
              [hours, minutes, seconds] = parts;
            } else if (parts.length === 2) {
              [minutes, seconds] = parts;
            } else if (parts.length === 1) {
              [seconds] = parts;
            }
            return hours < 1;
          }
          return false;
        })
        .map((item: any) => item.link);
      // const thumbnailLinks = (json?.videos || [])
      //   .filter((item: any) => {
      //     const link = item.link || "";
      //     if (link.includes("instagram")) return true;
      //     if (link.includes("youtube") || link.includes("youtu.be")) {
      //       if (!item.duration) return false;
      //       const parts = item.duration.split(":").map(Number);
      //       let hours = 0, minutes = 0, seconds = 0;
      //       if (parts.length === 3) {
      //         [hours, minutes, seconds] = parts;
      //       } else if (parts.length === 2) {
      //         [minutes, seconds] = parts;
      //       } else if (parts.length === 1) {
      //         [seconds] = parts;
      //       }
      //       return hours < 1;
      //     }
      //     return false;
      //   })
      //   .map((item: any) => item.imageUrl);


      // const altRes = await fetch(`${altSerpUrl}?q=${encodeURIComponent(query)}+site:instagram.com&api_key=${process.env.ALT_SERP_API_KEY}&engine=google_short_videos`, {
      //   method: "GET",
      //   headers: {
      //     "Content-Type": "application/json",
      //   },
      // });
      // const altJson = (await altRes.json()) as AltSerpApiResponse;
      // //console.log(altJson);
      // const altLinks = (altJson?.short_video_results || []).map((item: any) => item.link);
      // const altThumbnailLinks = (altJson?.short_video_results || []).map((item: any) => item.thumbnail);

      return {
        query,
        source_links: links,
        //thumbnail_links: thumbnailLinks,
        success: true,
      };
    } catch (error: any) {
      console.error("SerpAPI fetch error:", error);
      return Response.json({ error: "Failed to fetch SerpAPI results" }, { status: 500 });
    }
  }
}

import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";
import axios from "axios";
import * as cheerio from "cheerio";

export class GetIgSourceData extends OpenAPIRoute {
  schema = {
    tags: ["Instagram Get Source Data"],
    summary: "Get IG content",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              urls: z.array(Str({ description: "List of IG post/reel URLs" })),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully retrieved content",
        content: {
          "application/json": {
            schema: z.object({
              videoUrl: Str(),
              translatedText: Str(),
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
      return c.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const data = await this.getValidatedData<typeof this.schema>();
    const { urls } = data.body;

    const results = await Promise.all(
      urls.map(async (sourceUrl) => {
        if (sourceUrl.includes("/reels/") || sourceUrl.includes("/reel/")) {
          const response = await fetch(
            `https://instagram-scraper-api2.p.rapidapi.com/v1/post_info?code_or_id_or_url=${encodeURIComponent(
              sourceUrl
            )}`,
            {
              method: "GET",
              headers: {
                "x-rapidapi-host": "instagram-scraper-api2.p.rapidapi.com",
                "x-rapidapi-key": `${process.env.IG_RAPID_API_KEY}`,
              },
            }
          );

          if (!response.ok) return null;

          const json = (await response.json()) as { data?: any };
          const videoUrl = json?.data?.video_versions?.[0]?.url ?? "";
          const thumbnailUrl = json?.data?.thumbnail_url ?? "";
          const caption = json?.data?.caption?.text ?? "";
          const username = json?.data?.user?.username ?? "";
          const fullname = json?.data?.user?.full_name ?? "";
          const userId = json?.data?.user?.id ?? "";
          const isVerified = json?.data?.user?.is_verified ?? false;
          const videoDuration = json?.data?.video_duration ?? 0;
          const videoId = json?.data?.code ?? "";

          return {
            sourceUrl: sourceUrl,
            user: {
              id: userId,
              username: username,
              fullname: fullname,
              is_verified: isVerified,
            },
            video: {
              id: videoId,
              duration: videoDuration,
              thumbnail_url: thumbnailUrl,
              video_url: sourceUrl.includes("/p/") ? thumbnailUrl : videoUrl,
              caption: caption,
            },
          };
        } else {
          const response = await axios.get(sourceUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0",
            },
          });

          const html = response.data;
          const $ = cheerio.load(html);

          const ogTitle =
            $('meta[property="og:title"]').attr("content") || $("title").text();
          const ogDescription =
            $('meta[property="og:description"]').attr("content") || "";
          const ogImage = $('meta[property="og:image"]').attr("content");
          const ogUrl =
            $('meta[property="og:url"]').attr("content") || sourceUrl;

          return {
            sourceUrl: sourceUrl,
            user: {
              id: "",
              username: "",
              fullname: "",
              is_verified: "",
            },
            video: {
              id: "",
              duration: 0,
              thumbnail_url: ogImage,
              video_url: "",
              caption: `${ogTitle} | ${ogDescription}`,
            },
          };
        }
      })
    );

    const filteredResults = results.filter(Boolean);

    return c.json({
      data: filteredResults,
      success: true,
    });
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};

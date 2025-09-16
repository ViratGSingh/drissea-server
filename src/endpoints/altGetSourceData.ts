import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";
import YouTube from "youtube-sr";
import axios from "axios";
import { instagramGetUrl, getCSRFToken } from "../scrapers/instagram.js";
import * as cheerio from "cheerio";
import { HttpsProxyAgent } from "https-proxy-agent";

//Wooshir_99_0123456
//wooshir_EAiwa

export class AltGetSourceData extends OpenAPIRoute {
  schema = {
    tags: ["Get Source Data"],
    summary: "Get IG and YT content",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              urls: z.array(Str({ description: "List of IG post/reel URLs" })),
              csrfToken: z.string().optional(),
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
              data: z.array(
                z.object({
                  videoUrl: Str(),
                  translatedText: Str(),
                })
              ),
              csrfToken: Str(),
              success: z.boolean(),
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
    const options = {

    }

    //Setup proxy
    //Bright Data Access
    const proxy_user = process.env.OXY_USERNAME;
    const proxy_host = process.env.OXY_HOST;
    const proxy_port = parseInt(process.env.OXY_PORT ?? "", 10);
    const proxy_passwd = process.env.OXY_PASSWORD;
    
    const proxyUrl = `http://${proxy_user}:${proxy_passwd}@${proxy_host}:${proxy_port}`;
    const httpsAgent = new HttpsProxyAgent(proxyUrl);

    const requestOptions = {
      //agent: httpsAgent,
      headers:{

      },
      agent:httpsAgent
    };


    
    const { urls, csrfToken: incomingCsrfToken } = data.body;

    //Get CSRF Token if not provided
    const csrfToken = incomingCsrfToken ?? (await getCSRFToken());

    const results = await Promise.all(
      urls.map(async (sourceUrl) => {
        try {
          //RnTR2tK_UaOh1qL0tAEkrk

          let response;
          if (sourceUrl.includes("youtube") || sourceUrl.includes("youtu.be")) {
            response = await formatYouTubeData(sourceUrl, requestOptions);
          } else if (sourceUrl.includes("instagram")) {
            response = await instagramGetUrl(sourceUrl, undefined, csrfToken);
          } else {
            response = null;
          }
          return response;
        } catch (err) {
          //console.error(`Error processing URL "${sourceUrl}":`, err);
          return null;
        }
      })
    );

    //const filteredResults = [...results].sort((a, b) => b?.score - a?.score);;

    return c.json({
      data: results,
      csrfToken,
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

export async function formatYouTubeData(url: string, requestOptions: any) {
  let videoData;
  try {
    videoData = await YouTube.getVideo(url, requestOptions);
    const formattedVideoData = {
    sourceUrl: videoData.url,
    has_audio: true,
    user: {
      username: videoData.channel?.name || "",
      fullname: "",
      id: videoData.channel?.id || "",
      is_verified: videoData.channel?.verified || false,
      total_media: 1,
      total_followers: videoData.channel?.subscribers || 0,
    },
    video: {
      id: videoData.id,
      duration: videoData.duration / 1000, // convert ms to seconds if needed
      thumbnail_url: videoData.thumbnail?.url || "",
      video_url: videoData.url,
      views: videoData.views || 0,
      plays: videoData.views || 0,
      timestamp: videoData.uploadedAt
        ? Math.floor(new Date(videoData.uploadedAt).getTime() / 1000)
        : 0,
      caption: videoData.title || "",
    },
  };

  return formattedVideoData;
  } catch (err) {
    const formattedErrVideoData = {
    sourceUrl: (err as Error).message,
    has_audio: true,
    user: {
      username: "",
      fullname: "",
      id: "",
      is_verified:  false,
      total_media: 1,
      total_followers:  0,
    },
    video: {
      id: "",
      duration:1000, // convert ms to seconds if needed
      thumbnail_url: "",
      video_url: "",
      views: 0,
      plays:  0,
      timestamp:  0,
      caption:  "",
    },
  };

  return formattedErrVideoData;
  }

  
}

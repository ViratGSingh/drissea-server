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
    const options = {};

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
      headers: {},
      agent: httpsAgent,
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
            response = await fetchYouTubeVideoData(sourceUrl);
            const sampleYtResp = await fetchYouTubeVideoData(sourceUrl);
            console.log(sampleYtResp)
          } 
          else if (sourceUrl.includes("instagram")) {
            response = await instagramGetUrl(sourceUrl, undefined, csrfToken);
          } 
          else {
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

export async function fetchYouTubeVideoData(url: string): Promise<any> {
  try {
    const config = {
      method: 'GET',
      url,
      httpsAgent: new HttpsProxyAgent(
        `http://${process.env.OXY_USERNAME}:${process.env.OXY_PASSWORD}@${process.env.OXY_HOST}:${process.env.OXY_PORT}`
      ),
    };
    const response = await axios.request(config);
    const html = response.data;
    const $ = cheerio.load(html);

    // Extract ytInitialData
    const ytInitialDataMatch = html.match(/var ytInitialData = (.*?);<\/script>/s);
    let ytInitialData = null;
    if (ytInitialDataMatch && ytInitialDataMatch[1]) {
      ytInitialData = JSON.parse(ytInitialDataMatch[1]);
    }

    // Extract ytInitialPlayerResponse
    const ytInitialPlayerResponseMatch = html.match(/var ytInitialPlayerResponse = (.*?);<\/script>/s);
    let ytInitialPlayerResponse = null;
    if (ytInitialPlayerResponseMatch && ytInitialPlayerResponseMatch[1]) {
      ytInitialPlayerResponse = JSON.parse(ytInitialPlayerResponseMatch[1]);
    }

    // Extract basic video details
    const videoDetails = ytInitialPlayerResponse?.videoDetails || {};
    const microformat = ytInitialPlayerResponse?.microformat?.playerMicroformatRenderer || {};

    // Extract owner info if available
    const ownerProfile = ytInitialPlayerResponse?.videoDetails?.author || null;
    const channelId = ytInitialPlayerResponse?.videoDetails?.channelId || null;

    // Extract likes and dislikes from videoActions or other available fields
    let likes = null;
    let dislikes = null;
    try {
      const videoActions = ytInitialPlayerResponse?.engagementPanels || [];
      // Fallback: likes might be in videoDetails or other parts, but YouTube often hides dislikes
      // So we try to find likes count in videoDetails or elsewhere
      if (ytInitialPlayerResponse?.videoDetails?.likeCount) {
        likes = parseInt(ytInitialPlayerResponse.videoDetails.likeCount, 10);
      }
    } catch (e) {
      // ignore errors
    }

    // Determine privacy status, unlisted, nsfw, live, shorts
    const isPrivate = ytInitialPlayerResponse?.playabilityStatus?.status === "PRIVATE" || false;
    const isUnlisted = microformat?.liveBroadcastDetails?.isUnlisted || false;
    const isLive = microformat?.liveBroadcastDetails?.isLiveNow || false;

    // NSFW detection is not straightforward; YouTube does not explicitly mark videos as NSFW in this data
    // We'll set it to false as default
    const isNsfw = false;

    // Shorts detection: check if url contains "/shorts/"
    const isShorts = url.includes("/shorts/");
    return {
      sourceUrl: url,
      has_audio: true,
      user: {
        username: "",
        fullname: ownerProfile || "",
        id: channelId || "",
        is_verified: false,
        total_media: 1,
        total_followers: 0,
      },
      video: {
        id: videoDetails.videoId || "",
        duration: (parseInt(videoDetails.lengthSeconds || "0", 10)) || 0,
        thumbnail_url: videoDetails.thumbnail?.thumbnails?.[0]?.url || "",
        video_url: url,
        views: parseInt(videoDetails.viewCount || "0", 10),
        plays: parseInt(videoDetails.viewCount || "0", 10),
        timestamp: microformat.uploadDate
          ? Math.floor(new Date(microformat.uploadDate).getTime() / 1000)
          : 0,
        caption: videoDetails.title || "",
      },
    };
  } catch (e) {
    return null;
  }
}

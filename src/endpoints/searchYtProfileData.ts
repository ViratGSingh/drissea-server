import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";
import { HttpsProxyAgent } from "https-proxy-agent";
import axios from "axios";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || "",
});

export class YoutubeProfileSearchData extends OpenAPIRoute {
  schema = {
    tags: ["Youtube Search Agent"],
    summary: "Search Youtube and give snippet info",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              query: Str({ description: "Search query" }),
              userQuery: Str({ description: "User query" }),
              channelId: z.string().optional(),
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
              success: z.boolean(),
              query: Str(),
              data: z.array(z.any()),
              excerpts: z.array(
                z.object({
                  videoId: Str(),
                  title: Str(),
                  transcript: Str(),
                  startTimestamp: Str().nullable(),
                  endTimestamp: Str().nullable(),
                  snippet: Str(),
                })
              ),
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
    const { query, userQuery, channelId } = data.body;
  

    const apiKey = process.env.YOUTUBE_API_KEY;

    if (!apiKey) {
      return c.json(
        { success: false, error: "Missing Google API Key" },
        { status: 500 }
      );
    }

    try {
      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/search",
        {
          params: {
            part: "snippet",
            q: `${query}`,
            key: apiKey,
            maxResults: 10,
            channelId: channelId || "UCBJycsmduvYEL83R_U4JriQ",
            type: "video",
          },
        }
      );

      const items = response.data.items || [];
      
      // Select best videos (max 3)
      const bestVideoIds = await selectBestVideos(items, userQuery);
      const bestItems = items.filter((i: any) => bestVideoIds.includes(i.id.videoId));
      
      const data = await Promise.all(
        bestItems.map(async (bestItem: any) => {
          const videoId = bestItem.id.videoId;
          const transcript = await getTranscript(videoId);
          const fullTranscript = transcript || "";
          const best = await extractBestExcerpt(fullTranscript, userQuery);
          
          return {
            videoId,
            title: bestItem.snippet.title,
            //transcript: fullTranscript,
            startTimestamp: best.startTimestamp,
            endTimestamp: best.endTimestamp,
            snippet: `${best.excerpt}`,
            thumbnail: bestItem.snippet.thumbnails.high.url??bestItem.snippet.thumbnails.medium.url??bestItem.snippet.thumbnails.default.url,
            channelTitle: bestItem.snippet.channelTitle,
            channelId: bestItem.snippet.channelId,
            description:bestItem.snippet.description
          };
        })
      );

      return c.json({
        success: true,
        query,
        userQuery,
        //country,
        //data: items,
        data,
      });
    } catch (error: any) {
      console.error(
        "YouTube API Error:",
        error?.response?.data || error.message
      );
      return c.json(
        {
          success: false,
          error: "YouTube API Error",
          details: error?.response?.data || error.message,
        },
        { status: 500 }
      );
    }
  }
}

async function getTranscript(videoId: string): Promise<string | null> {
  try {
    const myHeaders = new Headers();
    myHeaders.append("X-API-KEY", process.env.SERP_API_KEY??"");
    myHeaders.append("Content-Type", "application/json");

    const raw = JSON.stringify({
      "url": `https://www.youtube.com/watch?v=${videoId}`
    });

    const requestOptions: RequestInit = {
      method: "POST",
      headers: myHeaders,
      body: raw,
      redirect: "follow"
    };

    const response = await fetch(`https://scrape.serper.dev`, requestOptions);

    const transcriptData = (await response.json()) as any;
    const transcript = transcriptData?.text;
    return transcript;

  } catch (e) {
    console.error(`Error fetching transcript for ${videoId}:`, e);
    return null;
  }
}

async function extractBestExcerpt(
  transcript: string,
  userQuery: string
): Promise<{ excerpt: string; startTimestamp: string | null; endTimestamp: string | null }> {
  if (!transcript) {
    return { excerpt: "", startTimestamp: null, endTimestamp: null };
  }

  // Fallback to simple heuristic if no API key configured
  if (!process.env.GROQ_API_KEY) {
    const fallbackExcerpt = transcript.slice(0, 280);
    return { excerpt: fallbackExcerpt, startTimestamp: null, endTimestamp: null };
  }

  // Limit transcript size to keep within model context
  const MAX_CHARS = 8000;
  const trimmedTranscript =
    transcript.length > MAX_CHARS ? transcript.slice(0, MAX_CHARS) : transcript;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an assistant that reads YouTube transcripts and a user query. " +
            "Return a strict JSON object with fields: excerpt (string), start_timestamp (string), end_timestamp (string). " +
            "1. 'excerpt': A single string containing all relevant information from the transcript to fully answer the user's query. It should be comprehensive, max 1000 characters. " +
            "2. 'start_timestamp' & 'end_timestamp': Select the time range where the video *visually demonstrates* or shows what the user needs to see to understand the answer. " +
            "Focus on the part that is most visually helpful, rather than just the spoken answer. " +
            "Timestamps must be in HH:MM:SS or MM:SS format. " +
            "IMPORTANT: Adjust start_timestamp to be 5-10 seconds BEFORE this visual segment begins for context."
            ,
        },
        {
          role: "user",
          content: JSON.stringify({
            user_query: userQuery,
            transcript: trimmedTranscript,
          }),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as {
      excerpt?: string;
      start_timestamp?: string;
      end_timestamp?: string;
    };

    const excerpt = parsed.excerpt && parsed.excerpt.length > 0
      ? parsed.excerpt
      : trimmedTranscript.slice(0, 280);

    return {
      excerpt,
      startTimestamp: parsed.start_timestamp || null,
      endTimestamp: parsed.end_timestamp || null,
    };
  } catch (e) {
    console.error("Error extracting best excerpt with LLM:", e);
    return {
      excerpt: transcript.slice(0, 280),
      startTimestamp: null,
      endTimestamp: null,
    };
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};

async function selectBestVideos(items: any[], userQuery: string): Promise<string[]> {
  if (!items || items.length === 0) return [];
  if (!process.env.GROQ_API_KEY) return [items[0].id.videoId];

  const candidates = items.map((item, index) => ({
    index,
    title: item.snippet.title,
    description: item.snippet.description,
  }));

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are an intelligent assistant. Given a user query and a list of YouTube videos (title, description), select the most relevant videos (up to 3) that are likely to contain the answer. " +
            "Return a strict JSON object with a single field: 'bestIndices' (array of numbers). " +
            "Sort the indices by relevance. " +
            "If NO video is relevant, return an empty array.",
        },
        {
          role: "user",
          content: JSON.stringify({
            user_query: userQuery,
            videos: candidates,
          }),
        },
      ],
    });

    const raw = completion.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw);
    const bestIndices = Array.isArray(parsed.bestIndices) ? parsed.bestIndices : [];
    
    return bestIndices
      .map((idx: any) => items[idx]?.id?.videoId)
      .filter((id: any) => id); // Filter out undefined if index is out of bounds
  } catch (e) {
    console.error("Error selecting best videos:", e);
    return [];
  }
}

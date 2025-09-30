import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";

export class GenGeneralSearchQuery extends OpenAPIRoute {
  schema = {
    tags: ["Search"],
    summary: "Generate Instagram Search Query",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              task: Str(),
              previousQuestion: z.string().optional(),
              previousAnswer: z.string().optional(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully retrieved generated query",
        content: {
          "application/json": {
            schema: z.object({
              query: Str(),
              success: z.literal(true),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid task parameter",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
              success: z.literal(false),
            }),
          },
        },
      },
      "401": {
        description: "Unauthorized",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
              success: z.literal(false),
            }),
          },
        },
      },
      "500": {
        description: "Internal server error",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
              success: z.literal(false),
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
    const task = data.body.task;

    //Set Basic User Context Data
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      // @ts-ignore
      c.req.raw?.connection?.remoteAddress ||
      "";
    let countryCode = "in";
    let userContext = "";
    let ipJson: {
      city?: string;
      region?: string;
      country_name?: string;
      country_code?: string;
      timezone?: string;
      org?: string;
      postal?: string;
      latitude?: number;
      longitude?: number;
      ip?: string;
      error?: string;
    };
    try {
      let ipapiUrl = `https://ipapi.co`;
      if (clientIp) {
        ipapiUrl += `/${clientIp}/json/?key=${process.env.IPAPI_API_KEY}`;
      } else {
        ipapiUrl += `/json/?key=${process.env.IPAPI_API_KEY}`;
      }
      const ipRes = await fetch(ipapiUrl);
      const ipJson: {
        city?: string;
        region?: string;
        country_name?: string;
        country_code?: string;
        timezone?: string;
        org?: string;
        postal?: string;
        latitude?: number;
        longitude?: number;
        ip?: string;
        error?: string;
      } = await ipRes.json();
      countryCode = ipJson.country_code
        ? ipJson.country_code.toLowerCase()
        : "in";
      // Extract all relevant fields
      const {
        city,
        region,
        country_name,
        country_code,
        timezone,
        org,
        postal,
        latitude,
        longitude,
        ip,
      } = ipJson;
      // Compute local datetime string
      let datetimeStr = "";
      if (timezone) {
        try {
          datetimeStr = new Intl.DateTimeFormat("en-US", {
            dateStyle: "full",
            timeStyle: "long",
            timeZone: timezone,
          }).format(new Date());
        } catch (e) {
          datetimeStr = "";
        }
      }
      // Build human-readable user context string
      userContext =
        (country_code ? `Country Code: ${country_code}\n` : "") +
        (country_name ? `Country Name: ${country_name}\n` : "") +
        (region ? `Region: ${region}\n` : "") +
        (city ? `City: ${city}\n` : "") +
        (timezone ? `Timezone: ${timezone}\n` : "") +
        (datetimeStr && timezone
          ? `Date: ${new Intl.DateTimeFormat(undefined, {
              dateStyle: "full",
              timeZone: timezone,
            }).format(new Date())}\n`
          : "") +
        (datetimeStr && timezone
          ? `Time: ${new Intl.DateTimeFormat(undefined, {
              timeStyle: "long",
              timeZone: timezone,
            }).format(new Date())}\n`
          : "") +
        (org ? `ISP/Org: ${org}\n` : "") +
        (ip ? `IP: ${ip}\n` : "") +
        (postal ? `Postal: ${postal}\n` : "") +
        (latitude && longitude
          ? `Approximate Coordinates: ${latitude},${longitude}\n`
          : "");
      userContext = userContext.trim();
      if (!userContext) userContext = "";
    } catch (err) {
      // If ipapi fails, fallback to default countryCode and unavailable context
      countryCode = "in";
      userContext = "User context unavailable";
    }

    if (!task || typeof task !== "string" || task.trim() === "") {
      return c.json(
        { error: "No task provided", success: false },
        { status: 400 }
      );
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    let queryTypeLabel = "social";
    //Get type of query
    try {
      const chatCompletion = await groq.chat.completions.create({
        model: "gemma2-9b-it",
        messages: [
          {
            role: "system",
            content: `
            You are an AI that classifies user search queries into two types: General or Social. Analyze the query for intent and content. General is for queries strictly seeking factual information unlikely to be found as videos on Instagram or YouTube, such as academic facts, definitions, statistics, or location-specific services (e.g., population data, business hours, technical specs). Social is for all other queries, especially those likely need or prefer video or opinion-based content on Instagram/YouTube, such as trends, reviews, tutorials, or lifestyle topics. If unsure, default to Social. Output ONLY the query type as a single word (e.g., General).

Additionally, you have the following user context:
${userContext}

The user previously asked:
${data.body.previousQuestion || "N/A"}

And the previous answer was:
${data.body.previousAnswer || "N/A"}

`,
          },
          {
            role: "user",
            content: task,
          },
        ],
        temperature: 1,
        max_completion_tokens: 256,
        top_p: 1,
        stream: false,
        stop: null,
      });

      queryTypeLabel = (chatCompletion.choices[0]?.message?.content ?? "").trim().toLowerCase();

    } catch (error) {
    }

    //Get search query
    try {
      const chatCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content: `You are an Instagram video search query generator.

Your job: rewrite the user's request into ONE short, high-impact search query that captures the main subject.

Rules:
Be like a top Google searcher.
Remove unnecessary details, adjectives, and filler words.
Avoid any mention of content medium (like reels, videos, posts).
Use only the exact words and spellings provided in the user's request, without altering or modifying any terms.
Do not add, remove, or substitute any words unless explicitly present in the user's input.
Ensure the query is concise and directly reflects the main subject of the request.
Provide only the search query as the response, nothing else.

Additionally, you have the following user context:
${userContext}

The user previously asked:
${data.body.previousQuestion || "N/A"}

And the previous answer was:
${data.body.previousAnswer || "N/A"}

When vague terms like "near me" or "around here" are used, then replace them with the actual city or location details from the user context.
When vague terms like "right now" are used, then replace them with specific part of the day (e.g., "morning," "night") based on the user's current local time from the user context.
If the user already specifies a clear location or time in the query, do not alter or add extra context information — keep exactly what the user wrote.`,
          },
          {
            role: "user",
            content: task,
          },
        ],
        temperature: 1,
        max_completion_tokens: 256,
        top_p: 1,
        stream: false,
        stop: null,
      });

      const query = (chatCompletion.choices[0]?.message?.content ?? "").trim();

      return c.json({
        query,
        "type":queryTypeLabel,
        success: true,
      });
    } catch (error) {
      return c.json(
        { error: "Failed to generate query", success: false },
        { status: 500 }
      );
    }
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};

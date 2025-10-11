import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";

export class UpdGenSearchQuery extends OpenAPIRoute {
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
              isSearchMode: z.boolean().optional(),
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

    try {
      const chatCompletion = await groq.chat.completions.create({
        model: "openai/gpt-oss-20b",
        messages: [
          {
            role: "system",
            content: `You are an intelligent query reformulator and optimizer for Google Search.

Your task is to rewrite the user's input into a single, precise Google search query that best captures the intent behind the question or statement, so that Google can return the most relevant and accurate results.

You can use the provided user information, previous question, and previous answer only to understand the topic and intent — not to copy or alter words from them directly.

Guidelines:
- Return only one concise, reformulated Google search query.
- Capture the essence of what the user wants to know.
- Make it short, clear, and optimized for Google's understanding.
- You may simplify, rephrase, or generalize while keeping the same meaning.
- Keep it under 256 characters.
- Avoid natural phrasing like a full sentence or question — make it a keyword-style query.
- The output must contain only the optimized search query — nothing else.

Example:
User: "did tiktok primarily promote its app on Instagram at the start?"
Output: "how did tiktok launch on instagram"

User context:
${userContext}

Previous question:
${data.body.previousQuestion || "N/A"}

Previous answer:
${data.body.previousAnswer || "N/A"}
`,
          },
          {
            role: "user",
            content: task,
          },
        ],
        temperature: 0,
        //max_completion_tokens: 256,
        top_p: 1,
        stream: false,
        stop: null,
      });

      const query = (chatCompletion.choices[0]?.message?.content ?? "").trim();

      return c.json({
        query,
        success: true,
      });
    } catch (error) {
      return c.json(
        { error: "Failed to generate query", success: false, message:error },
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

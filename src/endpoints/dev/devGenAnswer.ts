import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../../types.js";
import Groq from "groq-sdk";
import 'dotenv/config';

export class DevGenAnswer extends OpenAPIRoute {
  schema = {
    tags: ["Answer Generator"],
    summary: "Generate an answer based on IG/YT video content",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              query: Str(),
              results: z.array(
                z.object({
                  title: Str(),
                  url: Str(),
                  excerpts: Str(),
                })
              ),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Generated answer",
        content: {
          "application/json": {
            schema: z.object({
              content: Str(),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid parameters",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
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
        401
      );
    }
    try {
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
      });
      const data = await this.getValidatedData<typeof this.schema>();
      const { query, results } = data.body;
      
      let totalTokens = 0;
      const formattedSources = results
        .map((r, i) => {
          const tokens = r.title.length + r.excerpts.length;
          if (totalTokens + tokens > 125000) {
            return null;
          }
          totalTokens += tokens;
          return `(${i + 1}) Content Url:\n${r.url}\nContent:${r.title} ${r.excerpts}`;
        })
        .filter(Boolean)
        .join("\n\n");

    //Set Basic User Context Data
    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      // @ts-ignore
      c.req.raw?.connection?.remoteAddress ||
      "";
    let countryCode = "in";
    let userContext = "";
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
      countryCode = ipJson.country_code ? ipJson.country_code.toLowerCase() : "in";
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
        ip
      } = ipJson;
      // Compute local datetime string
      let datetimeStr = "";
      if (timezone) {
        try {
          datetimeStr = new Intl.DateTimeFormat('en-US', {
            dateStyle: 'full',
            timeStyle: 'long',
            timeZone: timezone
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
        (datetimeStr && timezone ? `Date: ${new Intl.DateTimeFormat(undefined, { dateStyle: 'full', timeZone: timezone }).format(new Date())}\n` : "") +
        (datetimeStr && timezone ? `Time: ${new Intl.DateTimeFormat(undefined, { timeStyle: 'long', timeZone: timezone }).format(new Date())}\n` : "") +
        (org ? `ISP/Org: ${org}\n` : "") +
        (ip ? `IP: ${ip}\n` : "") +
        (postal ? `Postal: ${postal}\n` : "") +
        (latitude && longitude ? `Approximate Coordinates: ${latitude},${longitude}\n` : "");
      userContext = userContext.trim();
      if (!userContext) userContext = "User context unavailable";
    } catch (err) {
      // If ipapi fails, fallback to default countryCode and unavailable context
      countryCode = "in";
      userContext = "User context unavailable";
    }

    // Insert user context info into prompt
    const userContextInfo = `\n\nUser Context:\n${userContext}`;

      const systemPrompt = `
You are Drissea, a social answer engine that watches short videos from social media to answer user queries.

You are a helpful assistant that answers user questions using a list of insights extracted from search results.

You are given brief content summaries from multiple search results.

Your job is to write a detailed, readable answer in **Markdown format** based only on the Caption/Transcript/Video Description available. Follow these rules:

1. ✅ Structure the response clearly using Markdown syntax (e.g., headings, bullets, bold/italics for emphasis).
2. ✅ **Bold key insights** and highlight notable places, dishes, or experiences.
3. ✅ For any place, food item, or experience featured in a video, wrap the **main word or phrase** (not the whole sentence) in this Markdown hyperlink format:  
   "[text to show](<reel_link>)"  
   Example: Try the **[Dum Pukht Biryani](https://instagram.com/reel/abc123)** for something royal.
4. ✅ For every factual claim or key insight derived from the video content, ALWAYS include an inline citation by wrapping the relevant **phrase or word** in a Markdown hyperlink pointing to the source's "Content Url". Use the format:  
   "[claim text](<Content Url>)"
   Example: The **[spiciest ramen](https://www.instagram.com/reel/DNBzgOhsDr5/)** is a must-try.  
   Ensure the citation is concise and blends naturally into the sentence.
5. ✅ Write naturally as if you're recommending or informing — never say “based on search results” or “these videos say.”
6. ✅ Only use Caption/Transcript/Video Description that directly answers the query. The answer must align exactly with the query.
7. ✅ If no strong or direct matches are found, gracefully say:  
   _"There doesn’t seem to be a direct answer available from the content reviewed."_
8. ❌ Do not repeat the question or use generic filler lines.
9. ⚡ Keep your language short, engaging, and optimized for mobile readability.

Here's the user context:
${userContext}

Here’s the video content:
${formattedSources}
`;

      const chatCompletion = await groq.chat.completions.create({
        model: "deepseek-r1-distill-llama-70b", //"openai/gpt-oss-120b"
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: query,
          },
        ],
        temperature: 0.3,
        max_completion_tokens: 3000,
        top_p: 0.95,
        stream: true,
      });

      let content = "";
      for await (const chunk of chatCompletion) {
        const delta = chunk.choices[0]?.delta?.content || "";
        content += delta;
      }
      return c.json({ content });
    } catch (error) {
      console.error("Error in IGGenAnswer route:", error);
      return c.json({ error: "Something went wrong while generating the answer." }, 500);
    }
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};

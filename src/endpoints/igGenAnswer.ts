import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import Groq from "groq-sdk";
import 'dotenv/config';

export class IGGenAnswer extends OpenAPIRoute {
  schema = {
    tags: ["Instagram Answer Generator"],
    summary: "Generate an answer based on IG video content",
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
                  snippet: Str(),
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

      const formattedSources = results
        .map((r, i) => `(${i + 1}) Content Url:\n${r.url}\nContent:${r.title} ${r.snippet}`)
        .join("\n\n");

      const systemPrompt = `You are a helpful and concise assistant that answers user questions using a list of insights extracted from short videos and posts.

You are given brief content summaries from multiple videos/posts. Each including a caption, video description and audio description from the respective short video

Your job is to write a clean, readable answer based only on the Caption/Transcript/Video Description available. Follow these rules:

1. ✅ Structure the response clearly
2. ✅ **Bold key insights** and highlight notable places, dishes, or experiences.
3. ✅ For any place, food item, or experience that was featured in a video, wrap the **main word or phrase** (not the whole sentence) in this format:  
   \`[text to show](<reel_link>)\`
   Example: Try the **[Dum Pukht Biryani](https://instagram.com/reel/abc123)** for something royal.
4. ✅ Write naturally as if you're recommending or informing — never say “based on search results” or “these videos say.”
5. From the Caption/Transcript/Video Description available, only use those that exactly answers the query. And the answer should be exactly according to the query
6. ✅ If no strong or direct matches are found, gracefully say:  
   _"There doesn’t seem to be a direct answer available from the content reviewed."_
6. ❌ Do not repeat the question or use generic filler lines.
7. ⚡ Keep your language short, engaging, and optimized for mobile readability.

Here’s the video content:
${formattedSources}`;

      const chatCompletion = await groq.chat.completions.create({
        model: "deepseek-r1-distill-llama-70b",
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
        max_tokens: 1500,
        top_p: 0.95,
        stream: false,
      });

      const content = chatCompletion.choices[0]?.message?.content || "";
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

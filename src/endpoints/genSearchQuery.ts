import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";

export class GenIGSearchQuery extends OpenAPIRoute {
  schema = {
    tags: ["Search"],
    summary: "Generate Instagram Search Query",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              task: Str(),
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

    if (!task || typeof task !== "string" || task.trim() === "") {
      return c.json(
        { error: "No task provided", success: false },
        { status: 400 }
      );
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    try {
      const chatCompletion = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:"You are an Instagram video search query generator.\n\nYour job: rewrite the user's request into ONE short, high-impact search query that captures the main subject.\n\nRules: \nBe like a top Google searcher.\nRemove unnecessary details, adjectives, and filler words.\nAvoid any mention of content medium (like reels, videos, posts).\nUse only the exact words and spellings provided in the user's request, without altering or modifying any terms.\nDo not add, remove, or substitute any words unless explicitly present in the user's input.\nEnsure the query is concise and directly reflects the main subject of the request.\nProvide only the search query as the response, nothing else.",
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

      const query = (chatCompletion.choices[0]?.message?.content??"").trim();

      return c.json({
        query,
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

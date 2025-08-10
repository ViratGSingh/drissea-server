import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";
import axios from "axios";
import { instagramGetUrl, getCSRFToken } from "../scrapers/instagram.js";
import * as cheerio from "cheerio";

//Wooshir_99_0123456
//wooshir_EAiwa

export class AltGetIgSourceData extends OpenAPIRoute {
  schema = {
    tags: ["Instagram Get Source Data"],
    summary: "Get IG content",
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
    const { urls, csrfToken: incomingCsrfToken } = data.body;

    //Get CSRF Token if not provided
    const csrfToken = incomingCsrfToken ?? (await getCSRFToken());

    const results = await Promise.all(
      urls.map(async (sourceUrl) => {
        try {
          //RnTR2tK_UaOh1qL0tAEkrk
          const response = await instagramGetUrl(sourceUrl, undefined, csrfToken);
          return response;
        } catch (err) {
          //console.error(`Error processing URL "${sourceUrl}":`, err);
          return null;
        }
      })
    );

    const filteredResults = results.filter(Boolean);

    return c.json({
      data: filteredResults,
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

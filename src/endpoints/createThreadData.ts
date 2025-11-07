import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";

export class CreateThreadData extends OpenAPIRoute {
  schema = {
    tags: ["Drissea Thread"],
    summary: "Save Drissea Thread Data",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              data: z.record(z.any()),
              id: z.string(),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully retrieved video and translation",
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

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(
          require("../../serviceAccountKey.json")
        ),
      });
    }

    const data = await this.getValidatedData<typeof this.schema>();
    const firestore = admin.firestore();

    const sessionData = {
      ...data.body.data,
    };

    const docRef = firestore.collection("threads").doc(data.body.id);
    await docRef.set(sessionData);

    return c.json({
      success: true,
      id: docRef.id,
    });
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};

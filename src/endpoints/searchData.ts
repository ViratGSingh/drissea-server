import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import 'dotenv/config';
import admin from "firebase-admin";

export class SearchData extends OpenAPIRoute {
  schema = {
    tags: ["Answer"],
    summary: "Get answer by searchId from Firestore",
    request: {
      query: z.object({
        searchId: Str({ description: "Firestore document ID in 'answers' collection" }),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved answer",
        success:true,
        content: {
          "application/json": {
            schema: z.object({
              series: z.object({
                query: Str(),
                answer: Str(),
                sourceUrls: z.array(Str()),
              }),
            }),
          },
        },
      },
      "400": {
        success:false,
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
        success:false,
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
        success:false,
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
    const { searchId } = data.query;

    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential:  admin.credential.cert(require("../../serviceAccountKey.json")),
        });
      }

      const docRef = admin.firestore().collection("answers").doc(searchId);
      const doc = await docRef.get();

      if (!doc.exists) {
        return c.json({ error: "Document not found" }, { status: 404 });
      }

      const dataDoc = doc.data();

      const query = dataDoc?.query || "";
      const answer = dataDoc?.answer || "";
      const processText = dataDoc?.process || "";
      const sourceUrls = dataDoc?.source_links || [];

      return {
        query,
        process: processText,
        answer,
        sourceUrls,
      };
    } catch (error: any) {
      console.error("Firestore REST error:", error);
      return c.json({ error: "Internal server error" }, { status: 500 });
    }
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};

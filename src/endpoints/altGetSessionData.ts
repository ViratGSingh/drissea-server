import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";
import admin from "firebase-admin";

export class AltGetSessionData extends OpenAPIRoute {
  schema = {
    tags: ["Drissea Session"],
    summary: "Get Drissea Session Data",
    request: {
      query: z.object({
        id: z
          .string()
          .describe("Document ID of the session in the sessions collection"),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved session data",
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(true),
              id: z.string(),
              results: z.array(
                z.object({
                  answer: z.string().optional(),
                  userQuery: z.string().optional(),
                  influence: z.array(z.any()).optional(),
                  local: z.array(z.any()).optional(),
                  sourceImageDescription: z.string().optional(),
                  sourceImageLink: z.string().optional(),
                  createdAt: z.any().optional(),
                  updatedAt: z.any().optional(),
                })
              ),
            }),
          },
        },
      },
      "404": {
        description: "Session not found",
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(false),
              error: z.string(),
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
    const { id } = data.query;
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(
            require("../../serviceAccountKey.json")
          ),
        });
      }
      const docRef = admin.firestore().collection("threads").doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return c.json(
          { success: false, error: "Session not found" },
          { status: 404 }
        );
      }
      const sessionData = doc.data();
      
      const results = (sessionData?.results ?? []).map((result: any) => ({
        answer: result.answer,
        userQuery: result.userQuery,
        influence: result.influence,
        local: result.local,
        sourceImageDescription: result.sourceImageDescription,
        sourceImageLink: result.sourceImageLink,
        createdAt: result.createdAt,
        updatedAt: result.updatedAt,
      }));

      return c.json(
        {
          success: true,
          id: doc.id,
          results: results,
        },
        { status: 200 }
      );
    } catch (error: any) {
      console.error("Firestore REST error:", error);
      return c.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  }
}

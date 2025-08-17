import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import 'dotenv/config';
import admin from "firebase-admin";

export class GetSessionData extends OpenAPIRoute {
  schema = {
    tags: ["Drissea Session"],
    summary: "Get Drissea Session Data",
    request: {
      query: z.object({
        sessionId: z.string().describe("Document ID of the session in the sessions collection"),
      }),
    },
    responses: {
      "200": {
        description: "Successfully retrieved session data",
        content: {
          "application/json": {
            schema: z.object({
              success: z.literal(true),
              session: z.object({
                sessionId: z.string(),
                sourceUrls: z.array(z.string()),
                videos: z.array(z.string()),
                questions: z.array(z.string()),
                searchTerms: z.array(z.string()),
                answers: z.array(z.string()),
                understandDuration: z.number(),
                searchDuration: z.number(),
                fetchDuration: z.number(),
                extractDuration: z.number(),
                createdAt: z.string(),
                updatedAt: z.string(),
              }),
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
    const { sessionId } = data.query;
    try {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(require("../../serviceAccountKey.json")),
        });
      }
      const docRef = admin.firestore().collection("sessions").doc(sessionId);
      const doc = await docRef.get();
      if (!doc.exists) {
        return c.json(
          { success: false, error: "Session not found" },
          { status: 404 }
        );
      }
      const sessionData = doc.data();
      // Compose the session object with all expected fields
      const session = {
        sessionId: doc.id,
        sourceUrls: sessionData?.sourceUrls ?? [],
        videos: sessionData?.videos ?? [],
        questions: sessionData?.questions ?? [],
        searchTerms: sessionData?.searchTerms ?? [],
        answers: sessionData?.answers ?? [],
        understandDuration: sessionData?.understandDuration ?? 0,
        searchDuration: sessionData?.searchDuration ?? 0,
        fetchDuration: sessionData?.fetchDuration ?? 0,
        extractDuration: sessionData?.extractDuration ?? 0,
        createdAt: sessionData?.createdAt ?? "",
        updatedAt: sessionData?.updatedAt ?? "",
      };
      return c.json(
        {
          success: true,
          session,
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

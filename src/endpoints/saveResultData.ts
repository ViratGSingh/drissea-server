import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { initFirebase } from "../firebase";
import { type AppContext } from "../types";

export class SaveResultData extends OpenAPIRoute {
  schema = {
    tags: ["Answer"],
    summary: "Save answer data to Firestore",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              query: Str(),
              process: Str(),
              answer: Str(),
              sourceUrls: z.array(Str()),
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully saved answer",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
            }),
          },
        },
      },
      "400": {
        description: "Missing or invalid request body",
        content: {
          "application/json": {
            schema: z.object({
              error: Str(),
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
    if (!authHeader || authHeader !== `Bearer ${c.env.API_SECRET}`) {
      return Response.json(
        {
          success: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const data = await this.getValidatedData<typeof this.schema>();
    const { query, process, answer, sourceUrls } = data.body;

    const firestoreDoc = {
      fields: {
        created_at: { timestampValue: new Date().toISOString() },
        updated_at: { timestampValue: new Date().toISOString() },
        query: { stringValue: query },
        process: { stringValue: process },
        answer: { stringValue: answer },
        source_links: {
          arrayValue: {
            values: sourceUrls.map((link) => ({ stringValue: link })),
          },
        },
      },
    };

    try {
      const projectId = c.env.FIREBASE_PROJECT_ID;
      const apiKey = c.env.FIREBASE_API_KEY;
      const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/answers?key=${apiKey}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(firestoreDoc),
      });

      if (!res.ok) throw new Error("Failed to save answer");
      const resJson = (await res.json()) as { name?: string };
      const documentId = resJson?.name?.split('/').pop();

      return Response.json({ success: true, id: documentId });
    } catch (error) {
      console.error("Firestore save error:", error);
      return Response.json(
        { success: false, error: "Internal server error" },
        { status: 500 }
      );
    }
  }
}
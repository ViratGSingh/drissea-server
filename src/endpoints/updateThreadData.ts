import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";
import admin from "firebase-admin";

export class UpdateThreadData extends OpenAPIRoute {
  schema = {
    tags: ["Drissea Session"],
    summary: "Update Drissea Session Data",
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

    const sessionId = data.body.id;
    const docRef = firestore.collection("threads").doc(sessionId);
    const docSnap = await docRef.get();
    if (!docSnap.exists) {
      return c.json(
        {
          success: false,
          error: "Session not found",
        },
        { status: 404 }
      );
    }

    // Only update the rest of the fields, and set updatedAt. Do NOT overwrite createdAt.
    const sessionData = {
      ...data.body.data,
    };

    await docRef.update(sessionData);

    return c.json({
      success: true,
      id: sessionId,
    });
  }
}


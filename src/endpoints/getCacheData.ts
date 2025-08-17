import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import "dotenv/config";
import admin from "firebase-admin";

export class GetCacheData extends OpenAPIRoute {
  schema = {
    tags: ["Transcribe Instagram Video Data"],
    summary: "Watch IG video and transcribe its audio",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              sourceUrls: z.array(z.string()),
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
    const sourceUrls = data.body.sourceUrls;

    if (!Array.isArray(sourceUrls) || sourceUrls.length === 0) {
      return c.json(
        { error: "No sourceUrls provided", success: false },
        { status: 400 }
      );
    }

    const firestore = admin.firestore();

    const videosWithTranscription = await Promise.all(
      sourceUrls.map(async (sourceUrl) => {
        const querySnapshot = await firestore
          .collection("short-videos")
          .where("sourceUrl", "==", sourceUrl)
          .limit(1)
          .get();

        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          const data = doc.data() || {};
          return {
            sourceUrl,
            user: {
              id: data.userId ?? "",
              username: data.username ?? "",
              fullname: data.fullname ?? "",
              is_verified: data.isVerified ?? false,
            },
            video: {
              id: data.videoId ?? "",
              duration: data.duration ?? 0,
              thumbnail_url: data.thumbnailUrl ?? "",
              video_url: data.videoUrl ?? "",
              caption: data.caption ?? "",
              transcription: data.transcription ?? "",
              framewatch: data.framewatch ?? "",
              timestamp: data.timestamp ?? 0,
            },
          };
        } else {
          return {
            sourceUrl,
            user: {
              id: "",
              username: "",
              fullname: "",
              is_verified: false,
            },
            video: {
              id: "",
              duration: 0,
              thumbnail_url: "",
              video_url: "",
              caption: "",
              transcription: "",
              framewatch: "",
              timestamp: 0,
            },
          };
        }
      })
    );

    return c.json({
      data: videosWithTranscription,
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

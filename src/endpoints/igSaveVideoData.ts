import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import 'dotenv/config';

export class IGSaveVideoData extends OpenAPIRoute {
  schema = {
    tags: ["Instagram Backup Data"],
    summary: "Save IG creator and reel data to Firestore",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              videoId: Str(),
              caption: Str(),
              translatedText: Str(),
              videoUrl: Str(),
              thumbnailUrl: Str(),
              username: Str(),
              fullname: Str(),
              userId: Str(),
              isVerified: z.boolean(),
              videoDuration: z.number()
            }),
          },
        },
      },
    },
    responses: {
      "200": {
        description: "Successfully saved creator and reel data",
        content: {
          "application/json": {
            schema: z.object({
              success: z.boolean(),
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

    const data = await this.getValidatedData<typeof this.schema>();
    const {
      videoId,
      caption,
      translatedText,
      videoUrl,
      thumbnailUrl,
      username,
      fullname,
      userId,
      isVerified,
      videoDuration,
    } = data.body;

    // Firestore checks and saves in parallel
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const firebaseKey = process.env.FIREBASE_API_KEY;

    const creatorIndexUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/creators/${userId}?key=${firebaseKey}`;
    const reelIndexUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/reels/${videoId}?key=${firebaseKey}`;

    
      try {
        const creatorRes = await fetch(creatorIndexUrl);
        if (creatorRes.status === 404) {
          await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/creators?documentId=${userId}&key=${firebaseKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: {
                username: { stringValue: username },
                fullname: { stringValue: fullname },
                is_verified: { booleanValue: isVerified },
                fullwatch: { booleanValue: true },
                ongoing: { booleanValue: false },
                initial_index: { booleanValue: true },
                videos: { integerValue: "1" },
                collection_id: { stringValue: "" },
                profile_pic_url: { stringValue: "" },
                city: { stringValue: "bengaluru" },
                user_id: { stringValue: userId },
                created_at: { timestampValue: (() => {
                  const date = new Date();
                  const istOffset = 5.5 * 60 * 60 * 1000;
                  return new Date(date.getTime() + istOffset).toISOString().replace("Z", "+05:30");
                })() },
                updated_at: { timestampValue: (() => {
                  const date = new Date();
                  const istOffset = 5.5 * 60 * 60 * 1000;
                  return new Date(date.getTime() + istOffset).toISOString().replace("Z", "+05:30");
                })() }
              },
            }),
          });
        }

        const reelRes = await fetch(reelIndexUrl);
        if (reelRes.status === 404) {
          await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/reels?documentId=${videoId}&key=${firebaseKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fields: {
                videoId: { stringValue: videoId },
                caption: { stringValue: caption },
                transcript: { stringValue: translatedText },
                videoUrl: { stringValue: videoUrl },
                thumbnailUrl: { stringValue: thumbnailUrl },
                uploadDate: {
                  timestampValue: (() => {
                    const date = new Date();
                    const istOffset = 5.5 * 60 * 60 * 1000;
                    return new Date(date.getTime() + istOffset).toISOString().replace("Z", "+05:30");
                  })(),
                },
                scoreMeta: { doubleValue: 0 },
                bestUseCases: { arrayValue: { values: [] } },
                categories: { arrayValue: { values: [] } },
                contentType: { stringValue: "" },
                embeddingNamespace: { stringValue: userId },
                embeddingRef: { stringValue: videoId },
                featureTags: { arrayValue: { values: [] } },
                framewatch: { stringValue: "" },
                hashtags: { arrayValue: { values: [] } },
                language: { stringValue: "" },
                vibeTags: { arrayValue: { values: [] } },
                duration: {doubleValue: videoDuration},
                locationInfo: {
                  mapValue: {
                    fields: {
                      area: { nullValue: null },
                      city: { nullValue: null },
                      lat: { nullValue: null },
                      lng: { nullValue: null },
                      locationTag: { nullValue: null },
                      placeName: { nullValue: null },
                    },
                  },
                },
                creator: {
                  mapValue: {
                    fields: {
                      username: { stringValue: username },
                      fullname: { stringValue: fullname },
                      profile_pic_url: { stringValue: "" },
                      user_id: { stringValue: userId },
                    },
                  },
                },
              },
            }),
          });
        }
      return c.json({
        success: true,
      });
      } catch (e) {
        return c.json({
          success: false,
          error:"Unable to check/update data"
        });
      }
    

    
  }
}

type Answer = {
  created_at: string;
  process: string;
  reply: string;
  source_links: string[];
};

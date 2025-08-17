import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";

export class ExtractIGVideoData extends OpenAPIRoute {
  schema = {
    tags: ["Transcribe Instagram Video Data"],
    summary: "Watch IG video and transcribe its audio",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              videos: z.array(z.record(z.any())),
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
    const videos = data.body.videos;

    if (!Array.isArray(videos) || videos.length === 0) {
      return c.json(
        { error: "No videos provided", success: false },
        { status: 400 }
      );
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const firestore = admin.firestore();

    // Run all transcriptions in parallel with Promise.all
    const videosWithTranscription = await Promise.all(
      videos.map(async (video) => {
        // Extract video ID from video_url or link
        const videoId = video?.video?.id ?? "";

        if (videoId) {
          const docRef = firestore.collection("short-videos").doc(videoId);
          const doc = await docRef.get();

          if (doc.exists) {
            const data = doc.data() || {};
            return {
              ...video,
              video: {
                ...video.video,
                framewatch: data.framewatch ?? "",
                transcription: data.transcription ?? "",
              },
            };
          }
        }

        let framewatchText = "";
        try {
          const chatCompletion = await groq.chat.completions.create({
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: "Describe this image vivdly in detail, mention each and every detail and text written in it",
                  },
                  {
                    type: "image_url",
                    image_url: { url: video.video.thumbnail_url },
                  },
                ],
              },
            ],
            model: "meta-llama/llama-4-scout-17b-16e-instruct",
            temperature: 1,
            max_completion_tokens: 1024,
            top_p: 1,
            stream: false,
            stop: null,
          });
          framewatchText = chatCompletion.choices[0].message.content ?? "";
        } catch {
          framewatchText = "";
        }

        if (
          !video.has_audio &&
          !video.video?.video_url &&
          (video.video.duration ?? 0) <= 10
        ) {
          // If no audio or no video_url or duration less than or equal to 10 seconds, skip transcription
          const resultVideo = {
            ...video,
            video: {
              ...video.video,
              transcription: "",
              framewatch: framewatchText,
            },
          };

          await firestore
            .collection("short-videos")
            .doc(videoId)
            .set({
              sourceUrl: video?.sourceUrl ?? "",
              hasAudio: video?.has_audio ?? false,
              username: video?.user?.username ?? "",
              fullname: video?.user?.fullname ?? "",
              userId: video?.user?.id ?? "",
              isVerified: video?.user?.is_verified ?? false,
              totalMedia: video?.user?.total_media ?? 0,
              totalFollowers: video?.user?.total_followers ?? 0,
              videoId: video?.video?.id ?? "",
              duration: video?.video?.duration ?? 0,
              thumbnailUrl: video?.video?.thumbnail_url ?? "",
              videoUrl: video?.video?.video_url ?? "",
              views: video?.video?.views ?? 0,
              plays: video?.video?.plays ?? 0,
              timestamp: video?.video?.timestamp ?? 0,
              caption: video?.video?.caption ?? 0,
              framewatch: framewatchText,
              transcription: "",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

          return resultVideo;
        }
        try {
          const transcriptResponse = await groq.audio.translations.create({
            url: video.video.video_url,
            model: "whisper-large-v3",
            response_format: "json",
            temperature: 0.0,
          });
          const resultVideo = {
            ...video,
            video: {
              ...video.video,
              transcription: transcriptResponse.text,
              framewatch: framewatchText,
            },
          };
          await firestore
            .collection("short-videos")
            .doc(videoId)
            .set({
              sourceUrl: video?.sourceUrl ?? "",
              hasAudio: video?.has_audio ?? false,
              username: video?.user?.username ?? "",
              fullname: video?.user?.fullname ?? "",
              userId: video?.user?.id ?? "",
              isVerified: video?.user?.is_verified ?? false,
              totalMedia: video?.user?.total_media ?? 0,
              totalFollowers: video?.user?.total_followers ?? 0,
              videoId: video?.video?.id ?? "",
              duration: video?.video?.duration ?? 0,
              thumbnailUrl: video?.video?.thumbnail_url ?? "",
              videoUrl: video?.video?.video_url ?? "",
              views: video?.video?.views ?? 0,
              plays: video?.video?.plays ?? 0,
              timestamp: video?.video?.timestamp ?? 0,
              caption: video?.video?.caption ?? 0,
              framewatch: framewatchText,
              transcription: transcriptResponse.text,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            });

          return resultVideo;
        } catch (error) {
          // On error, return the video with transcription null and maybe an error message
          const resultVideo = {
            ...video,
            video: {
              ...video.video,
              transcription: "",
              framewatch: framewatchText,
            },
          };
          if (videoId) {
            await firestore
              .collection("short-videos")
              .doc(videoId)
              .set({
                sourceUrl: video?.sourceUrl ?? "",
                hasAudio: video?.has_audio ?? false,
                username: video?.user?.username ?? "",
                fullname: video?.user?.fullname ?? "",
                userId: video?.user?.id ?? "",
                isVerified: video?.user?.is_verified ?? false,
                totalMedia: video?.user?.total_media ?? 0,
                totalFollowers: video?.user?.total_followers ?? 0,
                videoId: video?.video?.id ?? "",
                duration: video?.video?.duration ?? 0,
                thumbnailUrl: video?.video?.thumbnail_url ?? "",
                videoUrl: video?.video?.video_url ?? "",
                views: video?.video?.views ?? 0,
                plays: video?.video?.plays ?? 0,
                timestamp: video?.video?.timestamp ?? 0,
                caption: video?.video?.caption ?? 0,
                framewatch: framewatchText,
                transcription: "",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              });
          }
          return resultVideo;
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

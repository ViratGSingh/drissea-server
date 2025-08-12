import { OpenAPIRoute, Str } from "chanfana";
import { z } from "zod";
import { type AppContext } from "../types.js";
import { Groq } from "groq-sdk";
import "dotenv/config";
import admin from "firebase-admin";

export class WatchIGVideoData extends OpenAPIRoute {
  schema = {
    tags: ["Framewatch Instagram Video Data"],
    summary: "Watch IG video frame",
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
    const data = await this.getValidatedData<typeof this.schema>();
    const videos = data.body.videos;

    if (!Array.isArray(videos) || videos.length === 0) {
      return c.json(
        { error: "No videos provided", success: false },
        { status: 400 }
      );
    }

    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    // Run all transcriptions in parallel with Promise.all
    const videosWithTranscription = await Promise.all(
      videos.map(async (video) => {
        if (!video.has_audio && !video.video?.video_url && (video.video.duration ?? 0) <= 10) {
          // If no audio or no video_url or duration less than or equal to 10 seconds, skip transcription
          return { ...video, video: { ...video.video, transcription: "" } };
        }
        try {
          const transcriptResponse = await groq.audio.translations.create({
            url: video.video.video_url,
            model: "whisper-large-v3",
            response_format: "json",
            temperature: 0.0,
          });
          return { ...video, video: { ...video.video, transcription: transcriptResponse.text } };
        } catch (error) {
          // On error, return the video with transcription null and maybe an error message
          return {
            ...video,
            video: { ...video.video, transcription: "" },
            transcription_error: "Error transcribing",
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
